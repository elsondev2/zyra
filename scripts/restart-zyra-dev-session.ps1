<#
.SYNOPSIS
Fully restarts the local Zyra dev stack, opens Desktop dev, and resumes the selected TUI chat.

.EXAMPLE
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\restart-zyra-dev-session.ps1

.EXAMPLE
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\restart-zyra-dev-session.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [string]$SessionId = '019fc9fc-8662-7d04-b89a-75d67688370c',
    [string]$ProjectPath = 'C:\Users\elson',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function ConvertTo-ComparablePath {
    param([string]$Value)

    return $Value.Replace('/', '\').TrimEnd('\').ToLowerInvariant()
}

function Get-ZyraDevProcessRole {
    param(
        [Microsoft.Management.Infrastructure.CimInstance]$Process,
        [string]$ComparableRepoRoot
    )

    $commandLine = [string]$Process.CommandLine
    if (-not $commandLine) {
        return $null
    }

    $command = ConvertTo-ComparablePath $commandLine
    if (-not $command.Contains($ComparableRepoRoot)) {
        return $null
    }

    if ($command.Contains('\src\agent-server\main.mjs')) {
        return 'shared agent server'
    }
    if (
        $command.Contains('\desktop\node_modules\electron-vite\dist\cli.mjs') -or
        $command.Contains('\desktop\node_modules\electron\dist\electron.exe') -or
        $command.Contains('\desktop\node_modules\@esbuild\')
    ) {
        return 'Desktop dev'
    }
    if (
        $command.Contains('\bin\zyra.mjs') -or
        $command.Contains('\src\zyra.mjs') -or
        $command.Contains('\src\zyra-ui-bridge.mjs')
    ) {
        return 'TUI'
    }

    return $null
}

function Get-ZyraDevProcessTargets {
    param([string]$ComparableRepoRoot)

    $matches = @(
        Get-CimInstance Win32_Process | ForEach-Object {
            $role = Get-ZyraDevProcessRole -Process $_ -ComparableRepoRoot $ComparableRepoRoot
            if ($role) {
                [pscustomobject]@{
                    ProcessId = [int]$_.ProcessId
                    ParentProcessId = [int]$_.ParentProcessId
                    Name = [string]$_.Name
                    Role = $role
                }
            }
        }
    )

    $matchedIds = @{}
    foreach ($match in $matches) {
        $matchedIds[$match.ProcessId] = $true
    }

    return @(
        $matches |
            Where-Object { -not $matchedIds.ContainsKey($_.ParentProcessId) } |
            Sort-Object Role, ProcessId
    )
}

function Stop-ProcessTree {
    param([int]$ProcessId)

    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
        return
    }

    & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
}

function ConvertTo-EncodedPowerShellCommand {
    param([string]$Command)

    return [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Command))
}

$repo = (Resolve-Path -LiteralPath $RepoRoot).Path
$project = (Resolve-Path -LiteralPath $ProjectPath).Path
$comparableRepo = ConvertTo-ComparablePath $repo
$cliPath = Join-Path $repo 'bin\zyra.mjs'
$desktopPackage = Join-Path $repo 'desktop\package.json'

if (-not (Test-Path -LiteralPath $cliPath -PathType Leaf)) {
    throw "Zyra CLI entrypoint was not found: $cliPath"
}
if (-not (Test-Path -LiteralPath $desktopPackage -PathType Leaf)) {
    throw "Desktop package was not found: $desktopPackage"
}
if ($SessionId -notmatch '^[0-9a-fA-F-]{36}$') {
    throw "Invalid Zyra session ID: $SessionId"
}

