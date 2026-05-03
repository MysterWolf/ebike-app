#!/bin/bash
# =============================================================================
# E-Bike App Startup Script
# =============================================================================
# This script starts the full development environment in three steps:
#
#   Section 1 — PATH setup
#     Exports ~/.npm-global/bin so globally installed npm packages
#     (react-native, expo, etc.) are available in all child processes.
#
#   Section 2 — Metro bundler (Terminal 1)
#     Opens a new terminal and starts the React Native Metro bundler
#     from the mobile/ directory. Metro compiles and serves the JS bundle
#     to the Android emulator.
#
#   Section 3 — Backend server (Terminal 2)
#     Opens a second terminal and starts the Node.js backend with
#     `npm run dev` from the backend/ directory.
#
#   Section 4 — Android emulator launch
#     Polls until Metro reports it is ready (listens on port 8081),
#     then launches the React Native app on the Android emulator via
#     `npx react-native run-android`.
# =============================================================================

# ── Section 1: PATH setup ────────────────────────────────────────────────────
export PATH="$HOME/.npm-global/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$SCRIPT_DIR/mobile"
BACKEND_DIR="$SCRIPT_DIR/backend"

# ── Section 1b: Start emulator if not running ──────────────────────────────
if ! ~/Android/Sdk/platform-tools/adb devices | grep -q "emulator"; then
  echo "Starting Pixel_3a_API_36 emulator..."
  ~/Android/Sdk/emulator/emulator -avd Pixel_3a_API_36 -no-snapshot-load &
  echo "Waiting for emulator to boot..."
  ~/Android/Sdk/platform-tools/adb wait-for-device
  echo 'Waiting for full boot...'
  until [ "$(~/Android/Sdk/platform-tools/adb shell getprop sys.boot_completed 2>/dev/null)" = '1' ]; do
    sleep 2
  done
  echo 'Emulator ready.'
  sleep 3
fi

# Kill any existing Metro on 8081
kill $(lsof -t -i:8081) 2>/dev/null
sleep 1

# ── Section 2: Metro bundler ─────────────────────────────────────────────────
echo "Starting Metro bundler in Terminal 1..."
gnome-terminal --title="Metro Bundler" -- bash -c "
  export PATH=\"$HOME/.npm-global/bin:\$PATH\"
  cd \"$MOBILE_DIR\"
  echo 'Starting Metro...'
  npx react-native start
  exec bash
"

# ── Section 3: Backend server ────────────────────────────────────────────────
echo "Starting backend server in Terminal 2..."
gnome-terminal --title="Backend Server" -- bash -c "
  export PATH=\"$HOME/.npm-global/bin:\$PATH\"
  cd \"$BACKEND_DIR\"
  echo 'Starting backend...'
  npm run dev
  exec bash
"

# ── Section 4: Wait for Metro then launch Android emulator (Terminal 3) ──────
echo "Opening Terminal 3 — will wait for Metro then launch Android emulator..."
gnome-terminal --title="Android Emulator" -- bash -c "
  export PATH=\"$HOME/.npm-global/bin:\$PATH\"
  cd \"$MOBILE_DIR\"
  echo 'Waiting for Metro to be ready on port 8081...'
  until curl -s http://localhost:8081/status | grep -q 'packager-status:running' 2>/dev/null; do
    sleep 2
  done
  echo 'Metro is ready. Launching Android emulator...'
  npx react-native run-android
  exec bash
"

echo "All three terminals launched. This window can be closed."
