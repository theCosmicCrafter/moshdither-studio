# MoshDither Studio — Dependency Security Audit Report

**Date:** June 9, 2026  
**Auditor:** ODIN v5.0 (Project Lead / Quality Control)  
**Scope:** All npm (Node.js) and Python dependencies  
**Method:** Online CVE database search, `npm audit`, runtime version inspection, NVD/GitHub Advisory cross-reference

---

## 1. Executive Summary

| Category | Status | Critical Findings |
|----------|--------|-------------------|
| **Node.js / npm** | Mostly Clean | `npm audit` returned **0 vulnerabilities**. Vite and Electron are on patched versions. |
| **Python** | **1 CRITICAL** | Pillow 12.1.1 is vulnerable to buffer overflow (CVE-2026-42308). Must upgrade to >=12.2.0. |
| **Supply Chain Risk** | Monitor | No compromised packages detected in dependency tree, but 2026 has seen major npm attacks (axios, @bitwarden/cli). |

**Immediate Action Required:** Update Pillow from 12.1.1 to >=12.2.0. This is the only confirmed exploitable vulnerability in the current dependency tree.

---

## 2. Node.js / npm Dependencies

### 2.1 `npm audit` Result

```
found 0 vulnerabilities
```

The dependency tree has no known vulnerabilities according to the npm audit database as of June 9, 2026.

### 2.2 Direct Dependencies Analyzed

| Package | Installed | CVE / Advisory | Risk | Status |
|---------|-----------|---------------|------|--------|
| `electron` | `^42.3.3` | CVE-2026-34781 (clipboard.readImage DoS) | Low | **Patched** — fixed in 42.0.0-alpha.5; you have 42.3.3 |
| `react` / `react-dom` | `^19.2.6` | CVE-2025-55182, CVE-2026-23864, CVE-2026-23870 (RSC RCE/DoS) | Low | **Likely Not Exploitable** — These affect React Server Components (Next.js, etc.). MoshDither is an Electron desktop app that does not use RSC. Still, patch to latest 19.x is recommended. |
| `vite` | `^8.0.12` | CVE-2026-39363, CVE-2026-39364 (dev server info disclosure / fs.deny bypass) | Low | **Patched** — fixed in 8.0.5; you have 8.0.12. Only affects dev server (`npm run dev`), not production Electron builds. |
| `framer-motion` | `^12.40.0` | None found | None | **Clean** — Snyk and npm audit show no vulnerabilities. |
| `tailwindcss` | `^4.3.0` | None found | None | **Clean** — No CVEs in OSV database as of May 2026. |
| `lucide-react` | `^1.17.0` | None found | None | **Clean** — No direct vulnerabilities per Snyk. |
| `@phosphor-icons/react` | `^2.1.10` | None found | None | **Clean** — Snyk shows no vulnerabilities. |
| `@radix-ui/react-*` | various | None found | None | **Clean** — No CVEs discovered in search. |
| `clsx` | `^2.1.1` | None found | None | **Clean**. |
| `tailwind-merge` | `^3.6.0` | None found | None | **Clean**. |
| `class-variance-authority` | `^0.7.1` | None found | None | **Clean**. |

### 2.3 Dev Dependencies Analyzed

| Package | Installed | CVE / Advisory | Risk | Status |
|---------|-----------|---------------|------|--------|
| `vite-plugin-electron` | `^1.0.4` | None found | None | **Clean** — No CVEs in search. |
| `@electron/fuses` | `^2.1.2` | None found | None | **Clean**. |
| `electron-builder` | `^26.15.0` | None found | None | **Clean**. |
| `vitest` | `^3.2.0` | None found | None | **Clean**. |
| `typescript` | `~6.0.2` | None found | None | **Clean**. |

### 2.4 Transitive Dependency Risk: Axios

**Background:** Axios was compromised on March 31, 2026. Malicious versions `1.14.1` and `0.30.4` contained a cross-platform RAT.

**Finding:** Axios is **NOT** in your direct dependency list. `npm audit` returned 0 vulnerabilities, which means the compromised versions are not in your transitive dependency tree either.

**Recommendation:** Continue running `npm audit` in CI to catch any future transitive contamination.

### 2.5 Supply Chain Attacks (2026 Landscape)

| Attack | Date | Affected | In Your Tree? |
|--------|------|----------|---------------|
| Axios compromised | 2026-03-31 | `axios@1.14.1`, `axios@0.30.4` | No |
| @bitwarden/cli impersonation | 2026-04 | `@bitwarden/cli@2026.4.0` | No |
| Microsoft: 33 malicious npm packages | 2026-05-28/29 | Dependency confusion packages | No (audit clean) |
| TanStack supply chain | 2026-05 | Multiple TanStack packages | No (audit clean) |

---

## 3. Python Dependencies — CRITICAL FINDING

