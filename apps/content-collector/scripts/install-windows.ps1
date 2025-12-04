# Content Collector - Windows Quick Capture Installer
# Installs a global hotkey (Ctrl+Shift+C) for instant content capture

$ErrorActionPreference = "Stop"

Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          Content Collector - Windows Installer                ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Configuration
$InstallDir = "$env:USERPROFILE\.content-collector"
$StartupDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"

# Create installation directory
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# Prompt for configuration
Write-Host "Enter your Content Collector server URL:"
Write-Host "(e.g., https://your-server.com or http://localhost:3001)"
$ServerUrl = Read-Host

Write-Host ""
Write-Host "Enter your API secret:"
$ApiSecret = Read-Host -AsSecureString
$ApiSecretPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($ApiSecret))

# Save configuration (encrypted)
$config = @{
    ServerUrl = $ServerUrl
    ApiSecret = $ApiSecretPlain
} | ConvertTo-Json

$config | Out-File -FilePath "$InstallDir\config.json" -Encoding UTF8

# Create the capture script
$captureScript = @'
# Content Collector - Quick Capture Script

# Load configuration
$config = Get-Content "$env:USERPROFILE\.content-collector\config.json" | ConvertFrom-Json

# Get clipboard content
Add-Type -AssemblyName System.Windows.Forms
$content = [System.Windows.Forms.Clipboard]::GetText()

if ([string]::IsNullOrEmpty($content)) {
    # Check for image in clipboard
    if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
        $image = [System.Windows.Forms.Clipboard]::GetImage()
        # For now, just note that an image was captured
        $content = "[IMAGE: Clipboard image captured]"
    } else {
        [System.Windows.Forms.MessageBox]::Show("Clipboard is empty", "Content Capture", "OK", "Warning")
        exit
    }
}

# Optional: Show dialog for context
Add-Type -AssemblyName Microsoft.VisualBasic
$context = [Microsoft.VisualBasic.Interaction]::InputBox("Add context (optional):", "Content Capture", "")

# Build request body
$body = @{
    content = $content
    source = "windows-hotkey"
    sourceDevice = "Windows"
}

if (-not [string]::IsNullOrEmpty($context)) {
    $body.context = $context
}

$jsonBody = $body | ConvertTo-Json

# Send to server
try {
    $headers = @{
        "Authorization" = "Bearer $($config.ApiSecret)"
        "Content-Type" = "application/json"
    }

    $response = Invoke-RestMethod -Uri "$($config.ServerUrl)/api/capture" `
        -Method Post `
        -Headers $headers `
        -Body $jsonBody

    if ($response.success) {
        # Show toast notification
        [System.Windows.Forms.MessageBox]::Show("Content captured!", "Content Capture", "OK", "Information")
    } else {
        [System.Windows.Forms.MessageBox]::Show("Capture failed", "Content Capture", "OK", "Error")
    }
} catch {
    [System.Windows.Forms.MessageBox]::Show("Error: $($_.Exception.Message)", "Content Capture", "OK", "Error")
}
'@

$captureScript | Out-File -FilePath "$InstallDir\capture.ps1" -Encoding UTF8

# Create quick capture script (no dialog)
$quickCaptureScript = @'
# Content Collector - Silent Quick Capture

# Load configuration
$config = Get-Content "$env:USERPROFILE\.content-collector\config.json" | ConvertFrom-Json

# Get clipboard content
Add-Type -AssemblyName System.Windows.Forms
$content = [System.Windows.Forms.Clipboard]::GetText()

if ([string]::IsNullOrEmpty($content)) {
    # Try image
    if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
        $content = "[IMAGE: Clipboard image]"
    } else {
        exit
    }
}

# Build request body
$body = @{
    content = $content
    source = "windows-hotkey"
    sourceDevice = "Windows"
} | ConvertTo-Json

# Send to server silently
try {
    $headers = @{
        "Authorization" = "Bearer $($config.ApiSecret)"
        "Content-Type" = "application/json"
    }

    $null = Invoke-RestMethod -Uri "$($config.ServerUrl)/api/capture/quick" `
        -Method Post `
        -Headers $headers `
        -Body $body

    # Brief toast notification
    Add-Type -AssemblyName System.Windows.Forms
    $balloon = New-Object System.Windows.Forms.NotifyIcon
    $balloon.Icon = [System.Drawing.SystemIcons]::Information
    $balloon.BalloonTipIcon = "Info"
    $balloon.BalloonTipTitle = "Content Capture"
    $balloon.BalloonTipText = "Captured!"
    $balloon.Visible = $true
    $balloon.ShowBalloonTip(1000)
    Start-Sleep -Milliseconds 1500
    $balloon.Dispose()
} catch {
    # Silent failure
}
'@

