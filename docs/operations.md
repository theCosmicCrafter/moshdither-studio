# MoshDither Studio — Operations, Rollback & Escalation

**Version:** 1.0.0

---

## 1. Checkpoint Policy

### Frequency
- **Before** every external API call or sidecar invocation
- **Before** modifying `src-tauri/` Rust code (compilation is slow)
- **After** every 10 file changes across a session
- **Before** every release build

### Command
```powershell
pwsh scripts/checkpoint.ps1 -Message "description of current state"
```

### Tag Format
```
checkpoint/<yyyyMMdd-HHmmss>-<branch-name>
```

---

## 2. Compensating Actions

### External Services Requiring Rollback Awareness

| Service | Side Effect | Compensating Action |
|---------|------------|---------------------|
| FFmpeg sidecar | Writes output files to disk | Delete output file on failure |
| SAM3 Python bridge | Allocates GPU memory | Kill SAM3 process on timeout |
| File system writes | Saves images/video to user path | No compensation needed (user-initiated) |
| GitHub Releases | Publishes installer artifacts | Unpublish release, delete tag |

### Logging
Compensating actions are logged to `evals/compensating-actions.log`:
```
[20260727-230000] checkpoint=checkpoint/20260727-230000-main branch=main commit=abc123 msg="before video export refactor"
```

---

## 3. Human Escalation Triggers

The following conditions MUST halt autonomous execution and escalate to human review:

1. **Ambiguous requirements** — Conflicting information between `docs/PRD.md` and `docs/API_SPEC.md`
2. **Missing schemas** — Tauri IPC command referenced in frontend but not defined in Rust backend
3. **3 failed retries** — Build, test, or lint failure after 3 self-correction attempts
4. **External API auth failure** — SAM3 model download, FFmpeg sidecar verification, or GitHub API errors
5. **Token budget exceeded** — Per-milestone ceiling of 500K input + 150K output tokens
6. **Security finding** — Any HIGH or CRITICAL severity from Semgrep, CodeQL, or Snyk
7. **Sidecar binary missing** — FFmpeg, FFprobe, FFgac, or FFedit not found after `verify-external-bins`
8. **Rust compilation panic** — `cargo build` ICE or linker error

---

## 4. Token Budget Ceiling

| Scope | Input | Output | Tool Calls |
|-------|-------|--------|------------|
| Per milestone | 500K | 150K | 200 |
| Per session | 1M | 300K | 500 |
| Alert threshold | 80% | 80% | 80% |
| Circuit breaker | 100% | 100% | 100% |

---

## 5. Recovery Procedures

### Tauri Dev Server Crash
1. Kill orphaned processes: `Get-Process -Name "moshdither*" | Stop-Process -Force`
2. Free port 1420: `Get-NetTCPConnection -LocalPort 1420 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
3. Restart: `npm run tauri:dev`

### SAM3 Bridge Failure
1. Kill Python process: `Get-Process -Name "python*" | Where-Object { $_.MainWindowTitle -eq "" } | Stop-Process -Force`
2. Verify environment: `npm run setup:sam3-env`
3. Re-download checkpoint if corrupt: `npm run download:sam3-checkpoint`

### Rust Build Failure
1. Clean build artifacts: `cd src-tauri && cargo clean`
2. Check Rust toolchain: `rustup show`
3. Rebuild: `cd src-tauri && cargo build`

### WebGL Context Lost
1. Reload the WebView (Ctrl+R in dev mode)
2. If persistent: check GPU driver compatibility
3. Fallback: disable GPU preview in settings (CPU render only)

---

## 6. Monitoring

### Development
- Vite HMR console for frontend errors
- Rust `println!` / `eprintln!` via Tauri dev console
- SAM3 bridge stderr for Python errors

### Production
- Tauri crash reports (OS-level)
- User-submitted error logs
- GitHub Issues for bug tracking

---

## 7. Incident Response

| Severity | Response Time | Action |
|----------|--------------|--------|
| P0 — App crashes on launch | Immediate | Revert to last checkpoint, rebuild |
| P1 — Effect produces wrong output | 4 hours | Isolate effect, disable in registry, hotfix |
| P2 — UI glitch, non-blocking | 24 hours | Log issue, fix in next milestone |
| P3 — Cosmetic / polish | Next sprint | Add to backlog |
