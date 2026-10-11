# github-labels.ps1 - bootstrap the canonical fluyt label scheme on a GitHub repo.
#
# Idempotent + convergent: `gh label create --force` updates colour/description on re-run instead
# of erroring, so this is safe to run repeatedly. Run it with PowerShell (`pwsh -File github-labels.ps1`)
# - a .ps1 needs PowerShell, not bash; `gh` itself is shell-agnostic. Without PowerShell, run the
# equivalent `gh label create <name> --color <hex> --force` calls directly.
#
# Prerequisite: `gh` authenticated with repo access. Run from inside the repo, or pass -Repo.
#
# This is the CANONICAL plain scheme for NEW projects (must/should/could + size + tracking/question).
# If your project uses a different tier scheme (e.g. prio:must/prio:should/prio:could), declare that
# in your Project Facts instead of renaming - the backlog skill reads the scheme from Project Facts.

param(
    # Optional "owner/repo"; omit to use the repo in the current directory.
    [string]$Repo,
    # Also seed the model:* / agent:* routing labels (only for projects with `agent-routing: labels`).
    [switch]$AgentRouting
)

$ErrorActionPreference = 'Stop'
$repoArg = if ($Repo) { @('--repo', $Repo) } else { @() }

# name, color (hex, no #), description
$labels = @(
    @('must',      'B60205', 'MoSCoW: do now'),
    @('should',    'D93F0B', 'MoSCoW: real next'),
    @('could',     'FBCA04', 'MoSCoW: nice, not now'),
    @('size:S',    'C2E0C6', 'hours'),
    @('size:M',    '79C879', 'a day-ish'),
    @('size:L',    '2E8B57', 'multi-day / epic'),
    @('bug',       'D73A4A', 'a defect - jumps to the top of any tier'),
    @('tracking',  '1D76DB', 'roadmap epic - not directly workable; take the next unchecked box'),
    @('question',  'D876E3', 'a durable open question for the user'),
    @('blocked',   '5319E7', 'has blocked-by relations - list-filter aid')
)

foreach ($l in $labels) {
    $name, $color, $desc = $l
    Write-Output "label: $name"
    & gh label create $name --force --color $color --description $desc @repoArg
}

# Per-issue routing labels - only for projects that set `agent-routing: labels` in Project Facts.
if ($AgentRouting) {
    $routingLabels = @(
        @('model:opus',        '5319E7', 'routing: implement at the opus tier (overrides the agent default)'),
        @('model:sonnet',      '8250DF', 'routing: implement at the sonnet tier'),
        @('model:haiku',       'B392F0', 'routing: implement at the haiku tier'),
        @('agent:developer',   '006B75', 'routing (advisory): developer implements'),
        @('agent:test-writer', '0E8A16', 'routing (advisory): test-writer authors')
    )
    foreach ($l in $routingLabels) {
        $name, $color, $desc = $l
        Write-Output "label: $name"
        & gh label create $name --force --color $color --description $desc @repoArg
    }
}

Write-Output "Done. Verify with: gh label list --limit 50 $(if ($Repo) { "--repo $Repo" })"
