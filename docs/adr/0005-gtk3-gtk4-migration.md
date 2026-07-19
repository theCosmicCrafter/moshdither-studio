# ADR 0005: GTK3 Transitive Dependency and GTK4 Migration Path

## Status

Accepted — triaged. No code changes required until upstream Tauri adds GTK4/WebKitGTK 6.0 support.

## Context

MoshDither Studio is a Tauri v2 desktop application. On Linux, Tauri v2 currently depends on the GTK3-based WebKitGTK 4.1 stack:

- `libgtk-3-dev`
- `libwebkit2gtk-4.1-dev`
- `libappindicator3-dev`

These are **transitive system dependencies** pulled in by Tauri’s `wry` / `tao` runtime. The deprecation warnings that appear in CI or on some distributions are emitted by GTK3 and libappindicator, not by MoshDither Studio code.

GTK3 reached end-of-life upstream, and `libappindicator` is deprecated in favor of `libayatana-appindicator` or the D-Bus-based `ksni` protocol. Tauri is tracking migration to GTK4 and WebKitGTK 6.0.

## Decision

We will **continue shipping on GTK3/WebKitGTK 4.1 for Linux** because:

1. Tauri v2’s Linux backend currently requires this stack.
2. Migrating before upstream support lands would require maintaining a fork of `wry`/`tao`/`tauri-runtime`, which is out of scope for this project.
3. The warnings are cosmetic / security-debt signals, not runtime blockers.

When Tauri merges and releases GTK4 support, we will migrate the build environment and release pipeline to the new stack.

## Consequences

- Linux CI and release builds continue using `ubuntu-22.04` with the documented apt packages.
- Users may see GTK3 deprecation notices in system logs; these do not affect app functionality.
- We accept a small amount of long-term maintenance debt that will be resolved by a future Tauri update.

## Migration Plan

1. **Prerequisites** — wait for Tauri release that includes:
   - `tauri-apps/tauri#14684` — GTK4 / WebKitGTK 6.0 migration
   - `tauri-apps/tauri#12562` — `gtk4-rs` runtime upgrade
   - `tauri-apps/wry#1530` — `webkitgtk6` port

2. **Update `release.yml` apt dependencies** from:
   ```yaml
   sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf xdg-utils
   ```
   to the GTK4 equivalents (exact package names will be documented by Tauri; expected):
   ```yaml
   sudo apt-get install -y libgtk-4-dev libwebkitgtk-6.0-4 libayatana-appindicator3-dev librsvg2-dev patchelf xdg-utils
   ```

3. **Update minimum Tauri version** in `src-tauri/Cargo.toml` to the GTK4-supporting release.

4. **Regression test** on both Wayland and X11 sessions, because GTK4 removes several X11-specific window-positioning APIs.

5. **Remove this ADR** or mark it superseded once the migration is complete.

## References

- [Tauri PR #14684 — migrate to GTK4 and WebKitGTK 6.0](https://github.com/tauri-apps/tauri/pull/14684)
- [Tauri Issue #12562 — Upgrade `tauri-runtime` to `gtk4-rs`](https://github.com/tauri-apps/tauri/issues/12562)
- [wry PR #1530 — Port to webkitgtk6](https://github.com/tauri-apps/wry/pull/1530)
- [Tauri Docs Issue #3141 — GTK3 to GTK4 migration docs](https://github.com/tauri-apps/tauri-docs/issues/3141)
