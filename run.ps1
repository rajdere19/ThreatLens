# ==============================================================================
# ThreatLens Runner Script (PowerShell)
# Automatically locates Python, checks packages, and launches ThreatLens
# ==============================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       🛡️  ThreatLens Cyber Threat Intelligence Platform   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

# 1. Locate valid Python executable
$PythonPaths = @(
    "python",
    "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
    "C:\Program Files\Python313\python.exe",
    "C:\Program Files\Python312\python.exe",
    "py"
)

$ValidPython = $null
foreach ($p in $PythonPaths) {
    try {
        $testOutput = & $p --version 2>&1
        if ($LASTEXITCODE -eq 0 -and $testOutput -match "Python 3\.") {
            $ValidPython = $p
            break
        }
    } catch {
        # continue searching
    }
}

if (-not $ValidPython) {
    Write-Host "[ERROR] Could not locate a working Python 3 installation." -ForegroundColor Red
    Write-Host "Please install Python 3.10+ or add it to your PATH." -ForegroundColor Yellow
    exit 1
}

Write-Host "[✓] Found Python: $ValidPython" -ForegroundColor Green

# 2. Check and install Python dependencies
Write-Host "[*] Checking backend dependencies (Flask, Flask-CORS, Scikit-Learn)..." -ForegroundColor Yellow
$checkDeps = & $ValidPython -c "import flask, flask_cors, sklearn; print('OK')" 2>&1
if ($checkDeps -notmatch "OK") {
    Write-Host "[!] Missing dependencies. Installing from requirements.txt..." -ForegroundColor Yellow
    & $ValidPython -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to install dependencies." -ForegroundColor Red
        exit 1
    }
}
Write-Host "[✓] All dependencies verified." -ForegroundColor Green

# 3. Launch browser after a short delay
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 2
    Start-Process "http://127.0.0.1:8000"
} | Out-Null

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [✓] Server starting at: http://127.0.0.1:8000" -ForegroundColor Green
Write-Host " [✓] Opening your web browser automatically..." -ForegroundColor Green
Write-Host " Press Ctrl+C in this terminal to stop the server." -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# 4. Start Flask server
& $ValidPython app.py
