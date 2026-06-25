import os
import sys
import json
from pathlib import Path

# Paths to verify
REQUIRED_COMPONENTS = [
    "src/components/AudioPanel",
    "src/components/CommandPalette.tsx",
    "src/components/DockSystem.tsx",
    "src/components/EffectBrowser.tsx",
    "src/components/EffectStack.tsx",
    "src/components/ExportPanel.tsx",
    "src/components/MaskPanel.tsx",
    "src/components/PresetPanel.tsx",
    "src/components/Timeline.tsx"
]

REQUIRED_TESTS = [
    "tests/e2e/audio-panel.spec.ts",
    "tests/e2e/command-palette.spec.ts",
    "tests/e2e/dock-system.spec.ts",
    "tests/e2e/effect-browser.spec.ts",
    "tests/e2e/effect-stack.spec.ts",
    "tests/e2e/export-panel.spec.ts",
    "tests/e2e/mask-panel.spec.ts",
    "tests/e2e/preset-panel.spec.ts",
    "tests/e2e/timeline.spec.ts"
]

def check_path_exists(project_root, relative_path):
    # Some paths might be directories, some might be exact files, 
    # we just check if it exists as file or directory.
    # For components, it could be .tsx, or a folder with index.tsx
    path = Path(project_root) / relative_path
    
    if path.exists():
        return True
        
    # If it's a file without extension in our list, try adding common ones
    if not path.suffix:
        for ext in ['.tsx', '.ts', '.jsx', '.js']:
            if path.with_suffix(ext).exists():
                return True
                
        # Also check if it's a directory with index.tsx
        if path.is_dir() and (path / 'index.tsx').exists():
            return True
            
    return False

def run_audit(project_root):
    print("=== Feature Audit ===")
    all_passed = True
    
    print("\nChecking Components:")
    for comp in REQUIRED_COMPONENTS:
        exists = check_path_exists(project_root, comp)
        status = "PASS" if exists else "FAIL"
        print(f"[{status}] {comp}")
        if not exists:
            all_passed = False
            
    print("\nChecking Tests:")
    for test_file in REQUIRED_TESTS:
        exists = check_path_exists(project_root, test_file)
        status = "PASS" if exists else "FAIL"
        print(f"[{status}] {test_file}")
        if not exists:
            all_passed = False

    print("\nChecking Package Scripts:")
    pkg_json_path = Path(project_root) / "package.json"
    if pkg_json_path.exists():
        try:
            with open(pkg_json_path, 'r', encoding='utf-8') as f:
                pkg_data = json.load(f)
                scripts = pkg_data.get('scripts', {})
                if 'audit:features' in scripts:
                    print("[PASS] audit:features script in package.json")
                else:
                    print("[FAIL] audit:features script in package.json")
                    all_passed = False
        except Exception as e:
            print(f"[FAIL] Error reading package.json: {e}")
            all_passed = False
    else:
        print("[FAIL] package.json not found")
        all_passed = False

    print("\n=== Audit Summary ===")
    if all_passed:
        print("Result: ALL FEATURES PRESENT")
        return 0
    else:
        print("Result: MISSING FEATURES DETECTED")
        return 1

if __name__ == "__main__":
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.exit(run_audit(project_root))