### 3.1 Pillow — Buffer Overflow Vulnerability

**Installed Version:** `12.1.1` (determined via `python -c "import PIL; print(PIL.__version__)"`)

**Requirements.txt Spec:** `Pillow>=10.0.0` (too permissive)

**CVE-2026-42308 — HIGH Severity**
- **Type:** Buffer Overflow / Integer Overflow (CWE-190)
- **Affected:** Pillow versions prior to `12.2.0`
- **Description:** Integer overflow in font glyph position tracking. Can be exploited through malformed fonts to cause memory corruption.
- **CVSS:** High
- **Exploitability:** Processing untrusted image files (e.g., user-uploaded media with embedded fonts)

**CVE-2026-25990 — HIGH Severity**
- **Type:** Out-of-bounds Write (Buffer Overflow)
- **Affected:** Pillow versions `10.3.0` through `12.1.0`
- **Description:** Triggered when processing specially crafted PSD (Adobe Photoshop Document) image files.
- **CVSS:** High
- **Exploitability:** Opening malicious PSD files

**Risk to MoshDither:**
- The app processes user-provided media (images, video frames).
- If a user imports a malicious PSD or an image with a malformed embedded font, it could trigger memory corruption.
- Since Pillow is used in the Python backend for image processing (dithering, palette extraction), this is a direct attack surface.

**Remediation:**

```bash
# In your Python virtual environment
pip install --upgrade "Pillow>=12.2.0"
```

Update `packages/python-backend/requirements.txt`:
```diff
- Pillow>=10.0.0
+ Pillow>=12.2.0
```

### 3.2 rich — No Known Vulnerabilities

**Installed Version:** Unknown (module lacks `__version__` attribute at runtime)  
**Requirements.txt Spec:** `rich>=13.0.0`

No CVEs or security advisories found for the `rich` library in 2026. It is primarily a terminal UI library with minimal attack surface.

---

## 4. Risk Matrix

| Dependency | Version | Severity | Exploitability | Action |
|------------|---------|----------|----------------|--------|
| **Pillow** | 12.1.1 | **HIGH** | High (user media input) | **UPDATE NOW to >=12.2.0** |
| React 19 (RSC) | 19.2.6 | Critical (CVSS 10.0) | Very Low (no RSC in Electron) | Patch when convenient |
| Vite (dev only) | 8.0.12 | High | Very Low (dev server only, already patched) | No action needed |
| Electron | 42.3.3 | Low | Low (already patched) | No action needed |
| All other npm | various | None | None | No action needed |

---

## 5. Recommendations

### Immediate (Today)

1. **Update Pillow** — Run `pip install --upgrade "Pillow>=12.2.0"` in the Python backend venv and update `requirements.txt`.

### Short-Term (This Week)

2. **Add `npm audit` to CI/CD** — Block builds on `npm audit` failures.
3. **Pin Python dependencies** — Replace `>=` with `==` or `~=` in `requirements.txt` after upgrading Pillow. Reproducible builds are a security requirement.
4. **Monitor React 19 patch releases** — Even though RSC is not used, staying on the latest patch version is good hygiene.

### Long-Term (This Month)

5. **Add Dependabot or Renovate** — Automated dependency update PRs catch CVEs within hours of disclosure.
6. **Add Snyk or Socket.dev scanning** — These tools detect supply chain risks (compromised packages, malicious code) that `npm audit` misses.
7. **Sign releases** — Electron Builder supports code signing. Unsigned binaries are trivial to replace with malicious copies.
8. **Enable Electron ASAR integrity validation** — Flip the `EnableEmbeddedAsarIntegrityValidation` fuse (mentioned in `PRODUCTION_HARDENING_PLAN.md`).

---

## 6. Verification Commands

```bash
# Node.js audit (run from packages/desktop-gui/)
npm audit --audit-level=moderate

# Python Pillow version check
python -c "import PIL; print(PIL.__version__)"

# Python Pillow update
pip install --upgrade "Pillow>=12.2.0"

# Check for axios in dependency tree (just to be safe)
npm ls axios

# Check Electron fuses (after build)
npx @electron/fuses read --app dist/
```

---

## 7. Sources Consulted

- NVD (National Vulnerability Database) — `nvd.nist.gov`
- GitHub Security Advisory Database — `github.com/advisories`
- Snyk Vulnerability Database — `security.snyk.io`
- SentinelOne Vulnerability Database — `sentinelone.com/vulnerability-database`
- Microsoft Security Blog — npm supply chain compromise (April 2026)
- Unit 42 / Palo Alto Networks — npm threat landscape
- React.dev Security Blog — RSC vulnerability disclosure
- Vite GitHub Security Advisories — CVE-2026-39363 / CVE-2026-39364

---

*Report compiled on June 9, 2026. Dependency vulnerabilities are time-sensitive; re-run this audit weekly during active development.*
