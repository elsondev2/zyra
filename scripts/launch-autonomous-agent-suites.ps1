param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$ConfigPath = '',
    [int]$ShutdownDelaySeconds = 20,
    [switch]$NoShutdown
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-ExistingZyraMainProcesses {
    param([string]$Root)

    $escapedRoot = [regex]::Escape($Root)
    @(Get-CimInstance Win32_Process | Where-Object {
        $name = [string]$_.Name
        $commandLine = [string]$_.CommandLine
        $isMainProcess = $commandLine -notmatch '(?:^|\s)--type='
        $isRepoElectron = $name -ieq 'electron.exe' -and $commandLine -match $escapedRoot -and $commandLine -notmatch '\.zyra-worktrees[\\/]'
        $isPackagedZyra = $name -match '^Zyra(?:-dev)?\.exe$'
        $isMainProcess -and ($isRepoElectron -or $isPackagedZyra)
    })
}

function Write-ShutdownScript {
    param(
        [string]$Destination,
        [int[]]$ProcessIds,
        [int]$DelaySeconds
    )

    $idLiteral = if ($ProcessIds.Count -gt 0) { $ProcessIds -join ', ' } else { '' }
    $content = @"
`$ErrorActionPreference = 'SilentlyContinue'
Start-Sleep -Seconds $DelaySeconds
`$targets = @($idLiteral)
foreach (`$targetPid in `$targets) {
    if (Get-Process -Id `$targetPid -ErrorAction SilentlyContinue) {
        & taskkill.exe /PID `$targetPid /T /F | Out-Null
    }
}
"@
    Set-Content -LiteralPath $Destination -Value $content -Encoding UTF8
}

$repo = (Resolve-Path $RepoRoot).Path
$existingZyra = Get-ExistingZyraMainProcesses -Root $repo

if (-not $ConfigPath) {
    Write-Host 'Preparing autonomous snapshot branches and worktrees...'
    $prepareScript = Join-Path $repo 'scripts\automation\prepare-autonomous-run.mjs'
    $prepareOutput = & node $prepareScript --repo $repo
    if ($LASTEXITCODE -ne 0) {
        throw 'Autonomous run preparation failed.'
    }
    $prepare = $prepareOutput | ConvertFrom-Json
    $ConfigPath = [string]$prepare.configPath
} else {
    $ConfigPath = (Resolve-Path $ConfigPath).Path
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$runDir = [string]$config.runDir
$fleetCmd = Join-Path $runDir 'fleet.cmd'
$controlCmd = Join-Path $runDir 'control.cmd'
$coordinatorCmd = Join-Path $runDir 'coordinator.cmd'

foreach ($required in @($fleetCmd, $controlCmd, $coordinatorCmd)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Missing generated tab command: $required"
    }
}

$wt = (Get-Command wt.exe -ErrorAction Stop).Source
$windowName = "zyra-agents-$($config.runId)"
$wtArgs = @(
    '-w', 'new',
    'new-tab', '--title', 'Builder A - Subagents + Workflows', '-d', [string]$config.worktrees.fleet, 'cmd.exe', '/k', ('"{0}"' -f $fleetCmd),
    ';',
    'new-tab', '--title', 'Builder B - Browser + Computer Use', '-d', [string]$config.worktrees.control, 'cmd.exe', '/k', ('"{0}"' -f $controlCmd),
    ';',
    'new-tab', '--title', 'Coordinator + Merge Agent', '-d', [string]$config.worktrees.integration, 'cmd.exe', '/k', ('"{0}"' -f $coordinatorCmd)
)

Write-Host "Launching one Windows Terminal window with three tabs for run $($config.runId)..."
& $wt @wtArgs
if ($LASTEXITCODE -ne 0) {
    throw "Windows Terminal launch failed with exit code $LASTEXITCODE."
}

$launchRecord = [ordered]@{
    version = 1
    runId = [string]$config.runId
    launchedAt = (Get-Date).ToUniversalTime().ToString('o')
    windowName = $windowName
    configPath = $ConfigPath
    branches = $config.branches
    worktrees = $config.worktrees
    scheduledShutdownPids = @($existingZyra | ForEach-Object { [int]$_.ProcessId })
    shutdownDelaySeconds = if ($NoShutdown) { $null } else { $ShutdownDelaySeconds }
}
$launchRecord | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $runDir 'launch.json') -Encoding UTF8

if (-not $NoShutdown -and $existingZyra.Count -gt 0) {
    $shutdownScript = Join-Path $runDir 'shutdown-previous-zyra.ps1'
    Write-ShutdownScript -Destination $shutdownScript -ProcessIds @($existingZyra | ForEach-Object { [int]$_.ProcessId }) -DelaySeconds $ShutdownDelaySeconds
    Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', ('"{0}"' -f $shutdownScript)
    ) | Out-Null
    Write-Host "Scheduled shutdown of the pre-existing Zyra instance in $ShutdownDelaySeconds seconds."
} elseif (-not $NoShutdown) {
    Write-Host 'No pre-existing Zyra main process was detected; no shutdown was needed.'
}

Write-Host ''
Write-Host "Run ID: $($config.runId)"
Write-Host "Builder A branch: $($config.branches.fleet)"
Write-Host "Builder B branch: $($config.branches.control)"
Write-Host "Integration branch: $($config.branches.integration)"
Write-Host "Coordinator state: $($config.coordinator.stateFile)"
