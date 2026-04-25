# ==============================================================================
# CAMERAFORM Bootstrap Script - Windows PowerShell (ASCII-safe)
# ------------------------------------------------------------------------------
# This script:
#   1. Creates android/ and ios/ native folders from RN template
#   2. Installs all npm dependencies
#   3. Patches AndroidManifest.xml with required permissions
#      (camera, location, media) - NO Google Maps API key needed
#      because the map uses OpenStreetMap + Leaflet inside a WebView.
#   4. Patches android/build.gradle for vision-camera compatibility
#      (minSdkVersion 26, compileSdk/targetSdk 34)
#
# Usage (from project root):
#   PowerShell:  .\scripts\bootstrap.ps1
#   cmd:         scripts\bootstrap.bat
# ==============================================================================

$ErrorActionPreference = "Stop"

$ProjectName = "CameraForm"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "==== CAMERAFORM Bootstrap ====" -ForegroundColor Cyan
Write-Host "Root: $Root"

# ----------------------------------------------------------------------------
# 1) Check Node + npm
# ----------------------------------------------------------------------------
Write-Host "`n[1/5] Checking Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version
if ($LASTEXITCODE -ne 0) {
    throw "Node.js not found. Install it from https://nodejs.org first."
}
Write-Host "  Node: $nodeVersion"

# ----------------------------------------------------------------------------
# 2) Bootstrap android/ and ios/ folders from RN template
# ----------------------------------------------------------------------------
Write-Host "`n[2/5] Creating native folders..." -ForegroundColor Yellow
if ((Test-Path "android/app") -and (Test-Path "ios/$ProjectName")) {
    Write-Host "  Native folders already exist. Skipping." -ForegroundColor Gray
} else {
    $tempDir = Join-Path $env:TEMP "cameraform-bootstrap-$(Get-Random)"
    Write-Host "  Temp project at: $tempDir"

    npx --yes @react-native-community/cli@latest init $ProjectName `
        --version 0.75.4 `
        --directory $tempDir `
        --skip-install `
        --skip-git-init `
        --install-pods false

    if ($LASTEXITCODE -ne 0) { throw "RN init failed" }

    Write-Host "  Copying android/ and ios/ into project"
    if (Test-Path "android") { Remove-Item -Recurse -Force "android" }
    if (Test-Path "ios")     { Remove-Item -Recurse -Force "ios" }
    Copy-Item -Recurse "$tempDir/android" "./android"
    Copy-Item -Recurse "$tempDir/ios" "./ios"
    Remove-Item -Recurse -Force $tempDir
}

# ----------------------------------------------------------------------------
# 3) npm install
# ----------------------------------------------------------------------------
Write-Host "`n[3/5] Installing npm dependencies..." -ForegroundColor Yellow
npm install --legacy-peer-deps
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

# ----------------------------------------------------------------------------
# 4) Patch AndroidManifest.xml
# ----------------------------------------------------------------------------
Write-Host "`n[4/5] Patching AndroidManifest.xml..." -ForegroundColor Yellow
$manifestPath = "android/app/src/main/AndroidManifest.xml"
if (Test-Path $manifestPath) {
    $manifest = Get-Content $manifestPath -Raw

    $permissions = @(
        '<uses-permission android:name="android.permission.CAMERA" />',
        '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
        '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
        '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
        '<uses-feature android:name="android.hardware.camera" android:required="true" />'
    )
    foreach ($p in $permissions) {
        if ($manifest -notmatch [regex]::Escape($p)) {
            $manifest = $manifest -replace '(<uses-permission android:name="android.permission.INTERNET" />)', ('$1' + "`n    " + $p)
        }
    }

    # NOTE: No Google Maps API key meta-data is added.
    # The app renders OpenStreetMap tiles via Leaflet in a WebView,
    # so no Maps SDK / billing account is required.

    Set-Content -Path $manifestPath -Value $manifest -Encoding UTF8
    Write-Host "  Patched: $manifestPath"
} else {
    Write-Host "  Manifest not found at $manifestPath" -ForegroundColor Red
}

# ----------------------------------------------------------------------------
# 5) Patch build.gradle (minSdkVersion 26 for vision-camera)
# ----------------------------------------------------------------------------
Write-Host "`n[5/5] Patching build.gradle..." -ForegroundColor Yellow
$gradlePath = "android/build.gradle"
if (Test-Path $gradlePath) {
    $gradle = Get-Content $gradlePath -Raw
    $gradle = $gradle -replace 'minSdkVersion = \d+', 'minSdkVersion = 26'
    $gradle = $gradle -replace 'compileSdkVersion = \d+', 'compileSdkVersion = 34'
    $gradle = $gradle -replace 'targetSdkVersion = \d+', 'targetSdkVersion = 34'
    Set-Content -Path $gradlePath -Value $gradle -Encoding UTF8
    Write-Host "  Patched: $gradlePath"
}

# ----------------------------------------------------------------------------
Write-Host "`n==== Done ====" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. (Map) No API key needed. The app uses OpenStreetMap + Leaflet"
Write-Host "     via a WebView, so no Google Cloud / billing setup is required."
Write-Host "  2. Connect your phone via USB (enable USB Debugging)"
Write-Host "     Check with: adb devices"
Write-Host "  3. Run the app: npm run android"
Write-Host ""
