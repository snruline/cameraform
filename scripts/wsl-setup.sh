#!/usr/bin/env bash
# ============================================================================
# CAMERAFORM - WSL2 Ubuntu dev environment setup
#
# Purpose:
#   Install JDK 17, Node.js 20, Android SDK cmdline-tools + platform-tools
#   inside WSL Ubuntu, so `npm run android` works without Windows antivirus
#   interference (Sophos/SentinelOne don't scan inside WSL's ext4 vhd).
#
# Prereqs:
#   - WSL Ubuntu 22.04 running (wsl -d Ubuntu-22.04)
#   - Internet access from WSL
#   - sudo password (you own your WSL instance — this is separate from
#     Windows admin rights)
#
# Usage:
#   Inside WSL:
#     bash /mnt/d/APP/CAMERAFORM/scripts/wsl-setup.sh
# ============================================================================

set -e

echo ""
echo "==== CAMERAFORM WSL Dev Environment Setup ===="
echo ""

# ----------------------------------------------------------------------------
# 1) APT packages: JDK 17, build tools, unzip, git
# ----------------------------------------------------------------------------
echo "[1/5] Installing apt packages (needs sudo)..."
sudo apt update
sudo apt install -y openjdk-17-jdk unzip curl git build-essential

# ----------------------------------------------------------------------------
# 2) Node.js 20 via nvm (no sudo needed)
# ----------------------------------------------------------------------------
echo ""
echo "[2/5] Installing nvm + Node.js 20..."
if [ ! -d "$HOME/.nvm" ]; then
    curl -fsSL -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

nvm install 20
nvm alias default 20
nvm use 20

echo "  Node: $(node --version)"
echo "  npm:  $(npm --version)"

# ----------------------------------------------------------------------------
# 3) Android SDK command-line tools + platform-tools
# ----------------------------------------------------------------------------
echo ""
echo "[3/5] Installing Android SDK..."
ANDROID_SDK_ROOT="$HOME/Android/Sdk"
mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools"

if [ ! -d "$ANDROID_SDK_ROOT/cmdline-tools/latest" ]; then
    TMP=$(mktemp -d)
    cd "$TMP"
    CMDLINE_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
    echo "  Downloading Android cmdline-tools..."
    curl -fsSL -o cmdline-tools.zip "$CMDLINE_URL"
    unzip -q cmdline-tools.zip
    mv cmdline-tools "$ANDROID_SDK_ROOT/cmdline-tools/latest"
    cd "$HOME"
    rm -rf "$TMP"
fi

# Temporarily set env for this script
export ANDROID_HOME="$ANDROID_SDK_ROOT"
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

# Accept licenses + install packages
yes | sdkmanager --licenses > /dev/null 2>&1 || true
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" > /dev/null

# ----------------------------------------------------------------------------
# 4) Persist env vars to ~/.bashrc (idempotent)
# ----------------------------------------------------------------------------
echo ""
echo "[4/5] Writing env vars to ~/.bashrc..."

append_if_missing() {
    local line="$1"
    local file="$HOME/.bashrc"
    grep -qxF "$line" "$file" || echo "$line" >> "$file"
}

append_if_missing '# --- CAMERAFORM Android dev env ---'
append_if_missing 'export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64'
append_if_missing 'export ANDROID_HOME=$HOME/Android/Sdk'
append_if_missing 'export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator'

# ----------------------------------------------------------------------------
# 5) Summary
# ----------------------------------------------------------------------------
echo ""
echo "[5/5] Verifying installation..."
echo "  java:           $(java -version 2>&1 | head -1)"
echo "  node:           $(node --version)"
echo "  adb:            $(adb --version 2>&1 | head -1)"
echo "  sdkmanager:     OK"

echo ""
echo "==== WSL Setup Complete ===="
echo ""
echo "Next steps:"
echo "  1. Close this WSL shell and reopen (so ~/.bashrc loads)"
echo "  2. Copy the project into WSL filesystem (NOT under /mnt/d/):"
echo "       cp -r /mnt/d/APP/CAMERAFORM ~/CAMERAFORM"
echo "       cd ~/CAMERAFORM"
echo "       rm -rf node_modules android/.gradle android/app/build android/build"
echo "       npm install"
echo ""
echo "  3. Pair your phone over Wi-Fi ADB (see SETUP.md, WSL section)"
echo ""
echo "  4. Build:"
echo "       cd ~/CAMERAFORM"
echo "       npm run android"
echo ""
