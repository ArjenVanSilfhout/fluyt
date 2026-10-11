<#
.SYNOPSIS
    Tag a promoted Fluyt release and publish its GitHub Release from the maintainer's machine.

.DESCRIPTION
    The `release` skill's *The ritual* step 3 tags the release merge commit on the release branch
    (`release-tags: yes`) and publishes a GitHub Release (`github-releases: yes`, titled
    `vX.Y.Z "Name"` per Project Facts) whose notes are a short summary the agent or maintainer
    writes - see -NotesFile below. A cloud
    agent session can promote the release (PR + merge commit on `main`) but is refused both halves
    of step 3 - `git push origin <tag>` and `gh release create` answer HTTP 403 "not permitted for
    this session type". This script is the hand-off: the session
    stops after the merge, and the maintainer finishes step 3 here with their own authenticated git
    and `gh`.

    It checks before it acts, and every precondition failure exits 1 with the reason:
      - `git fetch origin --tags` succeeds (so `origin/main` and the tag list are current);
      - the release commit (-Commit, default `origin/main`) resolves and is reachable from
        `origin/main` - a tag on a commit consumers never pinned would mark nothing;
      - CHANGELOG.md AT THAT COMMIT has a `## [<Version>]` heading AND its `Current version:` equals
        <Version>. Read via `git show <commit>:CHANGELOG.md`, never the working tree: `dev` has
        usually moved past the release by now, so the checkout's CHANGELOG is the wrong file;
      - tag `v<Version>` exists neither locally nor on origin;
      - -NotesFile is given, readable and not blank (checked first, before any network call);
      - `gh auth status` succeeds (skipped under -DryRun).

    The notes are NEVER generated here: -NotesFile (mandatory) is the summary, passed to
    `gh release create --notes-file` as written. A release that bundles several work items read, when
    pasted from the CHANGELOG sections, as one long repetitive log (DECISIONS.md, 2026-10-11: notes
    read like v1.0.0 - an opening line naming the previous release, short bullets grouped by area,
    one line per change giving its effect on the reader, a pointer to the CHANGELOG version range).
    Write it per the `release` skill's *The ritual* step 3. With no usable file the script refuses
    to publish, and there is deliberately NO fallback to the raw CHANGELOG paste: a silent fallback
    would reintroduce exactly the log the file exists to replace.

    PowerShell 5.1-compatible on purpose (maintainers may run either 5.1 or 7): no ternary, no `??`,
    no PS7-only cmdlets. Native calls are checked by $LASTEXITCODE, never by $? - see the
    `ship-work-item` skill's portability.md on why a redirected native stderr flips $? in 5.1.

    Usage (from anywhere - the script resolves the repo root from its own location):
      pwsh -NoProfile -File scripts/publish-release.ps1 -Version 1.2.3 -Name "Example" -NotesFile notes.md -DryRun
      pwsh -NoProfile -File scripts/publish-release.ps1 -Version 1.2.3 -Name "Example" -NotesFile notes.md
    `powershell -NoProfile -File ...` works the same where execution policy allows. Never add
    `-ExecutionPolicy Bypass` (CLAUDE.md `test-cmd`; a security classifier denies it).
    Exit code 0 = published (or dry run clean); 1 = a precondition or action failed.
#>

[CmdletBinding()]
param(
    # Strict X.Y.Z - validated in the body rather than by [ValidatePattern] so a bad value gets a
    # readable message and a guaranteed exit 1 instead of a parameter-binding stack.
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$Name,
    # Mandatory in effect, checked in the body (like -Version) so a missing value gets a readable
    # refusal and exit 1 instead of an interactive prompt that a non-interactive host would hang on.
    [string]$NotesFile,
    [string]$Commit,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# Write-Host for the same reason as validate-local.ps1's Fail/Pass/Warn: a helper whose output is
# assigned (`$x = Get-Thing`) swallows every Write-Output it makes, so progress lines printed from
# inside such a helper would vanish. Write-Host bypasses the success stream.
function Say {
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingWriteHost', '',
        Justification = 'deliberate - assignment-capture immunity, as in validate-local.ps1')]
    param([string]$msg)
    Write-Host $msg
}

# Every precondition failure funnels through here; the top-level catch prints it and exits 1. Dashless
# name, like validate-local.ps1's Fail: a Verb-Noun such as Stop-Release trips PSScriptAnalyzer's
# PSUseShouldProcessForStateChangingFunctions, and an unhyphenated name is outside the verb rules.
function Abort([string]$msg) {
    throw "publish-release: $msg"
}

