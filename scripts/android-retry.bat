@echo off
REM ============================================================================
REM CAMERAFORM - Android build with retry loop (ASCII-safe)
REM
REM For machines with Sophos / SentinelOne / Defender that lock Gradle cache
REM files during atomic rename. The error message is:
REM   "Could not move temporary workspace to immutable location"
REM This is transient - retrying 2-3 times usually succeeds.
REM
REM This script:
REM   - Tries the build up to 5 times
REM   - Waits 5 seconds between attempts (lets AV release file handles)
REM   - Stops the Gradle daemon between attempts
REM   - Exits on first success
REM
REM Usage:  scripts\android-retry.bat
REM ============================================================================

setlocal

set MAX_RETRIES=5
set DELAY=5

echo.
echo ==== CAMERAFORM Android Build (with retry) ====
echo.

for /L %%i in (1,1,%MAX_RETRIES%) do (
    echo.
    echo ------------------------------------------------------------
    echo Attempt %%i of %MAX_RETRIES%
    echo ------------------------------------------------------------
    echo.

    call npx react-native run-android

    if not errorlevel 1 (
        echo.
        echo ==== BUILD SUCCEEDED on attempt %%i ====
        goto :done
    )

    echo.
    echo [Attempt %%i failed] Waiting %DELAY% seconds before retry...

    REM Kill any stuck Gradle daemons before retrying
    pushd "%~dp0..\android" 2>nul
    call gradlew.bat --stop 2>nul
    popd

    timeout /t %DELAY% /nobreak > nul
)

echo.
echo ==== BUILD FAILED after %MAX_RETRIES% attempts ====
echo.
echo See SETUP.md section:
echo   "Troubleshooting: Sophos/SentinelOne/Defender file locking"
echo.
exit /b 1

:done
echo.
endlocal
