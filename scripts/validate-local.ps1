<#
.SYNOPSIS
    Local static validator for the Fluyt Claude Code + Codex plugin marketplace.

.DESCRIPTION
    This PowerShell 5.1-compatible script is the local gate before pushing. CI runs authoritative
    Claude validation plus this dual-package gate; this catches the same classes of mistake early.

    On the toolchain this assumes: Node, npm and the `claude` CLI are expected locally;
    `markdownlint-cli2` and PSScriptAnalyzer may not be, which is why section [10] greps instead of
    linting and why CI remains the only gate for those two. This script deliberately invokes
    neither `claude` nor Node, so it keeps running wherever they are absent. Tool availability
    varies by machine; check with `where.exe <tool>` from a real PowerShell (the agent Bash tool can
    resolve tools the real machine lacks).

    What this catches early:
      - Claude and Codex marketplace/plugin manifests parse with required fields
      - the Codex manifest uses strict SemVer matching CHANGELOG.md
      - every declared plugin source directory exists
      - every SKILL.md has frontmatter with `name:` matching its directory + a non-empty `description:`
      - every SKILL.md and agent `description:` (folded, as a `>-` block scalar folds) is measured
        in characters against the Agent Skills specification's 1024-char cap, warning at 900 chars -
        `claude plugin validate` does NOT check this (manifests only, as of claude CLI 2.1.220), so
        this is the ONLY enforcement of the cap anywhere in this toolchain
      - all sixteen shipped skills and six canonical roles are packaged, reachable through
        dispatch-role, and registered across the four consumer-facing docs that name them
      - the shipped hooks.json is packaged (presence) and parses
      - zero project facts under plugins/, enforced PRIMARILY by shape: a heuristic flags
        slug-shaped identifiers, framework/runtime/build-tool names and absolute paths, and judges
        each finding against scripts/plugin-vocabulary-allowlist.txt (the plugin's own legitimate
        vocabulary). Identifying tokens are caught by the local pre-push hook
        scripts/hooks/pre-push, reading a private file outside the repo
      - a NARROW markdown pre-flight for the markdownlint rules most likely to slip past local review
        (MD018, MD049/MD050, MD004, MD060, MD028, MD026) - a tripwire, not a substitute for
        markdownlint-cli2, which only CI can run because the linter package may not be installed
        locally. Target state (not yet built): run the real linter
        here when it is present, falling back to these greps when it is not
      - every Markdown file directly in a skill directory (SKILL.md and the reference files a
        skill splits out) and every agent file stays within its byte budget in
        scripts/component-size-budget.txt - a ratchet, check [12]

    Run from the repo root:  powershell -NoProfile -File scripts/validate-local.ps1
    Exit code 0 = green; 1 = one or more failures.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$script:Failures = 0
$script:Warnings = 0

# Write-Host, not Write-Output: TestComponentFrontmatter below is called as `$result =
# TestComponentFrontmatter ...` - PowerShell assignment captures a FUNCTION'S ENTIRE OUTPUT STREAM,
# not just its `return` value, so every Write-Output a called function makes (including these three,
# called from inside it) would silently vanish into the captured variable instead of printing, while
# $script:Failures/$script:Warnings would still increment - a gate that reports the right verdict but
# goes mute on WHICH file failed. Write-Host always writes straight to the console, bypassing the
# success-output stream entirely, so it is immune to being swallowed by a caller's assignment - and
# every EXISTING bare-statement call site (the vast majority, never captured) is unaffected: both
# cmdlets print identically there.
function Fail {
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingWriteHost', '',
        Justification = 'deliberate - assignment-capture immunity; see the rationale comment above')]
    param([string]$msg)
    Write-Host "  FAIL: $msg"
    $script:Failures++
}
function Pass {
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingWriteHost', '',
        Justification = 'deliberate - assignment-capture immunity; see the rationale comment above')]
    param([string]$msg)
    Write-Host "  ok:   $msg"
}
function Warn {
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingWriteHost', '',
        Justification = 'deliberate - assignment-capture immunity; see the rationale comment above')]
    param([string]$msg)
    # A warning never reddens the gate: it must NEVER touch $script:Failures or the exit code - see
    # the RESULT banner at the bottom, which reports $script:Warnings separately from $script:Failures.
    Write-Host "  WARN: $msg"
    $script:Warnings++
}

# Extract the YAML frontmatter block (text between the first two `---` fences).
# Returns $null if there is no leading frontmatter block.
function Get-Frontmatter([string]$text) {
    # Normalise newlines so ^---$ matches regardless of CRLF/LF.
    $t = $text -replace "`r`n", "`n"
    if ($t -notmatch "^---\n") { return $null }
    $m = [regex]::Match($t, "(?s)^---\n(.*?)\n---")
    if ($m.Success) { return $m.Groups[1].Value }
    return $null
}

# Read a top-level scalar key from a YAML frontmatter block. Handles plain scalars
# (`name: value`) and folded/block scalars (`description: >-` with an indented body).
# Returns $null when the key is absent or its value is empty.
function Get-YamlScalar([string]$frontmatter, [string]$key) {
    $lines = ($frontmatter -replace "`r`n", "`n") -split "`n"
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if ($line -match "^$([regex]::Escape($key))\s*:\s*(.*)$") {
            $val = $Matches[1].Trim()
            # Folded/literal block scalar: value continues on indented following lines.
            if ($val -eq '>' -or $val -eq '>-' -or $val -eq '|' -or $val -eq '|-') {
                $collected = @()
                for ($j = $i + 1; $j -lt $lines.Count; $j++) {
                    if ($lines[$j] -match '^\s+\S') { $collected += $lines[$j].Trim() }
                    elseif ($lines[$j].Trim() -eq '') { continue }
                    else { break }
                }
                $joined = ($collected -join ' ').Trim()
                if ($joined) { return $joined } else { return $null }
            }
            # Strip surrounding quotes on a plain scalar.
            $val = $val.Trim('"', "'")
            if ($val) { return $val } else { return $null }
        }
    }
    return $null
}

