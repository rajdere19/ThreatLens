@echo off
title ThreatLens Cyber Threat Intelligence System
cls
echo ==========================================================
echo        ThreatLens Cyber Threat Intelligence Platform
echo ==========================================================
echo.

cd /d "%~dp0"

:: 1. Find Python executable
set "PYTHON_CMD="
if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" (
    set "PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
) else if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    set "PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
) else if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    set "PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
) else (
    where python >nul 2>&1
    if %errorlevel% equ 0 (
        set "PYTHON_CMD=python"
    ) else (
        echo [ERROR] Python not found. Please install Python 3.10+.
        pause
        exit /b 1
    )
)

echo [✓] Using Python: %PYTHON_CMD%

:: 2. Check dependencies
echo [*] Checking required packages (Flask, Flask-CORS, Scikit-Learn)...
"%PYTHON_CMD%" -c "import flask, flask_cors, sklearn" >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Installing missing requirements...
    "%PYTHON_CMD%" -m pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo [ERROR] Package installation failed.
        pause
        exit /b 1
    )
)
echo [✓] Dependencies verified.

:: 3. Launch browser in 2 seconds
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:8000"

echo.
echo ==========================================================
echo  [✓] Server starting at: http://127.0.0.1:8000
echo  [✓] Opening default browser automatically...
echo  Press Ctrl+C to stop the server anytime.
echo ==========================================================
echo.

:: 4. Run application
"%PYTHON_CMD%" app.py
pause
