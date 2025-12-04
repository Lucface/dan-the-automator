#!/bin/bash

# Content Collector - Mac Quick Capture Installer
# Installs a global hotkey (⌘⇧C) for instant content capture

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="ContentCapture"
INSTALL_DIR="$HOME/.content-collector"
LAUNCH_AGENT_DIR="$HOME/Library/LaunchAgents"
LAUNCH_AGENT="com.dan-automator.content-capture.plist"

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║          Content Collector - Mac Installer                    ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Check for required tools
if ! command -v osascript &> /dev/null; then
    echo "Error: osascript not found. This script requires macOS."
    exit 1
fi

# Create installation directory
mkdir -p "$INSTALL_DIR"

# Prompt for configuration
echo "Enter your Content Collector server URL:"
echo "(e.g., https://your-server.com or http://localhost:3001)"
read -r SERVER_URL

echo ""
echo "Enter your API secret:"
read -rs API_SECRET
echo ""

# Save configuration
cat > "$INSTALL_DIR/config.sh" << EOF
#!/bin/bash
export CONTENT_COLLECTOR_URL="$SERVER_URL"
export CONTENT_COLLECTOR_SECRET="$API_SECRET"
EOF

chmod 600 "$INSTALL_DIR/config.sh"

# Create the capture script
cat > "$INSTALL_DIR/capture.sh" << 'CAPTURE_SCRIPT'
#!/bin/bash

# Load configuration
source "$HOME/.content-collector/config.sh"

# Get clipboard content
CONTENT=$(pbpaste)

if [ -z "$CONTENT" ]; then
    osascript -e 'display notification "Clipboard is empty" with title "Content Capture"'
    exit 1
fi

# Optional: Show dialog for context
CONTEXT=$(osascript -e 'try
    set userInput to display dialog "Add context (optional):" default answer "" buttons {"Cancel", "Capture"} default button "Capture" with title "Content Capture"
    return text returned of userInput
on error
    return ""
end try' 2>/dev/null || echo "")

# Build JSON payload
if [ -n "$CONTEXT" ]; then
    JSON=$(cat <<EOF
{
    "content": $(echo "$CONTENT" | jq -Rs .),
    "context": $(echo "$CONTEXT" | jq -Rs .),
    "source": "mac-hotkey",
    "sourceDevice": "Mac"
}
EOF
)
else
    JSON=$(cat <<EOF
{
    "content": $(echo "$CONTENT" | jq -Rs .),
    "source": "mac-hotkey",
    "sourceDevice": "Mac"
}
EOF
)
fi

# Send to server
RESPONSE=$(curl -s -X POST "$CONTENT_COLLECTOR_URL/api/capture" \
    -H "Authorization: Bearer $CONTENT_COLLECTOR_SECRET" \
    -H "Content-Type: application/json" \
    -d "$JSON")

# Check result
if echo "$RESPONSE" | grep -q '"success":true'; then
    osascript -e 'display notification "Content captured!" with title "Content Capture" sound name "Glass"'
else
    osascript -e 'display notification "Capture failed" with title "Content Capture" sound name "Basso"'
fi
CAPTURE_SCRIPT

chmod +x "$INSTALL_DIR/capture.sh"

# Create quick capture script (no dialog)
cat > "$INSTALL_DIR/quick-capture.sh" << 'QUICK_SCRIPT'
#!/bin/bash

# Load configuration
source "$HOME/.content-collector/config.sh"

# Get clipboard content
CONTENT=$(pbpaste)

if [ -z "$CONTENT" ]; then
    osascript -e 'display notification "Clipboard is empty" with title "Content Capture"'
    exit 1
fi

# Build JSON payload
JSON=$(cat <<EOF
{
    "content": $(echo "$CONTENT" | jq -Rs .),
    "source": "mac-hotkey",
    "sourceDevice": "Mac"
}
EOF
)

# Send to server
RESPONSE=$(curl -s -X POST "$CONTENT_COLLECTOR_URL/api/capture/quick" \
    -H "Authorization: Bearer $CONTENT_COLLECTOR_SECRET" \
    -H "Content-Type: application/json" \
    -d "$JSON")

# Check result
if echo "$RESPONSE" | grep -q '"success":true'; then
    osascript -e 'display notification "Captured!" with title "Content Capture" sound name "Glass"'
else
    osascript -e 'display notification "Capture failed" with title "Content Capture" sound name "Basso"'
fi
QUICK_SCRIPT

chmod +x "$INSTALL_DIR/quick-capture.sh"

# Create AppleScript application for Automator/Services
cat > "$INSTALL_DIR/CaptureClipboard.applescript" << 'APPLESCRIPT'
on run
    do shell script "$HOME/.content-collector/quick-capture.sh"
end run
APPLESCRIPT

# Compile AppleScript to app
osacompile -o "$INSTALL_DIR/ContentCapture.app" "$INSTALL_DIR/CaptureClipboard.applescript"

echo ""
echo "Installation complete!"
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  Next Steps - Set Up Global Hotkey                           ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Option 1: Using Automator (Recommended)"
echo "────────────────────────────────────────"
echo "1. Open Automator"
echo "2. Create new Quick Action"
echo "3. Set 'Workflow receives' to 'no input'"
echo "4. Add 'Run Shell Script' action"
echo "5. Paste: $INSTALL_DIR/quick-capture.sh"
echo "6. Save as 'Content Capture'"
echo "7. Go to System Settings → Keyboard → Keyboard Shortcuts"
echo "8. Select 'Services' → 'Content Capture'"
echo "9. Add shortcut ⌘⇧C"
echo ""
echo "Option 2: Using BetterTouchTool or Keyboard Maestro"
echo "────────────────────────────────────────────────────"
echo "Set hotkey to run: $INSTALL_DIR/quick-capture.sh"
echo ""
echo "Option 3: Using Raycast"
echo "───────────────────────"
echo "1. Open Raycast Settings → Extensions"
echo "2. Add Script Command"
echo "3. Point to: $INSTALL_DIR/capture.sh"
echo "4. Set hotkey"
echo ""
echo "Manual test:"
echo "────────────"
echo "Copy something to clipboard, then run:"
echo "  $INSTALL_DIR/quick-capture.sh"
echo ""