# Run a native command and return its stdout lines; the exit code is left in $LASTEXITCODE for the
# caller. $ErrorActionPreference is relaxed to Continue for the call only: under 'Stop', Windows
# PowerShell 5.1 turns any stderr line from a native exe whose stderr is redirected (2>$null) into a
# terminating NativeCommandError even on exit 0 - the same 5.1 trap portability.md records for
# `2>&1`. -Quiet discards stderr (for probes whose failure is an expected answer, e.g. "no such
# tag"); otherwise stderr is left alone and reaches the console unredirected.
function Invoke-Native {
    param([string]$Exe, [string[]]$Arguments, [switch]$Quiet)
    $saved = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($Quiet) { $out = & $Exe @Arguments 2>$null } else { $out = & $Exe @Arguments }
    } finally {
        $ErrorActionPreference = $saved
    }
    return $out
}

# PS < 7.3 (and 7.3+ with $PSNativeCommandArgumentPassing = 'Legacy') passes an argument's embedded
# double quotes to a native exe UNESCAPED, so the title `v1.2.3 "Name"` would reach gh as
# `v1.2.3 Name` (or split). Those hosts need each `"` pre-escaped as `\"`; 7.3+ 'Standard'/'Windows'
# mode escapes it itself, and pre-escaping there would put literal backslashes in the title.
function ConvertTo-NativeArgument([string]$value) {
    $legacy = $true
    if ($PSVersionTable.PSVersion.Major -ge 7 -and (Test-Path variable:PSNativeCommandArgumentPassing)) {
        if ($PSNativeCommandArgumentPassing -ne 'Legacy') { $legacy = $false }
    }
    if ($legacy) { return $value.Replace('"', '\"') }
    return $value
}

