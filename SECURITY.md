# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in MoshDither Studio, please report it responsibly:

1. **Do not open a public issue.**
2. Email the maintainers at: **security@moshdither.studio** (placeholder — update before release)
3. Include:
   - A clear description of the vulnerability
   - Steps to reproduce
   - Affected versions
   - Potential impact assessment

We aim to respond within 48 hours and provide a fix timeline within 72 hours.

## Security Model

### Threat Model

MoshDither Studio is a local-first desktop application. The primary threats are:

1. **Local privilege escalation** via the Python RPC server
2. **Path traversal** via file loading or media protocol abuse
3. **IPC exploitation** via compromised renderer process
4. **Dependency vulnerabilities** in Electron, Node.js, or Python packages

### Mitigations Implemented

| Layer | Mitigation |
|-------|-----------|
| **Renderer** | `contextIsolation: true`, `sandbox: true`, CSP meta tag, no `nodeIntegration` |
| **Preload** | Strict IPC channel whitelist (`VALID_SEND_CHANNELS`, `VALID_RECEIVE_CHANNELS`) |
| **Main Process** | IPC sender validation (`validateIpcSender`), navigation/window blocking |
| **Custom Protocol** | `media://` protocol with path traversal prevention |
| **Python RPC** | Token auth (`X-RPC-Token`), ephemeral port, method allowlist, 1MB payload cap |
| **Packaging** | Electron fuses: `runAsNode: false`, `nodeOptions: false`, ASAR integrity validation |

### Hardening Checklist

- [x] Context isolation enabled
- [x] Node integration disabled
- [x] Sandbox enabled
- [x] CSP defined
- [x] `will-navigate` handler blocks external URLs
- [x] `setWindowOpenHandler` denies popups
- [x] Permission handler restricts to `media` only
- [x] IPC sender origin validation
- [x] Custom protocol path sanitization
- [x] Python RPC token authentication
- [x] Python input validation (method allowlist, schema checks)
- [x] ffmpeg argument list construction (no shell injection)
- [x] Electron fuses flipped for production builds

## Dependencies

### Electron Security

The app targets the latest stable Electron release. Chromium and Node.js vulnerabilities are patched via Electron updates.

### Python Dependencies

Run `pip-audit` periodically to check for known vulnerabilities in Python packages:

```bash
pip install pip-audit
pip-audit --requirement packages/python-backend/requirements.txt
```

### Node Dependencies

```bash
cd packages/desktop-gui
npm audit
```

## Acknowledgments

We thank security researchers who responsibly disclose vulnerabilities. Contributors will be acknowledged in release notes unless they prefer anonymity.
