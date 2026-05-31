#!/usr/bin/env bash
set -euo pipefail

APP_BUNDLE="src-tauri/target/release/bundle/macos/LLM Wiki.app"
PROCESS_NAME="llm-wiki-desktop"
REQUIRE_SIGNATURE=0
KEEP_RUNNING=0

usage() {
  cat <<'USAGE'
Usage: bash scripts/smoke/macos-bundle-launch.sh [--app PATH] [--require-signature] [--keep-running]

Launches a built macOS app bundle and fails if the app process starts without
creating a visible window. Use --require-signature for public release assets.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --app)
      APP_BUNDLE="${2:?Missing value for --app}"
      shift 2
      ;;
    --require-signature)
      REQUIRE_SIGNATURE=1
      shift
      ;;
    --keep-running)
      KEEP_RUNNING=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ ! -d "$APP_BUNDLE" ]; then
  echo "App bundle not found: $APP_BUNDLE" >&2
  exit 1
fi

INFO_PLIST="$APP_BUNDLE/Contents/Info.plist"
if [ ! -f "$INFO_PLIST" ]; then
  echo "Info.plist not found in app bundle: $APP_BUNDLE" >&2
  exit 1
fi

EXECUTABLE_NAME="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$INFO_PLIST")"
EXECUTABLE_PATH="$APP_BUNDLE/Contents/MacOS/$EXECUTABLE_NAME"
if [ ! -x "$EXECUTABLE_PATH" ]; then
  echo "Bundle executable is missing or not executable: $EXECUTABLE_PATH" >&2
  exit 1
fi

echo "App bundle: $APP_BUNDLE"
echo "Executable: $EXECUTABLE_PATH"
/usr/bin/file "$EXECUTABLE_PATH"

if [ "$REQUIRE_SIGNATURE" -eq 1 ]; then
  /usr/sbin/spctl --assess --type execute --verbose=4 "$APP_BUNDLE"
else
  if ! /usr/bin/codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"; then
    echo "Warning: bundle is not fully signed. Re-run with --require-signature for public release assets." >&2
  fi
fi

is_positive_int() {
  case "${1:-}" in
    ''|*[!0-9]*)
      return 1
      ;;
    *)
      [ "$1" -gt 0 ]
      ;;
  esac
}

existing_pids="$(/usr/bin/pgrep -x "$PROCESS_NAME" || true)"
if [ -n "$existing_pids" ]; then
  echo "Stopping existing $PROCESS_NAME processes before launch smoke."
  /usr/bin/pkill -x "$PROCESS_NAME" 2>/dev/null || true
  for _ in $(seq 1 10); do
    if ! /usr/bin/pgrep -x "$PROCESS_NAME" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

started_pid=""
cleanup() {
  if [ "$KEEP_RUNNING" -eq 0 ] && [ -n "$started_pid" ]; then
    /bin/kill "$started_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

/usr/bin/open -n "$APP_BUNDLE"

for _ in $(seq 1 30); do
  started_pid="$(/usr/bin/pgrep -n -x "$PROCESS_NAME" || true)"
  if [ -n "$started_pid" ]; then
    break
  fi
  sleep 1
done

if [ -z "$started_pid" ]; then
  echo "App process did not start: $PROCESS_NAME" >&2
  exit 1
fi

echo "Started PID: $started_pid"

window_count=""
for _ in $(seq 1 30); do
  window_count="$(/usr/bin/osascript \
    -e 'tell application "System Events"' \
    -e "set targetProc to first process whose unix id is $started_pid" \
    -e 'count of windows of targetProc' \
    -e 'end tell' 2>/dev/null || true)"
  if is_positive_int "$window_count"; then
    break
  fi
  sleep 1
done

if ! is_positive_int "$window_count"; then
  echo "App process started but no window was created." >&2
  /usr/bin/osascript \
    -e 'tell application "System Events"' \
    -e "set targetProc to first process whose unix id is $started_pid" \
    -e 'get {name of targetProc, visible of targetProc, frontmost of targetProc, background only of targetProc, count of windows of targetProc}' \
    -e 'end tell' 2>/dev/null || true
  exit 1
fi

echo "Window count: $window_count"
echo "macOS bundle launch smoke passed."