$semver = '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
$repoRoot = Split-Path -Parent $PSScriptRoot
$savedOutputEncoding = $null
$exitCode = 0
# Resolved against the caller's directory BEFORE the Push-Location below moves into the repo root.
$notesPath = $null
if ($NotesFile) { $notesPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($NotesFile) }
Push-Location $repoRoot
try {
    # git emits UTF-8; 5.1 decodes native stdout with the console's OEM codepage, which would turn
    # the CHANGELOG's em dashes into mojibake when it is parsed. Restored in finally. A host
    # with no console can refuse the set - then decoding stays as it was, which is harmless on 7.
    try {
        $savedOutputEncoding = [Console]::OutputEncoding
        [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
    } catch {
        $savedOutputEncoding = $null
    }

    if ($Version -notmatch $semver) {
        Abort "-Version '$Version' is not strict X.Y.Z semver (e.g. 1.2.3; no leading 'v', no leading zeros)."
    }
    if (-not $Name.Trim()) { Abort "-Name must be a non-empty release codename." }
    if ($Name.Contains('"')) { Abort "-Name must not contain a double quote (the title wraps it in quotes)." }
    $tag = "v$Version"
    $title = "$tag `"$Name`""

    # Checked before any git/network work: it is the one input only the caller can supply, so a
    # missing summary should fail in milliseconds, not after a fetch. No fallback - see DESCRIPTION.
    if (-not $notesPath) {
        Abort "-NotesFile is required: write the release summary to a file (see the release skill, The ritual step 3) and pass its path. Refusing to publish raw CHANGELOG sections."
    }
    if (-not (Test-Path -LiteralPath $notesPath -PathType Leaf)) { Abort "-NotesFile '$NotesFile' does not exist or is not a file." }
    try {
        $notesText = [System.IO.File]::ReadAllText($notesPath, (New-Object System.Text.UTF8Encoding $false))
    } catch {
        Abort "-NotesFile '$NotesFile' is unreadable: $($_.Exception.Message)"
    }
    if (-not $notesText.Trim()) { Abort "-NotesFile '$NotesFile' is empty (or only whitespace); refusing to publish blank release notes." }
    $notesLines = @($notesText -split "`r?`n").Count

    $top = Invoke-Native git @('rev-parse', '--show-toplevel') -Quiet
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $repoRoot 'CHANGELOG.md'))) {
        Abort "not a git checkout of the marketplace repo: $repoRoot (expected CHANGELOG.md at its root)."
    }
    Say "Repo root:      $top"

    Say "Fetching origin (with tags)..."
    Invoke-Native git @('fetch', 'origin', '--tags') | Out-Null
    if ($LASTEXITCODE -ne 0) { Abort "'git fetch origin --tags' failed (exit $LASTEXITCODE)." }

    if (-not $Commit) { $Commit = 'origin/main' }
    $sha = Invoke-Native git @('rev-parse', '--verify', '--quiet', "$Commit^{commit}") -Quiet
    if ($LASTEXITCODE -ne 0 -or -not $sha) { Abort "-Commit '$Commit' does not resolve to a commit." }
    $sha = "$sha".Trim()
    Invoke-Native git @('merge-base', '--is-ancestor', $sha, 'origin/main') -Quiet | Out-Null
    if ($LASTEXITCODE -eq 1) { Abort "commit $sha is not reachable from origin/main (the release branch)." }
    if ($LASTEXITCODE -ne 0) { Abort "'git merge-base --is-ancestor $sha origin/main' failed (exit $LASTEXITCODE)." }
    Say "Release commit: $sha ($Commit)"

    # Tag first: an already-tagged version is the most likely mistake (a re-run, or the wrong
    # -Version), and its message is clearer than the CHANGELOG mismatch it would otherwise trip.
    $localTag = Invoke-Native git @('rev-parse', '--verify', '--quiet', "refs/tags/$tag") -Quiet
    if ($LASTEXITCODE -eq 0 -and $localTag) { Abort "tag $tag already exists locally." }
    $remoteTag = Invoke-Native git @('ls-remote', '--tags', 'origin', "refs/tags/$tag")
    if ($LASTEXITCODE -ne 0) { Abort "'git ls-remote --tags origin' failed (exit $LASTEXITCODE)." }
    if ($remoteTag) { Abort "tag $tag already exists on origin." }

    $changelog = Invoke-Native git @('show', "${sha}:CHANGELOG.md") -Quiet
    if ($LASTEXITCODE -ne 0 -or -not $changelog) { Abort "no CHANGELOG.md at commit $sha." }
    $lines = @($changelog)

    $cvMatch = [regex]::Match(($lines -join "`n"), 'Current version:\s*\*\*([0-9]+\.[0-9]+\.[0-9]+)\*\*')
    if (-not $cvMatch.Success) { Abort "CHANGELOG.md at $sha has no 'Current version: **X.Y.Z**' line." }
    $headingRe = '^## \[' + [regex]::Escape($Version) + '\]'
    $start = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match $headingRe) { $start = $i; break }
    }
    # Both messages name the version the commit DOES release: a missing heading is usually the "dev
    # moved on" case (the entry exists on dev, not yet on the release branch), indistinguishable at
    # the commit from a typo, so the Current version is the actionable half of the answer.
    $current = $cvMatch.Groups[1].Value
    if ($start -lt 0) {
        Abort "CHANGELOG.md at $sha has no '## [$Version]' heading; its Current version is $current, not $Version."
    }
    if ($current -ne $Version) {
        Abort "CHANGELOG.md at $sha has a '## [$Version]' entry but its Current version is $current, not $Version - that commit does not release $Version."
    }

    $hasGh = [bool](Get-Command gh -ErrorAction SilentlyContinue)
    if (-not $DryRun) {
        if (-not $hasGh) { Abort "the GitHub CLI 'gh' is not on PATH." }
        Invoke-Native gh @('auth', 'status') | Out-Null
        if ($LASTEXITCODE -ne 0) { Abort "'gh auth status' failed - run 'gh auth login' first." }
    }

    Say "Notes file:     $notesPath ($notesLines lines)"

    $titleArg = ConvertTo-NativeArgument $title
    $tagArgs = @('tag', '-a', $tag, '-m', $tag, $sha)
    $pushArgs = @('push', 'origin', $tag)
    $ghArgs = @('release', 'create', $tag, '--title', $titleArg, '--notes-file', $notesPath, '--verify-tag', '--latest')

    if ($DryRun) {
        Say ""
        Say "DRY RUN - nothing tagged, pushed or published. Would run:"
        Say "  git tag -a $tag -m `"$tag`" $sha"
        Say "  git push origin $tag"
        Say "  gh release create $tag --title '$title' --notes-file `"$notesPath`" --verify-tag --latest"
    } else {
        Say ""
        Say "Tagging $tag at $sha..."
        Invoke-Native git $tagArgs | Out-Null
        if ($LASTEXITCODE -ne 0) { Abort "'git tag' failed (exit $LASTEXITCODE)." }
        Say "Pushing $tag..."
        Invoke-Native git $pushArgs | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Abort "'git push origin $tag' failed (exit $LASTEXITCODE). The local tag exists; delete it with 'git tag -d $tag' before re-running."
        }
        Say "Publishing GitHub Release '$title'..."
        Invoke-Native gh $ghArgs | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Abort "'gh release create' failed (exit $LASTEXITCODE). Tag $tag is already pushed; re-run the gh command above by hand rather than re-running this script (its no-existing-tag check would now refuse)."
        }
        $url = Invoke-Native gh @('release', 'view', $tag, '--json', 'url', '--jq', '.url')
        if ($LASTEXITCODE -eq 0 -and $url) { Say "Published: $("$url".Trim())" }
        else { Say "Published $tag (could not read back its URL)." }
    }
} catch {
    Say "ERROR: $($_.Exception.Message)"
    $exitCode = 1
} finally {
    if ($null -ne $savedOutputEncoding) {
        try { [Console]::OutputEncoding = $savedOutputEncoding } catch { $null = $_ }
    }
    Pop-Location
}
exit $exitCode
