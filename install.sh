#!/bin/bash
#
# PageSmith installer for macOS (Apple Silicon).
#
# Downloads the latest release via curl (which does NOT add the macOS
# quarantine attribute — that's the trick that makes this work without
# Apple Developer notarization), copies it to /Applications, and launches.
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/UtkarshaKumar/pagesmith/main/install.sh | bash
#

set -euo pipefail

REPO="UtkarshaKumar/pagesmith"
APP_NAME="PageSmith.app"
INSTALL_DIR="/Applications"
TMP_DIR=$(mktemp -d -t pagesmith-install)
trap 'rm -rf "$TMP_DIR"' EXIT

cleanup_mount() {
  if [ -d "$TMP_DIR/mount" ]; then
    hdiutil detach "$TMP_DIR/mount" -quiet 2>/dev/null || true
  fi
}
trap 'cleanup_mount; rm -rf "$TMP_DIR"' EXIT

echo "→ Resolving latest release..."
DMG_URL=$(curl -sSL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep -E 'browser_download_url.*\.dmg' \
  | head -1 \
  | sed -E 's/.*"(https[^"]+)".*/\1/')

if [ -z "$DMG_URL" ]; then
  echo "✗ Could not find a DMG asset on the latest release." >&2
  exit 1
fi

VERSION=$(echo "$DMG_URL" | grep -oE 'v?[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "unknown")
echo "→ Found PageSmith $VERSION"

echo "→ Downloading $(basename "$DMG_URL")..."
curl -L --fail --progress-bar -o "$TMP_DIR/PageSmith.dmg" "$DMG_URL"

echo "→ Mounting DMG..."
mkdir -p "$TMP_DIR/mount"
hdiutil attach "$TMP_DIR/PageSmith.dmg" \
  -mountpoint "$TMP_DIR/mount" \
  -nobrowse -quiet

if [ ! -d "$TMP_DIR/mount/$APP_NAME" ]; then
  echo "✗ $APP_NAME not found inside the DMG." >&2
  exit 1
fi

if [ -d "$INSTALL_DIR/$APP_NAME" ]; then
  echo "→ Removing previous installation..."
  rm -rf "$INSTALL_DIR/$APP_NAME"
fi

echo "→ Installing to $INSTALL_DIR..."
cp -R "$TMP_DIR/mount/$APP_NAME" "$INSTALL_DIR/"

echo "→ Detaching DMG..."
hdiutil detach "$TMP_DIR/mount" -quiet

# Belt and suspenders: clear quarantine in case anything still has it.
xattr -cr "$INSTALL_DIR/$APP_NAME" 2>/dev/null || true

echo "→ Launching PageSmith..."
open "$INSTALL_DIR/$APP_NAME"

echo ""
echo "✓ PageSmith $VERSION installed at $INSTALL_DIR/$APP_NAME"
