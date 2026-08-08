# MoshDither Studio — Deployment & Infrastructure

**Version:** 1.0.0
**Source:** Synthesized from existing CI/CD and Tauri build configuration

---

## 1. Target Platforms

| Platform | Architecture | Shell | Status |
|----------|-------------|-------|--------|
| Windows 10/11 | x86_64 | Tauri + NSIS installer | ✅ Primary |
| macOS 12+ | x86_64 + ARM64 (Universal) | Tauri + DMG | 🔜 Planned |
| Linux (Ubuntu 22+) | x86_64 | Tauri + AppImage/deb | 🔜 Planned |

---

## 2. Build Pipeline

### Development
```bash
npm run tauri:dev      # Vite HMR + Rust cargo watch
```

### Production Build
```bash
npm run tauri:build    # Full release build with sidecars
```

### Pre-build Verification
The `prebuild` script (`scripts/verify-external-bins.mjs`) validates:
- FFmpeg sidecar binary exists and reports version
- FFprobe sidecar binary exists
- FFgac / FFedit (FFglitch) binaries exist
- SAM3 Python environment or sidecar is available
- `tauri.conf.json` external binary configuration is correct

---

## 3. Sidecar Binaries

| Binary | Source | Purpose |
|--------|--------|---------|
| `ffmpeg` | gyan.dev essentials build | Video encoding/decoding |
| `ffprobe` | gyan.dev essentials build | Media metadata probing |
| `ffgac` | FFglitch project | Datamoshing (GOP analysis) |
| `ffedit` | FFglitch project | Datamoshing (frame editing) |
| `sam3-bridge` | Built from `sam3_bridge.py` | AI segmentation (PyInstaller) |

Sidecar naming: `<name>-<target-triple>.exe` (e.g., `ffmpeg-x86_64-pc-windows-msvc.exe`)

---

## 4. CI/CD Checks (Must Pass Before Merge)

| Gate | Command | Threshold |
|------|---------|-----------|
| TypeScript | `npx tsc --noEmit` | 0 errors |
| ESLint | `npm run lint` | 0 warnings |
| Unit Tests | `npm run test` | All pass (1046+) |
| Production Build | `npm run build` | Clean exit |
| Secret Scan | `npm run secret-scan` | 0 findings |
| E2E Tests | `npm run test:e2e` | Critical paths pass |

### Security CI (`.github/workflows/security.yml`)
- Semgrep SAST
- CodeQL analysis
- TruffleHog secret scanning
- Snyk dependency audit
- Bandit Python analysis
- Trivy container scan

---

## 5. Code Signing

### Windows (EV Certificate)
```env
WIN_CSC_LINK=C:\certs\moshdither-ev.pfx
WIN_CSC_KEY_PASSWORD=<password>
```

### macOS (Developer ID)
```env
CSC_LINK=/Users/you/certs/moshdither-dev-id.p12
CSC_KEY_PASSWORD=<password>
APPLE_ID=developer@example.com
APPLE_ID_PASSWORD=<app-specific-password>
TEAM_ID=ABCD123456
```

---

## 6. Release Process

1. Run `evals/regression.ps1` — all gates must pass
2. Update `CHANGELOG.md` with version notes
3. Bump version in `package.json` and `src-tauri/tauri.conf.json`
4. Create checkpoint: `pwsh scripts/checkpoint.ps1 -Message "v0.x.0 release"`
5. Run `npm run tauri:build` for target platform
6. Create GitHub Release with built installers
7. Tag release: `git tag v0.x.0`

---

## 7. Rollback Strategy

### Bad Release
1. Unpublish the GitHub Release
2. Revert to previous checkpoint tag: `git checkout checkpoint/<tag>`
3. Rebuild and republish

### Failed Build
1. Check `evals/regression.ps1` output for failing gate
2. If Rust compilation fails: `cargo clean` + rebuild
3. If sidecar missing: re-run `node scripts/verify-external-bins.mjs`
4. If SAM3 broken: re-run `npm run setup:sam3-env`

---

## 8. Preview/Staging

This is a desktop application — there is no hosted staging environment.
Preview verification is done via:
- Local `npm run tauri:dev` testing
- CI artifact builds from feature branches
- Manual testing on target OS before release
