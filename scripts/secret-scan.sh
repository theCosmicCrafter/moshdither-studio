#!/usr/bin/env bash
# Secret scanner for MoshDither Studio using TruffleHog
# Usage: ./scripts/secret-scan.sh [--history] [--since-commit=SHA]

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TRUFFLEHOG="$REPO_ROOT/tools/trufflehog"

# Auto-download on macOS/Linux if missing
if [[ ! -f "$TRUFFLEHOG" ]]; then
    echo "TruffleHog not found. Downloading..."
    latest=$(curl -s "https://api.github.com/repos/trufflesecurity/trufflehog/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
    os=$(uname -s | tr '[:upper:]' '[:lower:]')
    arch=$(uname -m)
    if [[ "$arch" == "x86_64" ]]; then arch="amd64"; fi
    url="https://github.com/trufflesecurity/trufflehog/releases/download/${latest}/trufflehog_${latest#v}_${os}_${arch}.tar.gz"
    curl -L -o /tmp/trufflehog.tar.gz "$url"
    tar -xzf /tmp/trufflehog.tar.gz -C "$(dirname "$TRUFFLEHOG")"
    chmod +x "$TRUFFLEHOG"
    rm -f /tmp/trufflehog.tar.gz
    echo "TruffleHog installed: $TRUFFLEHOG"
fi

if [[ "${1:-}" == "--history" ]]; then
    echo "Scanning full git history..."
    shift
    "$TRUFFLEHOG" git "file://$REPO_ROOT" --since-commit=HEAD~50 --only-verified "$@"
else
    echo "Scanning working directory..."
    "$TRUFFLEHOG" filesystem "$REPO_ROOT" --only-verified "$@"
fi

echo ""
echo "No secrets detected. Clean!"
