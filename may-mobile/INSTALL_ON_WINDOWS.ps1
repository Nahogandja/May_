param(
  [Parameter(Mandatory=$true)]
  [string]$ProjectPath
)

$ErrorActionPreference = 'Stop'
$sourceRoot = $PSScriptRoot
$projectManifest = Join-Path $ProjectPath 'package.json'
if (-not (Test-Path -LiteralPath $projectManifest)) {
  throw "Not a MAY project directory: $ProjectPath (package.json missing)"
}

$backupDir = Join-Path (Split-Path -Parent $ProjectPath) ("MAY_UI_Backup_" + (Get-Date -Format 'yyyyMMdd_HHmmss'))
$files = Get-ChildItem -LiteralPath $sourceRoot -File -Recurse | Where-Object {
  $_.Extension -in @('.ts', '.tsx', '.js')
}
if (-not $files) { throw 'Could not locate UI replacement files.' }

$updated = 0
foreach ($file in $files) {
  $relative = $file.FullName.Substring($sourceRoot.Length).TrimStart('\', '/')
  $destination = Join-Path $ProjectPath $relative
  $parent = Split-Path -Parent $destination
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  if (Test-Path -LiteralPath $destination) {
    $backupTarget = Join-Path $backupDir $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $backupTarget) -Force | Out-Null
    Copy-Item -LiteralPath $destination -Destination $backupTarget -Force
  }
  Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
  $updated++
}
Write-Host "Applied $updated MAY UI files." -ForegroundColor Green
Write-Host "Existing files backed up in $backupDir"
Write-Host "Your approved welcome screen was not changed."
Write-Host 'Now run: npx tsc --noEmit'
