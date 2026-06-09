# Contributing to MoshDither Studio

Thanks for your interest in contributing! This document covers setup, branch strategy, code standards, and the PR process.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Branch Strategy](#branch-strategy)
3. [Commit Conventions](#commit-conventions)
4. [Code Standards](#code-standards)
5. [Pull Request Process](#pull-request-process)
6. [Testing](#testing)
7. [Security](#security)
8. [Release Process](#release-process)

---

## Getting Started

### Prerequisites

- Node.js 22+
- Python 3.12+
- Git

### Clone & Install

```bash
git clone <repo-url>
cd moshdither-studio

# Node dependencies
cd packages/desktop-gui
npm install

# Python dependencies
cd ../python-backend
pip install -r requirements.txt
```

### Development

```bash
cd packages/desktop-gui
npm run dev
```

This starts the Vite dev server and launches the Electron window.

---

## Branch Strategy

We use a simplified GitFlow model:

| Branch | Purpose | Lifespan |
|--------|---------|----------|
| `main` | Production releases | Permanent |
| `develop` | Integration branch for next release | Permanent |
| `feature/*` | New features | Short-lived |
| `fix/*` | Bug fixes | Short-lived |
| `hotfix/*` | Critical production fixes | Short-lived |

### Workflow

1. Create a feature branch from `develop`:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/my-feature
   ```

2. Make your changes, commit, and push:
   ```bash
   git add .
   git commit -m "feat: add halftone angle randomization"
   git push -u origin feature/my-feature
   ```

3. Open a Pull Request against `develop`.

4. After review and CI pass, squash-merge into `develop`.

5. Release: merge `develop` → `main` with a version tag.

---

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Use When |
|------|----------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `docs` | Documentation-only changes |
| `style` | Formatting, semicolons, etc. (no code change) |
| `chore` | Build, deps, tooling changes |
| `security` | Security fix or hardening |

### Scopes

| Scope | Package/Area |
|-------|-------------|
| `gui` | `packages/desktop-gui` |
| `engine` | `packages/mosh-engine` |
| `python` | `packages/python-backend` |
| `docs` | Documentation |
| `ci` | CI/CD workflows |
| `security` | Security-related changes |

### Examples

```
feat(gui): add temporal noise shader

Implements a time-varying noise overlay with configurable
intensity and color quantization levels.

fix(python): prevent shell injection in ffmpeg_convert

BREAKING CHANGE: ffmpeg_convert now accepts list of args
instead of a string. All call sites updated.

docs: add API_SPEC.md for IPC and Python RPC contracts
```

---

## Code Standards

### TypeScript

- **Strict mode enabled.** No `any` without a `// @ts-expect-error` or explicit justification.
- Use `unknown` for IPC payloads; cast at consumption point.
- Prefer `const`/`let` over `var`.
- Functions should have explicit return types when exported.

### React

- Function components only (no class components except `ErrorBoundary`).
- Hooks rules: never call conditionally, always in the same order.
- `useMemo`/`useCallback` only when profiling shows a need.
- Prefer React Context for shared state; avoid prop drilling beyond 2 levels.

### CSS / Styling

- Use Tailwind utility classes where possible.
- CSS custom properties (`--var`) for theming.
- Avoid inline `style={{ ... }}` in production code. Extract to CSS classes or Tailwind.

### Python

- Follow PEP 8.
- Use type hints for function signatures.
- No `subprocess.run(cmd, shell=True)`. Always pass argument lists.
- All functions should have docstrings.

---

## Pull Request Process

### Before Opening a PR

- [ ] Branch is up-to-date with `develop`
- [ ] `npm run lint` passes with zero errors
- [ ] `npx tsc -b` passes with zero errors
- [ ] `npm test` (or `pytest`) passes
- [ ] Changes are focused: one concern per PR

### PR Template

```markdown
## Summary
Brief description of what changed and why.

## Type
- [ ] feat
- [ ] fix
- [ ] refactor
- [ ] docs
- [ ] security

## Test Plan
- [ ] Unit tests added/updated
- [ ] Manual testing performed
- [ ] Screenshots attached (for UI changes)

## Breaking Changes
List any breaking changes and migration steps.

## Checklist
- [ ] Code follows style guide
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
```

### Review Requirements

- At least 1 approval from a maintainer
- All CI checks must pass
- No unresolved conversations

---

## Testing

### Running Tests

```bash
# Frontend unit tests
cd packages/desktop-gui
npm test

# Python tests
cd packages/python-backend
pytest
```

### Adding Tests

- Place test files adjacent to source: `ComponentName.test.tsx`
- Use descriptive test names: `it("resets state when mediaUrl is cleared")`
- Mock external dependencies (IPC, fetch, timers).
- Clean up after tests: `afterEach(() => { ... })`

---

## Security

See [`SECURITY.md`](./SECURITY.md) for vulnerability reporting.

When contributing security fixes:
- Do not open a public issue.
- Email security@moshdither.studio (placeholder).
- Include a minimal reproduction.

---

## Release Process

1. Update `CHANGELOG.md`
2. Bump version in `packages/desktop-gui/package.json`
3. Run full test suite
4. Tag: `git tag -a v1.5.0 -m "Release 1.5.0"`
5. Push tag: `git push origin v1.5.0`
6. GitHub Actions builds and publishes artifacts

---

## Questions?

Open a [Discussion](https://github.com/<org>/moshdither-studio/discussions) or reach out in Discord.
