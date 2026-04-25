@echo off
REM ============================================================================
REM CAMERAFORM - Clean Gradle/Metro caches (Windows, ASCII-safe)
REM
REM Use when you hit errors like:
REM   - "Could not move temporary workspace to immutable location"
REM   - "Error resolving plugin [id: 'com.facebook.react.settings']"
REM   - Build succeeds but the app does not update
REM   - Metro bundler hangs / serves stale bundle
REM
REM Usage: open cmd in D:\APP\CAMERAFORM and run:
REM   scripts\clean.bat
REM ============================================================================

setlocal

echo.
echo ==== CAMERAFORM Clean ====
echo.

REM ----------------------------------------------------------------------------
REM 1) Stop any running Gradle daemons
REM ----------------------------------------------------------------------------
echo [1/5] Stopping Gradle daemons...
if exist "%~dp0..\android\gradlew.bat" (
    pushd "%~dp0..\android"
    call gradlew.bat --stop 2>nul
    popd
    echo   Done.
) else (
    echo   android/gradlew.bat not found. Skipping.
)

REM ----------------------------------------------------------------------------
REM 2) Clean Gradle project caches
REM ----------------------------------------------------------------------------
echo.
echo [2/5] Removing project Gradle caches...
if exist "%~dp0..\android\.gradle"   rmdir /s /q "%~dp0..\android\.gradle"
if exist "%~dp0..\android\app\build" rmdir /s /q "%~dp0..\android\app\build"
if exist "%~dp0..\android\build"     rmdir /s /q "%~dp0..\android\build"
echo   Done.

REM ----------------------------------------------------------------------------
REM 3) Clean Gradle user home caches (both default and D:\ location)
REM ----------------------------------------------------------------------------
echo.
echo [3/5] Removing Gradle user caches...
if exist "%USERPROFILE%\.gradle\caches" (
    rmdir /s /q "%USERPROFILE%\.gradle\caches"
    echo   Cleaned: %USERPROFILE%\.gradle\caches
)
if exist "D:\.gradle\caches" (
    rmdir /s /q "D:\.gradle\caches"
    echo   Cleaned: D:\.gradle\caches
)
echo   Done.

REM ----------------------------------------------------------------------------
REM 4) Clean Metro / RN caches
REM ----------------------------------------------------------------------------
echo.
echo [4/5] Removing Metro + RN caches...
if exist "%TEMP%\metro-cache" rmdir /s /q "%TEMP%\metro-cache"
for /d %%D in ("%TEMP%\metro-*")                        do rmdir /s /q "%%D" 2>nul
for /d %%D in ("%TEMP%\haste-map-*")                    do rmdir /s /q "%%D" 2>nul
for /d %%D in ("%TEMP%\react-native-packager-cache-*")  do rmdir /s /q "%%D" 2>nul
echo   Done.

REM ----------------------------------------------------------------------------
REM 5) Show Java version (RN 0.75 needs JDK 17)
REM ----------------------------------------------------------------------------
echo.
echo [5/5] Java version check:
java -version
echo.
echo   Note: React Native 0.75 needs JDK 17.
echo         If you see "22.x" above, install Temurin JDK 17 from:
echo         https://adoptium.net/temurin/releases/?version=17

echo.
echo ==== Clean complete ====
echo.
echo Next: run  scripts\android-retry.bat   to rebuild with retry.
echo.
endlocal
