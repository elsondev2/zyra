$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$outputPath = Join-Path $repoRoot 'docs/current/FILE_TREE_SNAPSHOT.txt'

$excludeDirs = @(
    '.git',
    'node_modules',
    'dist',
    'out',
    '.electron-vite',
    '.turbo',
    '.next',
    '.nuxt',
    'coverage',
    'bin',
    'obj'
)

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add((Split-Path $repoRoot -Leaf)) | Out-Null

function Add-Tree {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [string]$Prefix = ''
    )

    $items = Get-ChildItem -LiteralPath $Path -Force |
        Where-Object {
            if ($_.PSIsContainer -and ($excludeDirs -contains $_.Name)) { return $false }
            return $true
        } |
        Sort-Object @{ Expression = { $_.PSIsContainer }; Descending = $true }, Name

    for ($i = 0; $i -lt $items.Count; $i++) {
        $item = $items[$i]
        $isLast = ($i -eq $items.Count - 1)
        $connector = if ($isLast) { '`-- ' } else { '|-- ' }
        $lines.Add($Prefix + $connector + $item.Name) | Out-Null

        if ($item.PSIsContainer) {
            $childPrefix = if ($isLast) { $Prefix + '    ' } else { $Prefix + '|   ' }
            Add-Tree -Path $item.FullName -Prefix $childPrefix
        }
    }
}

Add-Tree -Path $repoRoot -Prefix ''

$treeText = $lines -join "`n"
[IO.File]::WriteAllText($outputPath, $treeText, [Text.UTF8Encoding]::new($false))

Write-Output "Generated $outputPath"
Write-Output "Line count: $($lines.Count)"