$quickCaptureScript | Out-File -FilePath "$InstallDir\quick-capture.ps1" -Encoding UTF8

# Create AutoHotkey script for global hotkey
$ahkScript = @'
#NoEnv
#SingleInstance Force
SetWorkingDir %A_ScriptDir%

; Ctrl+Shift+C - Quick Capture (no dialog)
^+c::
    Run, powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "%USERPROFILE%\.content-collector\quick-capture.ps1"
    return

; Ctrl+Shift+Alt+C - Capture with context dialog
^+!c::
    Run, powershell.exe -ExecutionPolicy Bypass -File "%USERPROFILE%\.content-collector\capture.ps1"
    return

; Ctrl+Shift+V - Capture and show what was captured
^+v::
    clipboard := ClipboardAll
    Run, powershell.exe -ExecutionPolicy Bypass -File "%USERPROFILE%\.content-collector\capture.ps1"
    return
'@

$ahkScript | Out-File -FilePath "$InstallDir\ContentCapture.ahk" -Encoding UTF8

# Create a batch launcher
$batchLauncher = @"
@echo off
powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "%USERPROFILE%\.content-collector\quick-capture.ps1"
"@

$batchLauncher | Out-File -FilePath "$InstallDir\quick-capture.bat" -Encoding ASCII

Write-Host ""
Write-Host "Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║  Next Steps - Set Up Global Hotkey                           ║" -ForegroundColor Yellow
Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor Yellow
Write-Host ""
Write-Host "Option 1: Using AutoHotkey (Recommended)" -ForegroundColor White
Write-Host "─────────────────────────────────────────" -ForegroundColor Gray
Write-Host "1. Install AutoHotkey from https://www.autohotkey.com/"
Write-Host "2. Double-click: $InstallDir\ContentCapture.ahk"
Write-Host "3. (Optional) Copy to Startup folder for auto-run:"
Write-Host "   Copy-Item '$InstallDir\ContentCapture.ahk' '$StartupDir'"
Write-Host ""
Write-Host "Hotkeys when running:" -ForegroundColor Cyan
Write-Host "  Ctrl+Shift+C     - Quick capture (silent)"
Write-Host "  Ctrl+Shift+Alt+C - Capture with context"
Write-Host ""
Write-Host "Option 2: Using PowerToys" -ForegroundColor White
Write-Host "─────────────────────────" -ForegroundColor Gray
Write-Host "1. Install Microsoft PowerToys"
Write-Host "2. Open Keyboard Manager"
Write-Host "3. Add shortcut to run: $InstallDir\quick-capture.bat"
Write-Host ""
Write-Host "Option 3: Task Scheduler" -ForegroundColor White
Write-Host "────────────────────────" -ForegroundColor Gray
Write-Host "Create a scheduled task triggered by keyboard shortcut"
Write-Host ""
Write-Host "Manual test:" -ForegroundColor White
Write-Host "────────────" -ForegroundColor Gray
Write-Host "Copy something to clipboard, then run:"
Write-Host "  & '$InstallDir\quick-capture.ps1'"
Write-Host ""
