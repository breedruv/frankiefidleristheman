# One-time setup (safe to re-run after unzipping an update) for the FFI collector on the 24/7 PC.
# Right-click PowerShell > Run as administrator, then:
#   cd <unzipped folder>
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw "Run this from PowerShell opened with 'Run as administrator'." }

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "Node.js is not on PATH. Install Node 22 LTS, reopen PowerShell, and run setup again." }
if (-not $python -or $python -like "*WindowsApps*") { throw "Python is not installed (or only the Microsoft Store shortcut exists). Install Python 3 from python.org with 'Add python.exe to PATH' ticked, reopen PowerShell, and run setup again." }
if (-not (Test-Path ".env.local")) { throw "Copy .env.local.example to .env.local and fill it in first." }

Write-Host "Installing Node packages..."
npm install --omit=dev --no-audit --no-fund
if ($LASTEXITCODE) { throw "npm install failed." }
Write-Host "Installing Python packages..."
& $python -m pip install --quiet -r requirements.txt
if ($LASTEXITCODE) { throw "pip install failed." }

# The scheduled task may not see the same PATH, so pin the exact executables.
"@echo off`r`nset `"NODE_EXE=$node`"`r`nset `"PYTHON=$python`"`r`n" | Set-Content -Encoding ascii scripts\paths.cmd

Write-Host "Test run (one pass)..."
$env:PYTHON = $python
& $node scripts\collector.mjs --once
if ($LASTEXITCODE) { throw "Test run failed; fix the error above before registering the task." }

Write-Host "Registering the 'FFI Collector' startup task..."
Stop-ScheduledTask -TaskName "FFI Collector" -ErrorAction SilentlyContinue
$action = New-ScheduledTaskAction -Execute "$PSScriptRoot\scripts\run-collector.cmd" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName "FFI Collector" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
# A restarted task leaves the old node process running; stop collectors from this folder before starting fresh.
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*collector.mjs*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-ScheduledTask -TaskName "FFI Collector"

Write-Host "Keeping the PC awake on AC power..."
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

Write-Host ""
Write-Host "Done. The collector is running and will start automatically at boot."
Write-Host "You should get a 'Collector started' push on your phone within a minute."
Write-Host "Log: $PSScriptRoot\logs\collector.log"
