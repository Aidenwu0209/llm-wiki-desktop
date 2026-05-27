#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

if [ -d "$HOME/.cargo/bin" ]; then
  export PATH="$HOME/.cargo/bin:$PATH"
fi

LOG_DIR="artifacts/smoke/macos"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/smoke-macos-clean-profile-${TIMESTAMP}.log"

mkdir -p "$LOG_DIR"

exec > >(tee -a "$LOG_FILE") 2>&1

CURRENT_STEP=""

on_exit() {
  status=$?
  if [ "$status" -eq 0 ]; then
    echo
    echo "macOS clean-profile smoke completed successfully."
    echo "Log: $LOG_FILE"
  else
    echo
    echo "macOS clean-profile smoke failed with exit code $status."
    if [ -n "$CURRENT_STEP" ]; then
      echo "Failed step: $CURRENT_STEP"
    fi
    echo "Log: $LOG_FILE"
  fi
}

run() {
  CURRENT_STEP="$*"
  echo
  echo "==> $*"
  "$@"
  CURRENT_STEP=""
}

trap on_exit EXIT

echo "LLM Wiki Desktop macOS clean-profile smoke"
echo "Repository: $REPO_ROOT"
echo "Log: $LOG_FILE"
echo "Started: $(date)"

echo
echo "==> Environment"
run uname -a
run sw_vers
run node --version
run npm --version
run rustc --version
run cargo --version
run xcode-select -p
run git rev-parse HEAD

echo
echo "==> Smoke commands"
run npm ci
run npm test
run npm run build

echo
echo "==> Rust tests from src-tauri"
pushd src-tauri >/dev/null
run cargo test
popd >/dev/null

echo
echo "==> Tauri app build"
echo "Running npm run build:app as a required smoke step. Missing scripts or build failures must fail this smoke."
run npm run build:app

echo
echo "Finished: $(date)"