# Test a repo-relative path against a list of ignore prefixes. Separator-normalised (forward slashes)
# so the result is identical on Windows and on CI's ubuntu pwsh - a literal '\.git\' regex would
# match only Windows path separators (see the host self-identification comment near the top of the script - report only, never branch).
# A prefix matches at the path's start OR after any path segment, so '.claude/'
# matches both a top-level '.claude/...' path and (defensively) a nested one.
function Test-RepoPathIgnored([string]$repoRelativePath, [string[]]$prefixes) {
    $rel = $repoRelativePath.Replace('\', '/')
    foreach ($prefix in $prefixes) {
        if ($rel.StartsWith($prefix) -or $rel.Contains("/$prefix")) { return $true }
    }
    return $false
}

# Extract the 'Current version: **X.Y.Z**' line from a CHANGELOG.md-shaped file. Shared by [3] (the
# Codex mirror check) and [8] (the consistency check), so a format change to the line
# `versioning-and-changelog` owns needs one edit. Returns $null when the file is missing, unreadable, or has no such
# line; callers keep their OWN (deliberately different) Fail messages for that condition, since one
# names the Codex mirror check and the other the CHANGELOG heading check.
function Get-ChangelogCurrentVersion([string]$path) {
    if (-not (Test-Path $path)) { return $null }
    # -Encoding UTF8: see the [4] skills-loop comment below for the ANSI-codepage rationale.
    $text = Get-Content $path -Raw -Encoding UTF8
    $m = [regex]::Match($text, 'Current version:\s*\*\*([0-9]+\.[0-9]+\.[0-9]+)\*\*')
    if ($m.Success) { return $m.Groups[1].Value }
    return $null
}

# Assert a folded frontmatter 'description' against the Agent Skills specification's cap. Must be
# called with the SAME folded value Get-YamlScalar returns above (never a raw/unfolded count) - the
# spec enforces $script:DescMaxChars characters on that folded value (`claude plugin validate` does
# NOT check this - manifests only, as of claude CLI 2.1.220), and measures characters, not bytes
# (an em dash is 3 UTF-8 bytes but 1 character; byte-counting would over-report the true count).
# Warns at $script:DescWarnChars so a description trending toward the cap is visible before it trips
# the cap, but per the Warn() contract a WARN never fails the gate. Dashless name deliberately:
# 'Assert-' / 'Check-' are not PSScriptAnalyzer-approved verbs, and an unhyphenated function name
# (like Fail/Pass above) is not subject to PSUseApprovedVerbs at all.
#
# One known blind spot: this trusts Get-YamlScalar's fold, which trims each continuation line before
# joining. Real YAML keeps a blank line or a more-indented continuation line literally inside a `>-`
# scalar; Get-YamlScalar's trim would instead strip/collapse it, under-counting vs. the real folded
# length. No description in this repo does that today.
function CheckDescriptionLength([string]$desc, [string]$label) {
    if (-not $desc) { return }
    $len = $desc.Length
    if ($len -gt $script:DescMaxChars) {
        Fail "$label description is $len chars (folded) - exceeds the $($script:DescMaxChars)-char cap (Agent Skills spec)"
    } elseif ($len -ge $script:DescWarnChars) {
        Warn "$label description is $len chars (folded) - $($script:DescMaxChars - $len) chars below the $($script:DescMaxChars)-char cap (Agent Skills spec)"
    } else {
        Pass "$label description length $len chars (folded, cap $($script:DescMaxChars), Agent Skills spec)"
    }
}

# Shared frontmatter check for a skill/agent component, called once per file from the [4] skills loop
# and the [5] agents loop below: read UTF-8 -> Get-Frontmatter -> null-guard -> name-vs-location ->
# description-present -> CheckDescriptionLength.
# $label is the already-formatted path fragment used in every message ("<dir>/SKILL.md" for [4],
# "agents/<file>.md" for [5]) - built at the call site, since each loop's own path-building logic
# (directory name vs. filename-without-extension) stays exactly where it was. $expectedName is what
# the frontmatter 'name' must equal (the skill's directory name, or the agent's base filename).
# Returns $null when the frontmatter block itself is missing/unparseable (nothing else can be checked
# then); otherwise a [pscustomobject] with Name/Frontmatter/Content, so [5]'s two agent-only
# assertions ('tools', 'Skills consulted') - which have no skill-side counterpart, so this helper does
# NOT grow an unused branch for [4] - can run at the call site against the SAME parsed frontmatter and
# raw content this helper already read, instead of re-reading the file a second time.
#
# -Encoding UTF8 is required here: under Windows PowerShell 5.1 (one of the two supported
# interpreters), Get-Content with no -Encoding and no BOM falls back to the system ANSI codepage, not
# UTF-8. A multi-byte UTF-8 character (e.g. an em dash) then mis-decodes into one ANSI "char" per
# original byte, so $desc.Length would silently report the UTF-8 BYTE count instead of the true
# character count - the exact over-report CheckDescriptionLength must never produce (it would wrongly
# FAIL a description that is actually within the Agent Skills spec's cap). pwsh 7 already defaults
# Get-Content to UTF-8, so this is a no-op there - the gate then behaves identically on both hosts.
function TestComponentFrontmatter([string]$filePath, [string]$expectedName, [string]$label) {
    $content = Get-Content $filePath -Raw -Encoding UTF8
    $fm = Get-Frontmatter $content
    if ($null -eq $fm) { Fail "$label has no YAML frontmatter block"; return $null }
    $name = Get-YamlScalar $fm 'name'
    $desc = Get-YamlScalar $fm 'description'
    if (-not $name) { Fail "$label frontmatter missing 'name'" }
    elseif ($name -ne $expectedName) { Fail "$label name '$name' != expected '$expectedName'" }
    else { Pass "$label name matches" }
    if (-not $desc) { Fail "$label frontmatter 'description' missing or empty" } else { Pass "$label has description" }
    CheckDescriptionLength $desc $label
    return [pscustomobject]@{ Name = $name; Frontmatter = $fm; Content = $content }
}

# Load a one-token-per-line data file: blank lines and '#' comment lines are ignored, every other
# line is taken verbatim (trimmed) as a token. Shared by the one-token-per-line data files - the
# plugin-vocabulary allowlist and the component-size budget use the identical format, and two copies
# of this loader would be two places for that format to drift apart. Returns $null when the file is missing, unreadable
# or empty; otherwise an array (possibly zero-length, when every line is a comment). Missing and
# unreadable deliberately collapse into ONE return value: both mean "this guard has no data source"
# and both must fail closed, and only the caller knows which file it asked for, so each caller
# words its own Fail. The `, @(...)` return is not decoration - a bare empty array returned from a
# PowerShell function unrolls to $null at the call site, which would make a comments-only file
# indistinguishable from a missing one and mis-word the Fail that follows.
function Get-TokenFileEntry([string]$path) {
    if (-not (Test-Path $path)) { return $null }
    # -Encoding UTF8: see the [4] skills-loop comment above for the ANSI-codepage rationale.
    $lines = Get-Content $path -Encoding UTF8 -ErrorAction SilentlyContinue
    if ($null -eq $lines) { return $null }
    return , @($lines | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') })
}

# The heuristic half of [7]: return every project-fact-SHAPED finding on ONE line of a payload file,
# minus whatever the plugin-vocabulary allowlist exempts. Each finding is a {Signal, Text} pair -
# Text is the exact matched substring, which is BOTH what gets reported and what the allowlist is
# compared against, so a maintainer can copy a reported token straight into the allowlist file.
#
# The three signals, and why these three: a project fact leaks into plugins/ as a NAME (a repo slug
# or project name, conventionally a mixed-case compound), as a STACK token (the framework, runtime or
# build tool that name is built with), or as a PATH (someone's checkout). Each is defined by
# $script:SlugSignalRegex / $script:StackSignalRegex / $script:PathSignalRegex, declared in the [7]
# section below rather than up here with $KebabRegex - the same split CheckDescriptionLength and
# $script:DescMaxChars already use, and it keeps the whole tuning surface (signals + allowlist load
# + scan) in one contiguous block for whoever is tuning it.
#
# Precision beats recall here, deliberately: a gate that cries wolf gets forced past, which teaches the
# maintainer to ignore a red. Every filter
# below suppresses a false positive on clean prose.
function Get-ProjectFactFinding([string]$line, [string[]]$allowedVocabulary) {
    $found = @()
    foreach ($m in [regex]::Matches($line, $script:SlugSignalRegex)) {
        $token = $m.Value
        # Short mixed-case words are overwhelmingly prose noise, not slugs.
        if ($token.Length -lt $script:SlugMinLength) { continue }
        # -creplace, NOT -replace: PowerShell's -replace is case-INsensitive, so '[^A-Z]' would mean
        # "not a letter at all" there and both counts below would be meaningless.
        # Two-plus capitals AND at least one lowercase is what makes a token compound-shaped: it
        # drops ALL-CAPS prose emphasis (this repo's house style is full of it) and hex colour
        # literals like the label colours in the shipped github-labels.ps1 template.
        if (($token -creplace '[^A-Z]', '').Length -lt 2) { continue }
        if (($token -creplace '[^a-z]', '').Length -lt 1) { continue }
        # An inflected acronym ('POSTing', 'FAILs', 'READMEs') is prose, not a slug. Without this the
        # allowlist would grow with every word capitalised for emphasis - churn unrelated to the
        # plugin's vocabulary, the reflexive-append habit this whole check exists to stop. Known blind spot, accepted: a slug of the same shape
        # (a 2+ letter acronym followed by <= 3 lowercase letters, e.g. 'APIhub') is not flagged.
        if ($token -cmatch $script:AcronymInflectionRegex) { continue }
        $found += [pscustomobject]@{ Signal = 'slug-shaped identifier'; Text = $token }
    }
    foreach ($m in [regex]::Matches($line, $script:StackSignalRegex)) {
        $found += [pscustomobject]@{ Signal = 'framework/build-tool name'; Text = $m.Value }
    }
    foreach ($m in [regex]::Matches($line, $script:PathSignalRegex)) {
        $found += [pscustomobject]@{ Signal = 'absolute path'; Text = $m.Value }
    }
    # -notcontains is case-INsensitive in PowerShell, and that is the intended semantics - see the
    # FORMAT header in scripts/plugin-vocabulary-allowlist.txt. `, @(...)`: see Get-TokenFileEntry.
    return , @($found | Where-Object { $allowedVocabulary -notcontains $_.Text })
}

# Resolve repo root as the parent of this script's directory.
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot
Write-Output "Fluyt local validation - root: $RepoRoot"
# Self-identify the host: the script runs under Windows PowerShell 5.1 or PowerShell 7, and CI runs
# it under `pwsh` on ubuntu-latest - see the [4] skills-loop comment for the
# host-divergence rationale. Report only, never branch. 5.1's $PSVersionTable has no 'OS' key.
$HostEdition = $PSVersionTable.PSEdition
$HostProduct = if ($HostEdition -eq 'Core') { 'PowerShell' } else { 'Windows PowerShell' }
Write-Output "  host: $HostProduct $($PSVersionTable.PSVersion) (PSEdition $HostEdition) on $([System.Environment]::OSVersion.VersionString)"
Write-Output ""

$KebabRegex = '^[a-z0-9]+(-[a-z0-9]+)*$'
$StrictSemVerRegex = '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
# The Agent Skills specification caps a frontmatter 'description' at 1024 characters on the FOLDED
# value - see CheckDescriptionLength above. `claude plugin validate` does NOT enforce this at all
# (manifests only, as of claude CLI 2.1.220); this repo's CI has no equivalent check either.
# $DescWarnChars is a local-only early-warning tier the spec itself has no such tier for; the gate
# must never be stricter than the spec, so FAIL is strictly-above ($DescMaxChars itself still
# passes) while $DescWarnChars..($DescMaxChars) is WARN, non-blocking.
$script:DescMaxChars = 1024
$script:DescWarnChars = 900
# Physical payload root: where SKILL.md / agents / hooks.json actually live on disk. This is the
# repo's own directory layout - NOT metadata.pluginRoot (that key is unrelated to where the payload
# physically lives; see the [2] plugin-source resolution below). This constant covers the SCAN ROOTS
# only ([4]/[5]/[6]/[7]'s Get-ChildItem calls, plus the [3] Codex manifest path and [5] dispatch-role
# path Join-Paths below) - it is NOT "stated once" for every 'plugins/fluyt' occurrence in this
# file. Two literals remain deliberately and are NOT exceptions to fix: the [3] Codex source.path
# comparison (asserts against a manifest's OWN declared string, not a scan root) and the [10]
# $mdIgnorePrefixes entry (a path-prefix filter, not a scan root).
$PayloadRoot = "plugins"

# --- 1. marketplace.json -----------------------------------------------------
Write-Output "[1] marketplace.json"
$marketplacePath = Join-Path $RepoRoot ".claude-plugin/marketplace.json"
$marketplace = $null
if (-not (Test-Path $marketplacePath)) {
    Fail ".claude-plugin/marketplace.json not found"
} else {
    try {
        # -Encoding UTF8: see the ANSI-codepage rationale in the [4] skills-loop comment below -
        # PowerShell 5.1's Get-Content default is the system ANSI codepage, not UTF-8; pwsh 7 already
        # defaults to UTF-8, so this is a no-op there and the gate behaves identically on both hosts.
        $marketplace = Get-Content $marketplacePath -Raw -Encoding UTF8 | ConvertFrom-Json
        Pass "parses"
    } catch {
        Fail "does not parse as JSON: $_"
    }
}

if ($marketplace) {
    if (-not $marketplace.name) { Fail "marketplace 'name' missing" }
    elseif ($marketplace.name -notmatch $KebabRegex) { Fail "marketplace name '$($marketplace.name)' is not kebab-case" }
    else { Pass "name '$($marketplace.name)' kebab-case" }

    if (-not $marketplace.owner) { Fail "marketplace 'owner' missing" } else { Pass "owner present" }
    if (-not $marketplace.plugins -or $marketplace.plugins.Count -lt 1) { Fail "marketplace 'plugins' array empty" } else { Pass "$($marketplace.plugins.Count) plugin(s) declared" }
    # Regression guard: metadata.pluginRoot is documented by the schema but NOT honoured by the
    # Claude Code client, which resolves a plugin's 'source' relative to the marketplace root
    # regardless. Reintroducing this key is actively risky, not just inert: combined with the
    # (correct) 'source' resolution below it would resolve to plugins/plugins/fluyt, turning
    # a new-install failure into one that also breaks already-working installs.
    if ($marketplace.metadata -and ($marketplace.metadata.PSObject.Properties.Name -contains 'pluginRoot')) {
        Fail "marketplace metadata carries a 'pluginRoot' field - unhonoured by the client and risks resolving to plugins/plugins/fluyt once combined with a source path"
    } else {
        Pass "marketplace metadata has no 'pluginRoot' field"
    }
}

Write-Output ""

# --- 2. each plugin -----------------------------------------------------------
Write-Output "[2] plugins"
$claudePluginSourceDir = $null
if ($marketplace -and $marketplace.plugins) {
    foreach ($p in $marketplace.plugins) {
        if (-not $p.name) { Fail "a plugin entry has no 'name'"; continue }
        if ($p.name -notmatch $KebabRegex) { Fail "plugin name '$($p.name)' is not kebab-case" }

        # Resolve the plugin directory: 'source' is relative to the MARKETPLACE root (this repo
        # root, which contains .claude-plugin/) - NOT metadata.pluginRoot. The official schema
        # documents this literally ("Path to the plugin root, relative to the marketplace root, the
        # directory containing .claude-plugin/, not .claude-plugin/ itself") and the Claude Code
        # client implements exactly that rule; it ignores metadata.pluginRoot entirely. This must
        # resolve to the same physical directory as the Codex source.path check in [3] below - see
        # the cross-manifest agreement check there.
        $src = if ($p.source) { $p.source } else { "./$($p.name)" }
        $pluginDir = Join-Path $RepoRoot $src
        $pluginDir = [System.IO.Path]::GetFullPath($pluginDir)
        if (-not (Test-Path $pluginDir)) { Fail "plugin '$($p.name)' source dir not found: $pluginDir"; continue }
        if ($p.name -eq 'fluyt') { $claudePluginSourceDir = $pluginDir }
        Pass "plugin '$($p.name)' -> $($pluginDir.Substring($RepoRoot.Length).TrimStart('\','/'))"

        # plugin.json
        $manifest = Join-Path $pluginDir ".claude-plugin/plugin.json"
        if (-not (Test-Path $manifest)) { Fail "plugin '$($p.name)' missing .claude-plugin/plugin.json"; continue }
        try {
            # -Encoding UTF8: see the [4] skills-loop comment below for the ANSI-codepage rationale.
            $pj = Get-Content $manifest -Raw -Encoding UTF8 | ConvertFrom-Json
            Pass "plugin.json parses"
        } catch {
            Fail "plugin.json does not parse: $_"; continue
        }
        if (-not $pj.name) { Fail "plugin.json 'name' missing" }
        elseif ($pj.name -ne $p.name) { Fail "plugin.json name '$($pj.name)' != marketplace entry '$($p.name)'" }
        else { Pass "plugin.json name matches" }
        if (-not $pj.description) { Fail "plugin.json 'description' missing" } else { Pass "plugin.json has description" }
        # Track-main invariant: plugin.json must NOT carry a version field.
        if ($pj.PSObject.Properties.Name -contains 'version') {
            Fail "plugin.json carries a 'version' field - track-main forbids it (stale versions block updates)"
        } else {
            Pass "plugin.json has no 'version' field (track-main)"
        }
    }
}

Write-Output ""

# --- 3. Codex marketplace + plugin manifest ---------------------------------
Write-Output "[3] Codex marketplace + plugin manifest"
$codexMarketplacePath = Join-Path $RepoRoot ".agents/plugins/marketplace.json"
$codexMarketplace = $null
if (-not (Test-Path $codexMarketplacePath)) {
    Fail ".agents/plugins/marketplace.json not found"
} else {
    try {
        # -Encoding UTF8: see the [4] skills-loop comment below for the ANSI-codepage rationale.
        $codexMarketplace = Get-Content $codexMarketplacePath -Raw -Encoding UTF8 | ConvertFrom-Json
        Pass "Codex marketplace parses"
    } catch {
        Fail "Codex marketplace does not parse as JSON: $_"
    }
}

$codexEntry = $null
if ($codexMarketplace) {
    if ($codexMarketplace.name -ne 'fluyt') {
        Fail "Codex marketplace name '$($codexMarketplace.name)' != 'fluyt'"
    } else {
        Pass "Codex marketplace name matches"
    }
    if (-not $codexMarketplace.interface -or -not $codexMarketplace.interface.displayName) {
        Fail "Codex marketplace interface.displayName missing"
    } else {
        Pass "Codex marketplace display name present"
    }

    $codexEntries = @($codexMarketplace.plugins | Where-Object { $_.name -eq 'fluyt' })
    if ($codexEntries.Count -ne 1) {
        Fail "Codex marketplace must declare fluyt exactly once (found $($codexEntries.Count))"
    } else {
        $codexEntry = $codexEntries[0]
        Pass "Codex marketplace declares fluyt once"
    }
}

if ($codexEntry) {
    if ($codexEntry.source.source -ne 'local') {
        Fail "Codex marketplace source.source must be 'local'"
    } else { Pass "Codex marketplace source type is local" }
    if ($codexEntry.source.path -ne './plugins/fluyt') {
        Fail "Codex marketplace source.path must be './plugins/fluyt'"
    } else { Pass "Codex marketplace source path matches" }
    # Cross-manifest agreement: the Claude marketplace 'source' ([2] above) and this Codex
    # source.path describe the same physical plugin payload from two different manifests. They can
    # disagree silently - compare resolved full
    # paths (not raw strings) so an edit to either side cannot drift unnoticed. Fails
    # closed: this must Fail, not silently skip, if the Claude side has no 'fluyt' entry to
    # compare - a check that goes blind instead of red is the exact failure mode this guards against.
    if (-not $claudePluginSourceDir) {
        Fail "Claude marketplace declares no plugin entry named 'fluyt' - the cross-manifest agreement check could not run"
    } elseif ($codexEntry.source.path) {
        # $codexEntry.source.path being empty is already asserted by the source.path check above.
        $codexSourceDir = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $codexEntry.source.path))
        if ($claudePluginSourceDir.TrimEnd('\','/') -ne $codexSourceDir.TrimEnd('\','/')) {
            Fail "Claude marketplace source resolves to '$claudePluginSourceDir' but Codex source.path resolves to '$codexSourceDir' - both manifests must point at the same physical directory"
        } else {
            Pass "Claude and Codex manifests resolve 'fluyt' to the same physical directory"
        }
    }
    if ($codexEntry.policy.installation -notin @('NOT_AVAILABLE', 'AVAILABLE', 'INSTALLED_BY_DEFAULT')) {
        Fail "Codex marketplace policy.installation invalid"
    } else { Pass "Codex installation policy valid" }
    if ($codexEntry.policy.authentication -notin @('ON_INSTALL', 'ON_USE')) {
        Fail "Codex marketplace policy.authentication invalid"
    } else { Pass "Codex authentication policy valid" }
    if (-not $codexEntry.category) {
        Fail "Codex marketplace category missing"
    } else { Pass "Codex marketplace category present" }
}

$codexManifestPath = Join-Path $RepoRoot "$PayloadRoot/fluyt/.codex-plugin/plugin.json"
$codexManifest = $null
if (-not (Test-Path $codexManifestPath)) {
    Fail "plugins/fluyt/.codex-plugin/plugin.json not found"
} else {
    try {
        # -Encoding UTF8: see the [4] skills-loop comment below for the ANSI-codepage rationale.
        $codexManifest = Get-Content $codexManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
        Pass "Codex plugin.json parses"
    } catch {
        Fail "Codex plugin.json does not parse: $_"
    }
}

if ($codexManifest) {
    if ($codexManifest.name -ne 'fluyt') { Fail "Codex plugin name must be 'fluyt'" }
    else { Pass "Codex plugin name matches" }
    if (-not $codexManifest.version -or $codexManifest.version -notmatch $StrictSemVerRegex) {
        Fail "Codex plugin version '$($codexManifest.version)' is not strict SemVer"
    } else { Pass "Codex plugin version '$($codexManifest.version)' is strict SemVer" }
    if (-not $codexManifest.description) { Fail "Codex plugin description missing" }
    else { Pass "Codex plugin description present" }
    if (-not $codexManifest.author -or -not $codexManifest.author.name) {
        Fail "Codex plugin author.name missing"
    } else { Pass "Codex plugin author present" }
    if ($codexManifest.skills -ne './skills/') {
        Fail "Codex plugin skills path must be './skills/'"
    } else { Pass "Codex plugin skills path matches" }

    $requiredInterfaceFields = @('displayName', 'shortDescription', 'longDescription', 'developerName', 'category', 'defaultPrompt')
    if (-not $codexManifest.interface) {
        Fail "Codex plugin interface object missing"
    } else {
        # Fail-closed: the Pass below must be gated on the WHOLE loop (every required field present
        # AND capabilities non-empty), not just capabilities - a missing field must still Fail per
        # field above without a same-run Pass telling the reader interface metadata is present.
        $interfaceFieldsOk = $true
        foreach ($field in $requiredInterfaceFields) {
            if (-not $codexManifest.interface.$field) { Fail "Codex plugin interface.$field missing"; $interfaceFieldsOk = $false }
        }
        $capabilities = @($codexManifest.interface.capabilities)
        if ($capabilities.Count -eq 0) { Fail "Codex plugin interface.capabilities must be non-empty"; $interfaceFieldsOk = $false }
        if ($interfaceFieldsOk) { Pass "Codex plugin interface metadata present" }
    }

    $changelogForCodex = Join-Path $RepoRoot "CHANGELOG.md"
    if (Test-Path $changelogForCodex) {
        $codexMirrorVersion = Get-ChangelogCurrentVersion $changelogForCodex
        if (-not $codexMirrorVersion) {
            Fail "cannot read CHANGELOG current version for Codex mirror check"
        } elseif ($codexManifest.version -ne $codexMirrorVersion) {
            Fail "Codex version ($($codexManifest.version)) != CHANGELOG current version ($codexMirrorVersion)"
        } else {
            Pass "Codex version mirrors CHANGELOG ($($codexManifest.version))"
        }
    }
}

Write-Output ""

# --- 4. skills ---------------------------------------------------------------
Write-Output "[4] skills (frontmatter + inventory)"
$skillFiles = Get-ChildItem -Path (Join-Path $RepoRoot $PayloadRoot) -Recurse -Filter "SKILL.md" -ErrorAction SilentlyContinue
$skillNames = @()
if (-not $skillFiles) {
    Write-Output "  (no SKILL.md files found)"
} else {
    foreach ($sf in $skillFiles) {
        $dirName = Split-Path -Leaf (Split-Path -Parent $sf.FullName)
        $result = TestComponentFrontmatter $sf.FullName $dirName "$dirName/SKILL.md"
        if ($result -and $result.Name) { $skillNames += $result.Name }
    }
}

$requiredSkills = @(
    'adopt-conventions', 'agent-liveness', 'backlog', 'branch-protection', 'dispatch-role',
    'forge-azure-devops', 'handover', 'hook-authoring', 'hub', 'install-refresh-plugin',
    'orchestrator', 'release', 'report-upstream', 'scrum', 'ship-work-item', 'versioning-and-changelog'
)
foreach ($requiredSkill in $requiredSkills) {
    if ($skillNames -notcontains $requiredSkill) { Fail "skill '$requiredSkill' is not packaged" }
    else { Pass "skill '$requiredSkill' packaged" }
}

# Registration-surface assertion: the packaged check above only proves a skill EXISTS on
# disk - a consumer never reads the disk, they read the docs. Without this check, deleting
# a skill could leave the gate green. Mirrors the hooks-presence check's shape (section [6]) -
# discovery alone cannot prove packaging OR documentation, both need their own targeted assertion.
# Four surfaces, because that is every place today's sixteen skills are enumerated for a reader: both
# README's skill tables, the consumer-integration acceptance doc, and the adopt-conventions
# CLAUDE-skeleton routing list a new consumer's own CLAUDE.md is seeded from. Case-sensitive
# WHOLE-TOKEN match per (skill, surface) pair, still backtick-agnostic (a backtick, colon or space is
# a boundary). A plain substring test would pass vacuously for 'hub', which sits inside the
# lowercase 'github' that two of the four surfaces carry, leaving the gate green after the skill's
# registration is deleted. The one regex is its price.
$registrationSurfaces = @(
    (Join-Path $RepoRoot "$PayloadRoot/fluyt/README.md"),
    (Join-Path $RepoRoot "README.md"),
    (Join-Path $RepoRoot "docs/consumer-integration.md"),
    (Join-Path $RepoRoot "$PayloadRoot/fluyt/skills/adopt-conventions/templates/CLAUDE-skeleton.md")
)
$surfaceContent = @{}
foreach ($surface in $registrationSurfaces) {
    $rel = $surface.Substring($RepoRoot.Length).TrimStart('\', '/')
    if (-not (Test-Path $surface)) {
        Fail "registration surface '$rel' not found - cannot check skill registration against it"
        continue
    }
    # -Encoding UTF8: see the [4] skills-loop comment above for the ANSI-codepage rationale.
    # Get-Content -Raw returns $null (not '') on an existing-but-empty file; without the fallback
    # the match below would run against $null instead of a known-empty string.
    $content = Get-Content $surface -Raw -Encoding UTF8
    if ($null -eq $content) { $content = '' }
    $surfaceContent[$rel] = $content
}
foreach ($requiredSkill in $requiredSkills) {
    foreach ($rel in $surfaceContent.Keys) {
        $tokenRegex = '(?<![A-Za-z0-9-])' + [regex]::Escape($requiredSkill) + '(?![A-Za-z0-9-])'
        if ($surfaceContent[$rel] -cmatch $tokenRegex) {
            Pass "skill '$requiredSkill' named in '$rel'"
        } else {
            Fail "skill '$requiredSkill' is not named in registration surface '$rel'"
        }
    }
}

Write-Output ""

# --- 5. agents ---------------------------------------------------------------
Write-Output "[5] agents (frontmatter + Codex reachability)"
$agentDirs = Get-ChildItem -Path (Join-Path $RepoRoot $PayloadRoot) -Recurse -Directory -Filter "agents" -ErrorAction SilentlyContinue
$agentFiles = @()
$agentNames = @()
foreach ($ad in $agentDirs) { $agentFiles += Get-ChildItem -Path $ad.FullName -Filter "*.md" -File }
if (-not $agentFiles -or $agentFiles.Count -eq 0) {
    Write-Output "  (no agent .md files found)"
} else {
    foreach ($af in $agentFiles) {
        $base = [System.IO.Path]::GetFileNameWithoutExtension($af.Name)
        $label = "agents/$($af.Name)"
        $result = TestComponentFrontmatter $af.FullName $base $label
        if (-not $result) { continue }
        if ($result.Name) { $agentNames += $result.Name }
        # Agent-only assertions ('tools', 'Skills consulted') - no skill-side counterpart, so these
        # stay here rather than in the shared TestComponentFrontmatter helper above.
        $tools = Get-YamlScalar $result.Frontmatter 'tools'
        if (-not $tools) { Fail "$label frontmatter 'tools' missing" } else { Pass "$label has tools" }
        if ($result.Content -notmatch 'Skills consulted') {
            Fail "$label has no Skills consulted output contract"
        } else { Pass "$label carries Skills consulted contract" }
    }
}

$requiredRoles = @('developer', 'product-owner', 'preflight-reviewer', 'tech-debt-reviewer', 'test-writer', 'scrum-master')
$dispatchSkillPath = Join-Path $RepoRoot "$PayloadRoot/fluyt/skills/dispatch-role/SKILL.md"
# -Encoding UTF8: see the [4] skills-loop comment above for the ANSI-codepage rationale.
$dispatchContent = if (Test-Path $dispatchSkillPath) { Get-Content $dispatchSkillPath -Raw -Encoding UTF8 } else { '' }
foreach ($requiredRole in $requiredRoles) {
    if ($agentNames -notcontains $requiredRole) { Fail "canonical role '$requiredRole' is not packaged" }
    else { Pass "canonical role '$requiredRole' packaged" }
    $rolePathMarker = "../../agents/$requiredRole.md"
    if (-not $dispatchContent.Contains($rolePathMarker)) {
        Fail "dispatch-role does not reference canonical role path '$rolePathMarker'"
    } else { Pass "dispatch-role reaches '$requiredRole' canonically" }
}
if ($dispatchContent -notmatch 'Read-only smoke mode') { Fail "dispatch-role has no read-only smoke mode" }
else { Pass "dispatch-role read-only smoke mode present" }
if ($dispatchContent -notmatch 'Skills consulted:') { Fail "dispatch-role smoke output lacks Skills consulted marker" }
else { Pass "dispatch-role smoke output requires Skills consulted" }

Write-Output ""

# --- 6. hooks.json -----------------------------------------------------------
Write-Output "[6] hooks.json"
$hookFiles = Get-ChildItem -Path (Join-Path $RepoRoot $PayloadRoot) -Recurse -Filter "hooks.json" -ErrorAction SilentlyContinue
if (-not $hookFiles) {
    Write-Output "  (no hooks.json found)"
} else {
    foreach ($hf in $hookFiles) {
        try {
            # -Encoding UTF8: see the [4] skills-loop comment above for the ANSI-codepage rationale.
            Get-Content $hf.FullName -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null
            Pass "$($hf.Name) parses"
        } catch {
            Fail "$($hf.Name) does not parse: $_"
        }
    }
}

# Targeted presence assertion: the discovery loop above only validates whatever
# Get-ChildItem happens to find - deleting hooks/hooks.json outright is a discovery miss with no
# Fail, so the gate would stay green while the shipped hook vanished. The hook fails soft at
# runtime by design, so nothing else anywhere would go red either. The other three component
# classes already have presence enforcement (skills: $requiredSkills; roles: $requiredRoles;
# templates: transitively) - this closes the same gap for hooks. Unconditional, not gated on
# whether hooks were found above.
$hookManifest = Join-Path $RepoRoot "$PayloadRoot/fluyt/hooks/hooks.json"
if (-not (Test-Path $hookManifest)) { Fail "shipped hook 'hooks/hooks.json' is not packaged" }
else { Pass "shipped hook 'hooks/hooks.json' packaged" }

Write-Output ""

# --- 7. project facts under plugins/ (shape heuristic) -----------------------
Write-Output "[7] project facts under plugins/ (shape heuristic)"
# Enumerating known-bad consumer tokens and grepping for them can only ever catch facts
# belonging to consumers somebody remembered to add - a denylist cannot know which consumers exist,
# and its obligation ("append when a new consumer adopts") fires at a moment nobody is watching.
#
# So the mechanism runs the other direction: flag everything under plugins/ that is
# project-fact-SHAPED, and subtract the plugin's own legitimate vocabulary (scripts/plugin-vocabulary-
# allowlist.txt). That puts the burden on WHO has to be remembered - the allowlist is maintained when the
# PLUGIN'S vocabulary changes, which is a moment the maintainer is already in the file with a red
# gate naming the exact token, and a forgotten entry is a false RED, never a false green.
#
# There is no enumerated-consumer denylist or regression floor: such a list would itself name private
# identifiers, so it cannot ship in a public repo. Identifying tokens are caught by the LOCAL pre-push hook
# (scripts/hooks/pre-push) reading a private file outside the repo; this gate carries no term list.
# What the heuristic does NOT catch is recorded honestly rather than papered over:
#   - a kebab-case or all-lowercase consumer slug ('buoy-freight-sloop') is shape-identical to the
#     plugin's own kebab vocabulary (skill names, Project Facts keys) and cannot be told apart
#     without semantics - ONLY the private-file pre-push scan covers them, and only locally (CI
#     has no private list);
#   - a consumer stack the world-vocabulary list below has never heard of;
#   - the two acknowledged blind spots inside Get-ProjectFactFinding (inflected-acronym shapes) and
#     the allowlist (anything legitimately listed there can no longer be flagged anywhere).
#
# Two signal classes are deliberately NOT separate signals: "concrete build/test command strings" is folded INTO the stack vocabulary below (a command
# string is a tool name plus a subcommand, so 'make test' / 'go build' are simply multi-word entries -
# a separate signal would double-report the same leak), and a bare English-word tool match is dropped
# in favour of word-boundary matching, because unanchored substring matching would hit prose
# ('make ' in "make explicit", 'rails' inside "Guardrails", 'vite' inside "invites") - a noisy
# gate gets forced past.

# Signal definitions. Declared here, next to the check they define, rather than up in the constants
# block - Get-ProjectFactFinding above reads them through $script: scope (the same arrangement
# CheckDescriptionLength and $script:DescMaxChars already use), which keeps the whole tuning surface
# in one contiguous block.
#
# Slug signal: a whole word (hyphens, sigils, slashes and quotes all end it) that starts uppercase.
# The length / capital / lowercase / acronym filters that turn that into "compound-shaped" live in
# Get-ProjectFactFinding, where each one is commented with the false positive it removes.
$script:SlugSignalRegex = '(?<![A-Za-z0-9])[A-Z][A-Za-z0-9]*(?![A-Za-z0-9])'
$script:SlugMinLength = 5
$script:AcronymInflectionRegex = '^[A-Z]{2,}[a-z]{1,3}$'
# Path signal: a drive-letter root ('C:\x\', 'D:/x/') or a POSIX user-root path ('/home/x/',
# '/Users/x/', '/mnt/x/'). Matching stops after the FIRST segment on purpose: the root is what an
# allowlist entry can exempt stably, while the tail is whatever illustration happens to follow it.
# The leading (?<![A-Za-z0-9]) is what stops 'https://' from reading as a drive letter. System roots
# (/usr, /var, /etc, /opt) are deliberately not listed - they carry no project fact, only noise. So
# is '~/': it is user-relative rather than machine-absolute, the plugin legitimately documents
# '~/.claude/' and '~/.codex/', and a project-specific path under it still trips the slug signal.
$script:PathSignalRegex = '(?<![A-Za-z0-9])(?:[A-Za-z]:[\\/][A-Za-z0-9_.\-]*[\\/]?|/(?:home|Users|mnt)/[A-Za-z0-9_.\-]*/?)'
# Stack signal: general-purpose WORLD vocabulary - frameworks, runtimes, package managers,
# build and test tools, and the concrete build/test command strings built from them. This list is
# heuristic definition, not consumer data, which is why it lives in the script and not in a data
# file: it changes when the WORLD gains a build tool, never when a consumer adopts. NEVER add a
# consumer's own name, slug or private tooling here - that belongs in the private pre-push terms file.
# Entries must start and end with a word character, since each is matched \b-anchored and case-
# insensitively; multi-word entries are matched as written. Anything here that the plugin legitimately
# names itself goes in the allowlist file (today: 'node', 'npm').
$script:StackVocabulary = @(
    'angular', 'bazel', 'Bevy', 'cargo', 'cmake', 'conda', 'CryEngine', 'cypress', 'django',
    'docker', 'dotnet', 'flutter', 'Godot', 'gradle', 'jest', 'junit', 'kubectl', 'laravel',
    'LibGDX', 'maven', 'mocha', 'MonoGame', 'msbuild', 'mvn', 'node', 'npm', 'nuget', 'nunit',
    'phpunit', 'playwright', 'pnpm', 'poetry', 'pytest', 'rails', 'react', 'rustc', 'svelte',
    'terraform', 'tox', 'Unity', 'Unreal', 'vite', 'vitest', 'webpack', 'xcodebuild', 'xunit',
    'yarn', 'cargo test', 'go build', 'go test', 'gradle build', 'make build', 'make test',
    'mvn test', 'npm run', 'swift build', 'ansible', 'fastapi', 'flask', 'helm', 'rollup', 'sbt',
    'nextjs'
)
# Longest entry first: .NET alternation takes the FIRST alternative that matches at a position, so
# with 'cargo' ahead of 'cargo test' a planted `cargo test` reports as the bare tool name. Sorting by
# length changes only which text the FINDING carries (the gate reddens either way), but the reported
# text is what a maintainer reads and what the allowlist is compared against, so it should be the
# most specific match available.
$script:StackSignalRegex = '(?i)\b(?:' + (($script:StackVocabulary |
    Sort-Object -Property Length -Descending | ForEach-Object { [regex]::Escape($_) }) -join '|') + ')\b'

# The maintained artifact: the plugin's OWN legitimate vocabulary. Its header states the maintenance
# trigger (the plugin's vocabulary changing - NOT a consumer adopting) and the exact format.
$allowlistPath = Join-Path $RepoRoot "scripts/plugin-vocabulary-allowlist.txt"
$allowedVocabulary = @()
$allowlistLoaded = $false
$allowlistEntries = Get-TokenFileEntry $allowlistPath
if ($null -eq $allowlistEntries) {
    # Fail, not Warn: a guard whose data source vanished must go red. Without the allowlist the
    # heuristic cannot run at all - it would report every legitimate token in the payload.
    Fail "scripts/plugin-vocabulary-allowlist.txt not found, unreadable or empty - the shape heuristic has no vocabulary to judge findings against"
} elseif ($allowlistEntries.Count -eq 0) {
    Fail "scripts/plugin-vocabulary-allowlist.txt contains no entries - the shape heuristic has no vocabulary to judge findings against"
} else {
    $allowedVocabulary = $allowlistEntries
    Pass "loaded $($allowedVocabulary.Count) plugin-vocabulary token(s) from scripts/plugin-vocabulary-allowlist.txt"
    $allowlistLoaded = $true
}

$pluginsPath = Join-Path $RepoRoot $PayloadRoot
# Heuristic findings are AGGREGATED by (signal, token) rather than reported per occurrence: one
# leaked consumer name can appear dozens of times, and a wall of near-identical FAIL
# lines buries the signal. Ordered so the report follows
# the order findings were encountered. Each entry keeps its FIRST location and a total count, which
# is enough to act on (remove the fact, or allowlist the vocabulary).
$heuristicFindings = [ordered]@{}
if (-not (Test-Path $pluginsPath)) {
    # Fail-closed: without plugins/ neither half below ran, so a Pass here would vouch for an
    # invariant that was never evaluated.
    Fail "plugins/ not found - the zero-project-facts guard could not run"
} else {
    # Fail-closed: scanning with an absent allowlist would trivially pass and mask the missing data
    # source (already Fail'd above) as if the invariant had been checked and held.
    if (-not $allowlistLoaded) { Fail "shape-heuristic scan skipped - no plugin-vocabulary allowlist to judge findings against" }
    if ($allowlistLoaded) {
        # File-outside/pattern-inside: each payload file is read ONCE and every pattern tested
        # against each of its lines, rather than re-reading every file once per pattern. The heuristic
        # half rides the same single read - it costs three regex passes per line, no extra I/O.
        $allFiles = Get-ChildItem -Path $pluginsPath -Recurse -File
        foreach ($file in $allFiles) {
            $rel = $file.FullName.Substring($RepoRoot.Length).TrimStart('\', '/')
            # -Encoding UTF8: see the [4] skills-loop comment above for the ANSI-codepage rationale.
            # This is the invariant guard (zero project facts in plugins/) - it must not depend on
            # the payload's bytes being ANSI-decodable for the match to land on the right text.
            $lines = Get-Content $file.FullName -Encoding UTF8 -ErrorAction SilentlyContinue
            $ln = 0
            foreach ($line in $lines) {
                $ln++
                foreach ($finding in (Get-ProjectFactFinding $line $allowedVocabulary)) {
                    $key = "$($finding.Signal)|$($finding.Text)"
                    if ($heuristicFindings.Contains($key)) {
                        $heuristicFindings[$key].Count++
                    } else {
                        $heuristicFindings[$key] = [pscustomobject]@{
                            Signal = $finding.Signal
                            Text   = $finding.Text
                            First  = "$rel : $ln"
                            Count  = 1
                        }
                    }
                }
            }
        }
    }
    if ($allowlistLoaded) {
        if ($heuristicFindings.Count -eq 0) {
            Pass "no project-fact-shaped content under plugins/ (slug-shaped identifiers, framework/build-tool names, absolute paths)"
        } else {
            foreach ($key in $heuristicFindings.Keys) {
                $finding = $heuristicFindings[$key]
                $more = if ($finding.Count -gt 1) { " (+$($finding.Count - 1) more occurrence(s))" } else { "" }
                Fail "project-fact-shaped $($finding.Signal) '$($finding.Text)' in $($finding.First)$more - remove the fact; allowlist it in scripts/plugin-vocabulary-allowlist.txt ONLY if it is the plugin's own vocabulary"
            }
        }
    }
}

Write-Output ""

# --- 8. CHANGELOG version consistency (the CHANGELOG invariant) -------------------
Write-Output "[8] CHANGELOG version consistency"
$changelogPath = Join-Path $RepoRoot "CHANGELOG.md"
if (-not (Test-Path $changelogPath)) {
    Fail "CHANGELOG.md not found"
} else {
    # -Encoding UTF8: see the [4] skills-loop comment above for the ANSI-codepage rationale. $cl is
    # still read directly here (not just via Get-ChangelogCurrentVersion) because the append-only
    # check further below needs the full raw text, not just the extracted version.
    $cl = Get-Content $changelogPath -Raw -Encoding UTF8
    $curVersion = Get-ChangelogCurrentVersion $changelogPath
    $topM = [regex]::Match($cl, '(?m)^##\s*\[([0-9]+\.[0-9]+\.[0-9]+)\]')
    if (-not $curVersion) { Fail "no 'Current version: **X.Y.Z**' line found" }
    elseif (-not $topM.Success) { Fail "no '## [X.Y.Z]' entry heading found" }
    elseif ($curVersion -ne $topM.Groups[1].Value) {
        Fail "Current version ($curVersion) != newest CHANGELOG entry ($($topM.Groups[1].Value))"
    } else {
        Pass "Current version matches newest entry ($curVersion)"
    }

    # Append-only assertion: the single top-heading comparison above is blind to everything
    # BELOW the first heading - an existing entry's heading overwritten by the new one (body
    # reattributed), an older entry deleted outright, a duplicated heading, or headings gone
    # out-of-order all leave that comparison green, because it only ever reads the first match. This
    # Guard against that class directly:
    # every '## [X.Y.Z]' heading published on the integration ref must still be present in HEAD's
    # CHANGELOG. Deliberately NOT "strictly descending and gapless" - a
    # strictly-descending, duplicate-free sequence can still lack a published heading, so that shape
    # check would pass the very case this exists to catch. A heading legitimately present in both is fine; only missing-from-
    # HEAD fails.
    $changelogIntegration = 'dev'
    $changelogCurrentBranch = (& git rev-parse --abbrev-ref HEAD 2>$null)
    # Base-ref resolution reuses the exact fallback pattern [11] uses below: a CI
    # checkout creates a local branch only for the ref it checked out, so bare '$changelogIntegration'
    # is absent there and only 'origin/$changelogIntegration' resolves. One addition: when HEAD is
    # ALREADY on the integration branch, its local ref IS HEAD - comparing HEAD to itself is vacuous
    # (always 0 missing, catching nothing), so origin's copy is tried FIRST there instead, making the
    # comparison HEAD-vs-origin (still valid: origin is the last published state HEAD must not have
    # regressed against). Off the integration branch this is the same order [11] uses.
    $changelogCandidates = if ($changelogCurrentBranch -eq $changelogIntegration) {
        @("origin/$changelogIntegration", $changelogIntegration)
    } else {
        @($changelogIntegration, "origin/$changelogIntegration")
    }
    $changelogIntRef = $null
    foreach ($cand in $changelogCandidates) {
        & git rev-parse --verify --quiet "$cand^{commit}" > $null 2>&1
        if ($LASTEXITCODE -eq 0) { $changelogIntRef = $cand; break }
    }
    if ($null -eq $changelogIntRef) {
        Warn "neither '$changelogIntegration' nor 'origin/$changelogIntegration' resolves - cannot check heading append-only (NOT RUN, not passed)"
    } else {
        $integrationChangelogLines = & git show "${changelogIntRef}:CHANGELOG.md" 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $integrationChangelogLines) {
            Warn "cannot read CHANGELOG.md from '$changelogIntRef' - cannot check heading append-only (NOT RUN, not passed)"
        } else {
            $integrationChangelogText = $integrationChangelogLines -join "`n"
            $intHeadings = @([regex]::Matches($integrationChangelogText, '(?m)^##\s*\[([0-9]+\.[0-9]+\.[0-9]+)\]') | ForEach-Object { $_.Groups[1].Value })
            $headHeadings = @([regex]::Matches($cl, '(?m)^##\s*\[([0-9]+\.[0-9]+\.[0-9]+)\]') | ForEach-Object { $_.Groups[1].Value })
            $missingHeadings = @($intHeadings | Where-Object { $headHeadings -notcontains $_ } | Select-Object -Unique)
            if ($missingHeadings.Count -gt 0) {
                Fail "CHANGELOG heading(s) present on '$changelogIntRef' but missing from HEAD: $($missingHeadings -join ', ') - a published entry's heading must never disappear"
            } else {
                Pass "all $($intHeadings.Count) heading(s) on '$changelogIntRef' still present in HEAD's CHANGELOG (append-only)"
            }
        }
    }
}

Write-Output ""

# Shared repo-wide scan exclusion prefixes for [9] and [10] below, both of which recurse the WHOLE
# repo (unlike [4]-[7], scoped to $PayloadRoot). Matched via the separator-normalised
# Test-RepoPathIgnored helper above, so the exclusion holds on both hosts. '.claude/' excludes
# .claude/worktrees/ - harness-managed FULL CHECKOUTS created during a Parallel work drain (see
# CLAUDE.md / ship-work-item); left unexcluded, [9]/[10] would scan another agent's uncommitted WIP
# as if it were this push's own tree. '.git/' is matched separator-normalised too (see
# Test-RepoPathIgnored's comment). 'node_modules/' and the adopt-conventions templates/ prefix are
# markdown-pre-flight-specific (a deliberately partial template fragment, not a standalone doc) and
# have no equivalent reason to be excluded from [9]'s manifest-dir scan, but including them there is
# harmless: no .claude-plugin/ or .codex-plugin/ directory legitimately lives under either.
# Maintenance: keep this in sync with the "ignores" array in .markdownlint-cli2.jsonc for the [10]
# half (that file is the source of truth for what CI lints; a stale copy here fails on files CI skips).
$mdIgnorePrefixes = @(
    'plugins/fluyt/skills/adopt-conventions/templates/',
    'node_modules/',
    '.claude/',
    '.git/'
)

# --- 9. manifest dirs hold only manifests (the component-dirs invariant) ---------------------
Write-Output "[9] manifest dirs hold only manifests (no component dirs)"
$cpDirs = @()
$cpDirs += Get-ChildItem -Path $RepoRoot -Recurse -Directory -Filter ".claude-plugin" -ErrorAction SilentlyContinue
$cpDirs += Get-ChildItem -Path $RepoRoot -Recurse -Directory -Filter ".codex-plugin" -ErrorAction SilentlyContinue
# Exclude harness-managed worktree copies (and .git/) - see the $mdIgnorePrefixes comment above.
$cpDirs = @($cpDirs | Where-Object {
    $rel = $_.FullName.Substring($RepoRoot.Length).TrimStart('\', '/')
    -not (Test-RepoPathIgnored $rel $mdIgnorePrefixes)
})
$badComponent = $false
foreach ($cp in $cpDirs) {
    foreach ($sub in @('skills', 'agents', 'hooks')) {
        if (Test-Path (Join-Path $cp.FullName $sub)) {
            $rel = $cp.FullName.Substring($RepoRoot.Length).TrimStart('\', '/')
            Fail "component dir '$sub' inside $rel (must live at plugin root, not in .claude-plugin/)"
            $badComponent = $true
        }
    }
}
if (-not $badComponent) { Pass "no component dirs inside any manifest directory" }

Write-Output ""

# --- 10. markdownlint pre-flight (narrow rule set) ----------------------------
Write-Output "[10] markdownlint pre-flight (narrow rule set)"
# markdownlint-cli2 may not be installed locally, in which case it cannot run here and CI stays the
# authoritative markdown gate. (Node may be present - the blocker is the linter package itself, not
# a missing runtime. Tool availability varies by machine; check `where.exe markdownlint-cli2`.
# See the .DESCRIPTION header.)
# TARGET STATE (recorded but not yet built): run the real linter here when it is present, falling
# back to these greps only when it is not. Until then this stays a grep approximation that grows
# one rule at a time, with this comment and the closing NOTE kept honest about the growing list.
# These rules are cheaply greppable, so they get a local pre-flight. This is a tripwire, NOT a
# linter: it is blind to every rule not listed below.
#   MD018      - a line-initial '#N' (an issue reference wrapped to the line start) parses as a
#                malformed ATX heading. The check below matches ANY line starting
#                with '#' not followed by a space, whether it is an authored heading or prose that
#                wrapped there - so the wrap case is covered by design, not by accident.
#   MD049/50   - emphasis style. House files use asterisks, so an underscore pair trips
#                the 'consistent' default.
#   MD004      - list-marker style. House bullets are '-', so a wrapped line starting '+ ' or '* '
#                becomes a phantom list item.
#   MD060      - table-column-style, narrow: a delimiter row using unpadded pipes ('|---|---|')
#                in a file whose OTHER tables use the padded house style ('| --- | --- |', see
#                plugins/fluyt/README.md's Skills table).
#   MD028      - no-blanks-blockquote: a blank line directly between two blockquote lines.
#   MD026      - no-trailing-punctuation: an ATX heading ending in '.', ',', ';', ':' or '!'
#                (markdownlint's default punctuation set minus '?').
# Fenced blocks and inline code spans are stripped before matching: markdownlint does not lint
# inside them, and without stripping a shell '#!' line or any snake_case identifier false-positives.
# $mdIgnorePrefixes (also used by [9]'s manifest-dir scan) is declared above, ahead of [9].
# A table delimiter row is pipes/dashes/colons/whitespace only, with >= 1 column separator: matches
# both the padded house form ('| --- | --- |') and the unpadded MD060 shape ('|---|---|'). Whether a
# given match is padded or unpadded is decided separately, by pipe-adjacency, below.
$mdDelimRowPattern = '^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$'
$mdFiles = Get-ChildItem -Path $RepoRoot -Recurse -File -Filter "*.md" -ErrorAction SilentlyContinue
$anyMdHit = $false
foreach ($mf in $mdFiles) {
    $rel = $mf.FullName.Substring($RepoRoot.Length).TrimStart('\', '/').Replace('\', '/')
    if (Test-RepoPathIgnored $rel $mdIgnorePrefixes) { continue }

    # @(...) forces an array even for a one-line file (Get-Content otherwise returns a bare string,
    # which breaks .Count / index access below). -Encoding UTF8: see the [4] skills-loop comment
    # above for the ANSI-codepage rationale.
    $rawLines = @(Get-Content $mf.FullName -Encoding UTF8 -ErrorAction SilentlyContinue)

    # MD060 pre-scan: does this file have any PADDED delimiter row at all? The narrow check only
    # flags an unpadded row in a file that otherwise establishes the padded house style - a file
    # with no padded row anywhere has nothing to be inconsistent WITH, so it is left alone.
    $hasPaddedDelimRow = $false
    foreach ($pl in $rawLines) {
        if ($pl -notmatch $mdDelimRowPattern) { continue }
        if ($pl -notmatch '[|][-:]' -and $pl -notmatch '[-:][|]') { $hasPaddedDelimRow = $true; break }
    }

    $inFence = $false
    for ($i = 0; $i -lt $rawLines.Count; $i++) {
        $line = $rawLines[$i]
        $ln = $i + 1
        if ($line -match '^\s*(```|~~~)') { $inFence = -not $inFence; continue }
        if ($inFence) { continue }
        # Line-position rules match the RAW line: a heading hash and a list marker only count at the
        # true line start. Matching these against a code-span-stripped copy invents hits, because
        # stripping a leading span exposes whatever followed it (a prose "`a` + b" reads as "+ b").
        # Wrap case: a prose line that wraps so it begins '#12' matches this too - covered by
        # design, not by accident (see the section-header comment above).
        if ($line -match '^#+[^ #]') {
            Fail "MD018 (line-initial '#' without a space) in $rel : $ln"
            $anyMdHit = $true
        }
        if ($line -match '^\s*[\+\*]\s') {
            Fail "MD004 (list marker must be '-') in $rel : $ln"
            $anyMdHit = $true
        }
        # MD026: an ATX heading ending in trailing punctuation (markdownlint's default set minus '?').
        if ($line -match '^#{1,6} .*[.,;:!]$') {
            Fail "MD026 (heading must not end in trailing punctuation) in $rel : $ln"
            $anyMdHit = $true
        }
        # MD028: a blank line directly sandwiched between two blockquote lines.
        if ($line -match '^\s*$' -and $i -gt 0 -and $i -lt ($rawLines.Count - 1)) {
            if ($rawLines[$i - 1] -match '^\s*>' -and $rawLines[$i + 1] -match '^\s*>') {
                Fail "MD028 (no blank line inside a blockquote) in $rel : $ln"
                $anyMdHit = $true
            }
        }
        # MD060, narrow: an unpadded delimiter row, only in a file that otherwise uses the padded
        # house style ('| --- | --- |') - see the pre-scan above.
        if ($hasPaddedDelimRow -and $line -match $mdDelimRowPattern) {
            if ($line -match '[|][-:]' -or $line -match '[-:][|]') {
                Fail "MD060 (table delimiter row must use padded pipes, house style is '| --- | --- |') in $rel : $ln"
                $anyMdHit = $true
            }
        }
        # Emphasis rules match a code-span-stripped copy: markdownlint ignores span contents, and
        # every snake_case identifier inside one would otherwise read as underscore emphasis.
        $text = $line -replace '`[^`]*`', ''
        if ($text -match '(^|\W)_[^_]+_(\W|$)') {
            Fail "MD049 (underscore emphasis - use asterisk) in $rel : $ln"
            $anyMdHit = $true
        }
        if ($text -match '__[^_]+__') {
            Fail "MD050 (underscore strong - use asterisk) in $rel : $ln"
            $anyMdHit = $true
        }
    }
}
if (-not $anyMdHit) { Pass "no MD018 / MD049 / MD050 / MD004 / MD060 / MD028 / MD026 hits in linted markdown" }

# --- 11. commit identity: no-reply emails + no co-author trailer -
# Two rules, one check. (1) Every identity git records in this repo's history must
# be a GitHub no-reply address, so no personal address is ever published. Scanned over EVERY commit
# reachable from HEAD - author, committer, each Co-authored-by trailer - plus every annotated tag's
# tagger. GitHub's own push-time "block my email" setting only inspects the newest commit of a push,
# so this scan is the real enforcement, not a belt-and-braces copy. The committer may also be
# exactly noreply@github.com: GitHub itself commits web/API squash merges as that. Independent of
# `git config user.email`, so it behaves identically on a bare CI runner (which needs no identity
# step) and a maintainer machine. (2) CLAUDE.md states co-author-trailers: forbidden and "No
# Co-Authored-By lines. Ever." The forge adds a
# trailer at squash-merge when a branch commit's author differs from the merging account, so the
# trailer is a SYMPTOM of wrong authorship. Rule 2 therefore bans ANY trailer in the branch range
# '<integration>..HEAD'. This is a DETECTOR, not a preventer: the forge acts after the gate has run.
# Offending emails are printed REDACTED (first char + domain): CI logs are public.
Write-Output ""
Write-Output "[11] commit identity: no-reply emails + no co-author trailer"
$noReplyRx = [regex]::new('^([0-9]+\+)?[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?@users\.noreply\.github\.com$', 'IgnoreCase')
$trailerRx = [regex]::new('(?im)^[ \t]*co-authored-by:(?<rest>[^\r\n]*)$')
function Format-RedactedEmail([string]$Email) {
    $at = $Email.LastIndexOf('@')
    if ($at -lt 1) { return '<unparseable>' }
    return $Email.Substring(0, 1) + '***' + $Email.Substring($at)
}
$integration = 'dev'
# Resolve the integration ref before building the range. A CI checkout fetches full history with
# fetch-depth: 0 but actions/checkout creates a local branch ONLY for the ref it checked out - so
# '<branch>' is absent there and only 'origin/<branch>' resolves. Preferring the local branch and
# falling back to the remote-tracking ref makes the range resolvable in both environments; without
# this the check would report NOT RUN on every CI run, a decorative gate.
$intRef = $null
foreach ($cand in @($integration, "origin/$integration")) {
    & git rev-parse --verify --quiet "$cand^{commit}" > $null 2>&1
    if ($LASTEXITCODE -eq 0) { $intRef = $cand; break }
}
# One git call for the whole history (0x1f separates fields, 0x1e ends a record; git allows either in
# a body, but a stray one yields an unparseable record, which fails closed below),
# never one process per commit. Fail CLOSED: unreadable history is "not run", never a pass.
& git rev-parse --verify --quiet 'HEAD^{commit}' > $null 2>&1
$headResolves = ($LASTEXITCODE -eq 0)
$logOut = if ($headResolves) { & git log '--format=%H%x1f%ae%x1f%ce%x1f%B%x1e' HEAD 2>$null } else { $null }
if (-not $headResolves) {
    Warn "no commits yet - commit identity NOT RUN, not passed"
} elseif ($LASTEXITCODE -ne 0) {
    Fail "cannot read commit history via 'git log HEAD' - commit identity NOT RUN, not passed"
} else {
    $identityBad = $false
    $commitCount = 0
    $trailerCount = 0
    foreach ($rec in (($logOut -join "`n") -split [char]0x1e)) {
        if ([string]::IsNullOrWhiteSpace($rec)) { continue }
        $f = $rec.Trim("`n", "`r") -split [char]0x1f, 4
        if ($f.Count -lt 4) { Fail "unparseable 'git log' record - commit identity NOT RUN, not passed"; $identityBad = $true; continue }
        $commitCount++
        $short = $f[0].Substring(0, [Math]::Min(9, $f[0].Length))
        if (-not $noReplyRx.IsMatch($f[1])) {
            Fail "commit $short author '$(Format-RedactedEmail $f[1])' is not a GitHub no-reply address (set user.email to the <id>+<user>@users.noreply.github.com form; a cherry-pick keeps the ORIGINAL author - use commit --amend --reset-author)"
            $identityBad = $true
        }
        if (-not ($noReplyRx.IsMatch($f[2]) -or $f[2] -ceq 'noreply@github.com')) {
            Fail "commit $short committer '$(Format-RedactedEmail $f[2])' is not a GitHub no-reply address"
            $identityBad = $true
        }
        foreach ($tm in $trailerRx.Matches($f[3])) {
            $trailerCount++
            $em = [regex]::Match($tm.Groups['rest'].Value, '<([^<>]*)>')
            if (-not $em.Success -or -not $noReplyRx.IsMatch($em.Groups[1].Value)) {
                $shown = if ($em.Success) { Format-RedactedEmail $em.Groups[1].Value } else { '<no email>' }
                Fail "commit $short Co-authored-by trailer '$shown' is not a GitHub no-reply address"
                $identityBad = $true
            }
        }
    }
    # Annotated tags carry a tagger identity; lightweight tags have none and are skipped.
    $tagOut = & git for-each-ref '--format=%(refname:short)%1f%(objecttype)%1f%(taggeremail)' refs/tags 2>$null
    $tagCount = 0
    if ($LASTEXITCODE -ne 0) {
        Fail "cannot read tags via 'git for-each-ref' - commit identity NOT RUN, not passed"
        $identityBad = $true
    } else {
        foreach ($line in @($tagOut)) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            $tf = $line -split [char]0x1f, 3
            if ($tf.Count -lt 3 -or $tf[1] -ne 'tag') { continue }
            $tagCount++
            $tagger = $tf[2].Trim().TrimStart('<').TrimEnd('>')
            if (-not $noReplyRx.IsMatch($tagger)) {
                Fail "annotated tag '$($tf[0])' tagger '$(Format-RedactedEmail $tagger)' is not a GitHub no-reply address"
                $identityBad = $true
            }
        }
    }
    $isShallow = (& git rev-parse --is-shallow-repository 2>$null)
    if ($isShallow -eq 'true') {
        Warn "shallow repository - the identity scan covered only the fetched history, NOT the full history (not a full pass)"
    }
    if (-not $identityBad) {
        Pass "$commitCount commit(s) / $trailerCount co-author trailer(s) / $tagCount annotated tag(s) checked: all identities are GitHub no-reply"
    }

    # Range rule: no co-author trailer at all on commits the integration branch lacks.
    $currentBranch = (& git rev-parse --abbrev-ref HEAD 2>$null)
    if ($null -eq $intRef) {
        Warn "neither '$integration' nor 'origin/$integration' resolves - cannot check the branch range for co-author trailers (NOT RUN, not passed)"
    } elseif ($currentBranch -eq $integration) {
        # On the integration branch itself that range is empty by definition - say so rather than a silent pass.
        Pass "on '$integration' - no unmerged commits to check for co-author trailers (range empty by definition)"
    } else {
        $range = "$intRef..HEAD"
        $shas = @(& git rev-list $range 2>$null)
        if ($LASTEXITCODE -ne 0) {
            Warn "cannot resolve '$range' (NOT RUN, not passed)"
        } elseif ($shas.Count -eq 0) {
            Pass "no commits ahead of '$intRef' to check for co-author trailers"
        } else {
            $rangeBad = $false
            foreach ($sha in $shas) {
                $body = (& git show -s --format='%B' $sha) -join "`n"
                if ($trailerRx.IsMatch($body)) {
                    Fail "commit $($sha.Substring(0,9)) carries a Co-authored-by trailer - CLAUDE.md forbids it"
                    $rangeBad = $true
                }
            }
            if (-not $rangeBad) { Pass "$($shas.Count) commit(s) ahead of '$intRef': no co-author trailer" }
        }
    }
}

# --- 12. component size budgets ---------------------------------
# Every lane that loads a skill or role pays for the WHOLE file on every load, so regrowth is
# capped. A ratchet (DECISIONS.md, 2026-10-11):
# budget = ceil(size * 1.05 / 100) * 100, one line per file in scripts/component-size-budget.txt
# (its header owns the raise/lower maintenance rule). Size = raw bytes minus CR (0x0D) bytes:
# .gitattributes forces LF for *.md, but a checkout that rewrites endings anyway (core.autocrlf, an
# editor) would measure ~1 byte per line more than CI's ubuntu checkout, and the gate would disagree
# with itself across hosts. Bytes, not characters: the cost being capped is load size, and an em dash
# is 3 bytes. Scope is the two literal globs below, deliberately NOT [4]'s recursive SKILL.md search.
# Skills: every *.md DIRECTLY in a skill directory - SKILL.md plus the reference files a skill splits
# out and loads on demand, which a lane pays for in full just the same (so a split cannot move bytes
# out from under the budget). A skill's templates/ subdirectory is
# one level deeper than */skills/*/*.md reaches, so a scaffolding template (copied into a consumer,
# not loaded as skill text) is never budgeted, nor a SKILL.md-named file there mistaken for a skill.
Write-Output ""
Write-Output "[12] component size budgets (skill .md + agents)"
$budgetPath = Join-Path $RepoRoot "scripts/component-size-budget.txt"
$budgetEntries = Get-TokenFileEntry $budgetPath
# Snapshot so the summary Pass prints only when NOTHING in [12] failed - a bad budget line is a
# failure too, and an "ok" printed right after its FAIL reads as a pass to a skimming eye.
$failuresBefore12 = $script:Failures
if ($null -eq $budgetEntries) {
    Fail "scripts/component-size-budget.txt not found, unreadable or empty - no size budgets to check against"
} else {
    # Ordinal (case-SENSITIVE) keys: PowerShell's @{} is case-insensitive, which would let a
    # mis-cased line satisfy the lookup on Windows while naming no real file on CI's Linux checkout.
    $budgets = New-Object 'System.Collections.Generic.Dictionary[string,long]' ([System.StringComparer]::Ordinal)
    foreach ($entry in $budgetEntries) {
        $m = [regex]::Match($entry, '^(\S+)\s+([0-9]+)$')
        if (-not $m.Success) { Fail "component-size-budget.txt: malformed line '$entry' (expected '<path> <bytes>')"; continue }
        $budgetRel = $m.Groups[1].Value
        if ($budgets.ContainsKey($budgetRel)) { Fail "component-size-budget.txt: '$budgetRel' is listed more than once"; continue }
        $budgets[$budgetRel] = [long]$m.Groups[2].Value
    }
    $sizedFiles = @()
    $sizedFiles += Get-ChildItem -Path (Join-Path $RepoRoot "$PayloadRoot/*/skills/*/*.md") -File -ErrorAction SilentlyContinue
    $sizedFiles += Get-ChildItem -Path (Join-Path $RepoRoot "$PayloadRoot/*/agents/*.md") -File -ErrorAction SilentlyContinue
    $inScope = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::Ordinal)
    $withinBudget = 0
    foreach ($sf in $sizedFiles) {
        $rel = $sf.FullName.Substring($RepoRoot.Length).TrimStart('\', '/').Replace('\', '/')
        [void]$inScope.Add($rel)
        $bytes = [System.IO.File]::ReadAllBytes($sf.FullName)
        $crCount = 0
        $at = [Array]::IndexOf($bytes, [byte]13)
        while ($at -ge 0) { $crCount++; $at = [Array]::IndexOf($bytes, [byte]13, $at + 1) }
        $size = [long]($bytes.Length - $crCount)
        $ratchet = [long]([Math]::Ceiling($size * 105 / 10000.0) * 100)
        if (-not $budgets.ContainsKey($rel)) {
            Fail "$rel ($size bytes) has no line in scripts/component-size-budget.txt - add '$rel $ratchet'"
            continue
        }
        $budget = $budgets[$rel]
        if ($size -gt $budget) {
            Fail "$rel is $size bytes, over its $budget-byte budget by $($size - $budget) - trim it, or raise its line in scripts/component-size-budget.txt deliberately (reason in the PR)"
            continue
        }
        $withinBudget++
        if ($budget -gt $ratchet) {
            Warn "$rel budget $budget is above the ratchet for its current $size bytes - lower its line in scripts/component-size-budget.txt to $ratchet"
        }
    }
    foreach ($budgetRel in $budgets.Keys) {
        if ($inScope.Contains($budgetRel)) { continue }
        if (Test-Path -LiteralPath (Join-Path $RepoRoot $budgetRel)) {
            Fail "component-size-budget.txt: '$budgetRel' is not a .md file directly in a skill directory, nor an agent file - only those are budgeted"
        } else {
            Fail "component-size-budget.txt: stale line '$budgetRel' - no such file; remove the line"
        }
    }
    if ($sizedFiles.Count -eq 0) { Fail "no skill .md or agent files found under $PayloadRoot/ - nothing to budget" }
    elseif ($script:Failures -eq $failuresBefore12) { Pass "$withinBudget file(s) within budget" }
}

# --- 13. never-tracked local files ------------------------------
# Per-machine files must never reach the index: *.local.md (friction log, sub-agent dispatch feed,
# and - by default - the session hand-over),
# .claude/settings.local.json, anything under .claude/worktrees/ (harness-managed checkouts), and
# .mcp.json at any depth (user secrets reach a plugin only through userConfig with
# sensitive: true, never a committed MCP file). .gitignore only stops an accidental `git add`; a
# `git add -f` or a file tracked before the ignore line existed sails past it, so this is the
# backstop. Source is `git ls-files` (the INDEX), so a staged-but-uncommitted file fails too.
# Fail-closed: a failed or empty listing is a Fail, not a Pass - an empty set would make every
# pattern vacuously clean, a green run in which nothing was checked. (Unlike [11] this is not a
# Warn: it needs only the repo itself, which CI and every local run have.)
Write-Output ""
Write-Output "[13] never-tracked local files"
$trackedPaths = @(& git -C $RepoRoot ls-files 2>$null)
if ($LASTEXITCODE -ne 0 -or $trackedPaths.Count -eq 0) {
    Fail "git ls-files failed or returned nothing - cannot check for tracked local files (NOT RUN, not passed)"
} else {
    $neverTracked = '(^|/)[^/]*\.local\.md$|^\.claude/settings\.local\.json$|(^|/)\.mcp\.json$|^\.claude/worktrees/'
    $trackedBad = @($trackedPaths | Where-Object { $_ -cmatch $neverTracked })
    foreach ($badPath in $trackedBad) {
        Fail "$badPath is tracked but must never be - untrack it with: git rm --cached $badPath"
    }
    if ($trackedBad.Count -eq 0) { Pass "$($trackedPaths.Count) tracked path(s) checked: no *.local.md, settings.local.json, .mcp.json or .claude/worktrees/ entry" }
}

# --- 14. hidden Unicode in instruction files --------------------------
# "Trojan source" / prompt injection: zero-width, bidi-control and Tag-block characters render as
# nothing (or reorder what is shown), so an instruction an agent loads can differ from what a human
# reviewer reads in the diff. Instruction files ARE this repo's product and the thing agents obey, so
# any such character in a tracked text file is rejected: zero-width U+200B/200C/200D/2060/180E and
# U+FEFF; bidi U+200E/200F/061C/202A-202E/2066-2069; the Tag block U+E0000-E007F (astral, so in a
# .NET string a \uDB40 + \uDC00-\uDC7F surrogate pair). Scope is every tracked file that is text
# (no NUL byte), which covers *.md, plugins/, .claude/, workflows, scripts and JSON. Read as UTF-8
# explicitly (the ANSI-codepage trap in the checks above). Hits print path:line:col and U+XXXX only,
# never the surrounding text, which may be the payload; col counts UTF-16 units. A BOM (U+FEFF) is
# not allowed even at offset 0 unless a tracked file needs it - none does.
# Fail-closed like [13]: a failed or empty listing is a Fail, not a Pass. This script stays
# ASCII-only: the set is spelled as escapes, so [14] never flags its own source.
Write-Output ""
Write-Output "[14] hidden Unicode in instruction files"
$uniFiles = @(& git -C $RepoRoot ls-files 2>$null)
if ($LASTEXITCODE -ne 0 -or $uniFiles.Count -eq 0) {
    Fail "git ls-files failed or returned nothing - cannot scan for hidden Unicode (NOT RUN, not passed)"
} else {
    $hiddenUnicode = '[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\u180E\u061C\uFEFF]|\uDB40[\uDC00-\uDC7F]'
    $uniUtf8 = New-Object System.Text.UTF8Encoding($false)
    $uniScanned = 0
    $uniFailuresBefore = $script:Failures
    foreach ($uniRel in $uniFiles) {
        $uniPath = Join-Path $RepoRoot $uniRel
        if (-not (Test-Path -LiteralPath $uniPath -PathType Leaf)) { continue }
        $uniBytes = [System.IO.File]::ReadAllBytes($uniPath)
        if ([Array]::IndexOf($uniBytes, [byte]0) -ge 0) { continue }
        $uniScanned++
        $uniLines = $uniUtf8.GetString($uniBytes).Split("`n")
        $uniHits = 0
        for ($uniLine = 0; $uniLine -lt $uniLines.Count; $uniLine++) {
            foreach ($uniMatch in [regex]::Matches($uniLines[$uniLine], $hiddenUnicode)) {
                $uniHits++
                if ($uniHits -gt 5) { continue }
                $uniCode = [int]$uniMatch.Value[0]
                if ($uniMatch.Value.Length -eq 2) { $uniCode = 0xE0000 + ([int]$uniMatch.Value[1] - 0xDC00) }
                Fail ("{0}:{1}:{2} hidden character U+{3:X4}" -f $uniRel, ($uniLine + 1), ($uniMatch.Index + 1), $uniCode)
            }
        }
        if ($uniHits -gt 5) { Fail "$uniRel : $($uniHits - 5) more hidden character(s) not listed" }
    }
    if ($uniScanned -eq 0) { Fail "no tracked text file scanned for hidden Unicode (NOT RUN, not passed)" }
    elseif ($script:Failures -eq $uniFailuresBefore) { Pass "$uniScanned tracked text file(s) scanned: no zero-width, bidi or Tag-block characters" }
}

# --- 15. workflow lockdown --------------------------------------------
# CI logs and runs are public, so every tracked workflow must stay locked down:
# (a) no `pull_request_target` trigger - it runs with the BASE repo's token/secrets against
# fork-controlled input; (b) a top-level `permissions:` key (column 0), so the GITHUB_TOKEN default
# is deny-all (`permissions: {}`) instead of the repo's possibly read-write default; (c) no `write`
# scope and no `write-all` anywhere - CI here only reads. Comments are stripped first so a mention
# in prose does not trip it: whole-line `#` comments, and a trailing ` #...` only when it follows
# balanced quotes (heuristic - a `#` inside a quoted string is kept; a multi-line block scalar that
# merely mentions a token is still scanned and fails closed, reword it). Source is `git ls-files`
# (the INDEX), so a force-added uncommitted workflow fails too. Fail-closed: no tracked workflow
# at all is a Fail (NOT RUN) - an empty set would make every rule vacuously clean.
Write-Output ""
Write-Output "[15] workflow lockdown"
$wfListing = @(& git -C $RepoRoot ls-files -- '.github/workflows/*.yml' '.github/workflows/*.yaml' 2>$null)
if ($LASTEXITCODE -ne 0 -or $wfListing.Count -eq 0) {
    Fail "git ls-files found no tracked .github/workflows/*.yml|*.yaml (or failed) - cannot check workflow lockdown (NOT RUN, not passed)"
} else {
    $failuresBefore15 = $script:Failures
    $wfQuoteAware = '^((?:[^#"'']|"[^"]*"|''[^'']*'')*?)\s+#.*$'
    foreach ($wfRel in $wfListing) {
        $wfPath = Join-Path $RepoRoot $wfRel
        if (-not (Test-Path -LiteralPath $wfPath)) { Fail "$wfRel is tracked but missing from the working tree - cannot check it"; continue }
        $wfCode = @()
        foreach ($wfLine in (Get-Content -LiteralPath $wfPath)) {
            if ($wfLine -match '^\s*#') { continue }
            $wfCode += ($wfLine -replace $wfQuoteAware, '$1')
        }
        if (@($wfCode | Where-Object { $_ -match '\bpull_request_target\b' }).Count -gt 0) {
            Fail "$wfRel uses a pull_request_target trigger - it runs with base-repo token/secrets on fork input; use pull_request"
        }
        if (@($wfCode | Where-Object { $_ -match '^permissions:' }).Count -eq 0) {
            Fail "$wfRel has no top-level 'permissions:' key - add 'permissions: {}' (deny-all default) and grant per job"
        }
        $wfWrites = @($wfCode | Where-Object { $_ -match '[a-z-]+:\s*write\b' -or $_ -match 'write-all' })
        foreach ($wfWrite in $wfWrites) {
            Fail "$wfRel grants a write token scope: '$($wfWrite.Trim())' - CI must stay read-only"
        }
    }
    if ($script:Failures -eq $failuresBefore15) { Pass "$($wfListing.Count) workflow file(s) checked: no pull_request_target, top-level permissions present, no write scope" }
}

Write-Output ""
Write-Output "-----------------------------------------------------------------"
if ($script:Failures -eq 0) {
    Write-Output "RESULT: GREEN - all local checks passed."
    if ($script:Warnings -gt 0) {
        Write-Output "        plus $($script:Warnings) non-blocking WARNING(s) - see WARN lines above; does not affect exit code."
    }
    Write-Output ""
    Write-Output "NOTE: this gate checks STRUCTURE only - both package manifests, inventory, role reachability,"
    Write-Output "      SKILL/agent frontmatter, hooks.json, versions, zero-project-facts, and skill/agent"
    Write-Output "      byte budgets [12] (every skill-dir .md, not just SKILL.md), never-tracked local"
    Write-Output "      files [13] (*.local.md, settings.local.json, .mcp.json, .claude/worktrees/), hidden Unicode [14]"
    Write-Output "      (zero-width, bidi, Tag-block characters in tracked text files), workflow lockdown [15] (no"
    Write-Output "      pull_request_target, deny-all top-level permissions, no write scope) - plus a NARROW"
    Write-Output "      markdown pre-flight [10] that greps a small set of markdownlint rules"
    Write-Output "      (MD018, MD049/MD050, MD004, MD060, MD028, MD026). That pre-flight is NOT markdownlint:"
    Write-Output "      it is blind to every other rule, so a green [10] does NOT mean markdownlint would"
    Write-Output "      pass. It approximates at all because markdownlint-cli2 may not be installed locally;"
    Write-Output "      running the real linter here when present, with these greps as the fallback when it is not, is the"
    Write-Output "      recorded target state rather than the current one. The [4]/[5] description-"
    Write-Output "      length check is not a narrow pre-flight like that one - it asserts its rule exactly:"
    Write-Output "      the Agent Skills spec's $($script:DescMaxChars)-character cap on the folded (YAML-parsed) value, measured"
    Write-Output "      in characters. Unlike every other check above, though, that rule is NOT enforced by"
    Write-Output "      this repo's CI at all: claude plugin validate validates manifests only"
    Write-Output "      (as of claude CLI 2.1.220). [4]/[5] is therefore the ONLY enforcement"
    Write-Output "      of the cap anywhere in the toolchain - trust it LESS casually for that, not more: if"
    Write-Output "      the spec's limit ever changes, nothing else here will notice. Neither CI linter runs"
    Write-Output "      here - markdownlint-cli2 (every *.md) and PSScriptAnalyzer (every *.ps1). Eyeball .md"
    Write-Output "      and .ps1 diffs before pushing; CI is the authoritative gate for those two only."
    exit 0
} else {
    Write-Output "RESULT: RED - $($script:Failures) failure(s). Fix before pushing."
    if ($script:Warnings -gt 0) {
        # Same line as the GREEN path above: a run that is RED for one reason must not hide
        # that it also carries WARN(s) - the [4]/[5] description-length cap is a real, early signal
        # (see the NOTE below on the GREEN path for why that check matters), and a RED run with
        # unreported warnings would give the impression no warnings occurred at all.
        Write-Output "        plus $($script:Warnings) non-blocking WARNING(s) - see WARN lines above; does not affect exit code."
    }
    exit 1
}