$sessionDirectory = Join-Path $HOME '.zyra\sessions'
$sessionFile = @(
    Get-ChildItem -LiteralPath $sessionDirectory -File -Filter "*_$SessionId.jsonl" -ErrorAction SilentlyContinue
)[0]
if (-not $sessionFile) {
    throw "The requested chat was not found in ${sessionDirectory}: $SessionId"
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
$bunCommand = Get-Command bun.cmd -ErrorAction SilentlyContinue
if (-not $bunCommand) {
    $bunCommand = Get-Command bun -ErrorAction Stop
}
$bun = $bunCommand.Source
$stateDirectory = if ($env:ZYRA_STATE_DIR) {
    [IO.Path]::GetFullPath($env:ZYRA_STATE_DIR)
} else {
    Join-Path $HOME '.zyra'
}
$channel = if ($env:ZYRA_AGENT_SERVER_CHANNEL) { $env:ZYRA_AGENT_SERVER_CHANNEL } else { 'default' }
if ($channel -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$') {
    throw "Invalid Zyra agent-server channel: $channel"
}
$descriptorPath = Join-Path $stateDirectory "agent-server-$channel.json"
$lockPath = Join-Path $stateDirectory "agent-server-$channel.lock"

$targets = @(Get-ZyraDevProcessTargets -ComparableRepoRoot $comparableRepo)

Write-Host ''
Write-Host "Zyra session: $SessionId"
Write-Host "Project:      $project"
Write-Host "Repository:   $repo"
Write-Host ''
if ($targets.Count -eq 0) {
    Write-Host 'No running Zyra dev processes were found.'
} else {
    Write-Host 'Zyra dev process trees to stop:'
    foreach ($target in $targets) {
        Write-Host ("  {0,-20} PID {1}" -f $target.Role, $target.ProcessId)
    }
}

$tuiArguments = @(
    $cliPath,
    'resume', $SessionId,
    '--project', $project,
    '--profile', 'default',
    '--thinking', 'max',
    '--theme', 'rose-pine',
    '--statusline', 'full',
    '--notifications', 'unfocused',
    '--interrupt', 'queue',
    '--model', 'openai-codex/gpt-5.6-sol',
    '--websearch',
    '--webfetch'
)

if ($DryRun) {
    Write-Host ''
    Write-Host 'Dry run complete. No process was stopped or started.'
    Write-Host 'Desktop command: bun run ui:dev'
    Write-Host "TUI command:     node bin\zyra.mjs resume $SessionId --project `"$project`""
    return
}

foreach ($target in $targets) {
    Stop-ProcessTree -ProcessId $target.ProcessId
}

$shutdownDeadline = (Get-Date).AddSeconds(8)
do {
    Start-Sleep -Milliseconds 150
    $remaining = @(Get-ZyraDevProcessTargets -ComparableRepoRoot $comparableRepo)
} while ($remaining.Count -gt 0 -and (Get-Date) -lt $shutdownDeadline)

if ($remaining.Count -gt 0) {
    $remainingDescription = ($remaining | ForEach-Object { "$($_.Role) PID $($_.ProcessId)" }) -join ', '
    throw "Zyra did not shut down completely: $remainingDescription"
}

# These files contain only disposable process-discovery state. Chat JSONL and Desktop databases are untouched.
Remove-Item -LiteralPath $descriptorPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue

$escapedRepo = $repo.Replace("'", "''")
$escapedBun = $bun.Replace("'", "''")
$desktopCommand = @"
`$Host.UI.RawUI.WindowTitle = 'Zyra Desktop Dev'
Set-Location -LiteralPath '$escapedRepo'
Write-Host 'Starting Zyra Desktop dev...'
& '$escapedBun' run ui:dev
"@
$encodedDesktopCommand = ConvertTo-EncodedPowerShellCommand -Command $desktopCommand
Start-Process powershell.exe -WorkingDirectory $repo -ArgumentList @(
    '-NoLogo',
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-EncodedCommand', $encodedDesktopCommand
) | Out-Null

Start-Sleep -Milliseconds 750
Write-Host ''
Write-Host 'Desktop dev launch requested. Resuming this TUI session...'
Write-Host ''

Push-Location $repo
try {
    & $node @tuiArguments
    $tuiExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($tuiExitCode -ne 0) {
    throw "Zyra TUI exited with code $tuiExitCode."
}
