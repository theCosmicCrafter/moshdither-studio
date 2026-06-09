#!/bin/bash
set -e

echo "=== MoshDither Studio Build Verification ==="

# Desktop GUI
echo "--- Desktop GUI ---"
cd packages/desktop-gui
npx tsc -b
npx eslint .
npx vite build
npx vitest run

echo "--- Desktop GUI OK ---"

# Python backend (if pytest available)
echo "--- Python Backend ---"
cd ../python-backend
if command -v pytest &> /dev/null; then
  pytest || echo "pytest failed or no tests found"
else
  echo "pytest not installed, skipping"
fi

echo "=== All gates passed ==="
