@echo off
REM ============================================================================
REM CAMERAFORM Bootstrap - Command Prompt wrapper
REM Forces UTF-8 console so Thai output displays correctly, then calls the
REM PowerShell script with ExecutionPolicy Bypass.
REM
REM Usage: open cmd in the CAMERAFORM folder and run:
REM   scripts\bootstrap.bat
REM ============================================================================

chcp 65001 > nul
setlocal

echo.
echo ==== CAMERAFORM Bootstrap (via cmd) ====
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap.ps1"

if errorlevel 1 (
    echo.
    echo ==== Bootstrap FAILED ====
    pause
    exit /b 1
)

echo.
echo ==== COMPLETED ====
pause
endlocal
