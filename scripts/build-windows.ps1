<#
 Builds the RocketSales Desktop installer on your own Windows computer (same steps as the GitHub workflow).
 Run from PowerShell:   cd desktop ; .\scripts\build-windows.ps1
 Needs: Node.js 22+, Rust (rustup, MSVC toolchain with "Desktop development with C++"), and WebView2 (built in to Windows 11).
 The installer appears in src-tauri\target\release\bundle\nsis\
#>
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

foreach ($tool in 'node', 'npm', 'cargo') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool was not found. See the comment at the top of this script." }
}

npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'typecheck failed' }
npm test
if ($LASTEXITCODE -ne 0) { throw 'front-end tests failed' }

Push-Location src-tauri
cargo test -p rocketsales-core --locked
$coreResult = $LASTEXITCODE
Pop-Location
if ($coreResult -ne 0) { throw 'core tests failed' }

npm run tauri -- build --bundles nsis
if ($LASTEXITCODE -ne 0) { throw 'installer build failed' }

Get-ChildItem src-tauri\target\release\bundle\nsis -Filter *-setup.exe | ForEach-Object { Write-Host "Built: $($_.FullName)" }
