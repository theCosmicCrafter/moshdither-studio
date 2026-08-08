# MoshDither Studio — Project Structure & Conventions

**Version:** 1.0.0
**Source:** Synthesized from existing codebase patterns

---

## 1. Directory Layout

```
moshdither-studio/
├── src/                          # React + TypeScript frontend
│   ├── components/               # UI components (PascalCase directories)
│   │   ├── EffectStack/          # Multi-file components get own directory
│   │   │   ├── index.tsx         # Main export
│   │   │   └── ParameterPanel.tsx
│   │   ├── Toolbar.tsx           # Single-file components at root level
│   │   ├── PreviewViewport.tsx
│   │   └── __tests__/            # Component tests co-located
│   ├── engine/                   # WebGL rendering engine
│   │   ├── shaders/              # GLSL shaders + shader tests
│   │   └── audio/                # Audio-reactive engine
│   ├── hooks/                    # React hooks (camelCase: usePresets.ts)
│   ├── lib/                      # Framework adapters (tauri.ts, browserFallback.ts)
│   ├── store/                    # Zustand store (index.ts + test files)
│   ├── utils/                    # Pure utility functions (camelCase)
│   └── index.css                 # Global styles + design tokens
├── src-tauri/                    # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── main.rs               # Tauri entry point
│   │   ├── lib.rs                # Command registration
│   │   └── effects/              # Effect trait implementations (snake_case)
│   ├── sam3_bridge.py            # Python SAM3 segmentation bridge
│   ├── Cargo.toml
│   └── tauri.conf.json
├── tests/                        # E2E and integration tests
│   ├── e2e/                      # Playwright E2E specs
│   └── scripts/                  # Build/setup verification tests
├── evals/                        # Athena eval suite
│   ├── suite/                    # Benchmark tasks
│   └── regression.ps1            # CI regression gate
├── scripts/                      # Build and automation scripts
├── docs/                         # Project documentation
│   ├── milestones/               # JIT milestone specs
│   └── *.md                      # Canonical docs
├── public/                       # Static assets served by Vite
├── assets/                       # App icons, images
├── models/                       # ML model files (SAM3 ONNX)
└── packages/                     # Shared packages (if any)
```

---

## 2. Naming Conventions

| Scope | Convention | Example |
|-------|-----------|---------|
| React components | PascalCase | `PreviewViewport.tsx`, `EffectStack/` |
| Hooks | camelCase with `use` prefix | `usePresets.ts`, `useProject.ts` |
| Utilities | camelCase | `effectConverter.ts`, `beatDetection.ts` |
| Rust source files | snake_case | `frame_processor.rs`, `effect_registry.rs` |
| Test files | `*.test.ts(x)` or `*.spec.ts` | `components.test.tsx`, `store.test.ts` |
| CSS classes | kebab-case + Tailwind utilities | `neo-flat`, `solar-text` |
| Tauri IPC commands | snake_case | `apply_effect_stack`, `load_media` |
| Store actions | camelCase | `addToStack`, `toggleStackItem` |
| Environment variables | SCREAMING_SNAKE | `VITE_DEV_SERVER_URL` |

---

## 3. Component Patterns

### Single-File Components
Simple components live directly in `src/components/`:
```
src/components/Toolbar.tsx
```

### Multi-File Components
Complex components with sub-components get their own directory:
```
src/components/EffectStack/
├── index.tsx           # Main export
├── ParameterPanel.tsx  # Sub-component
└── styles.css          # Component-specific styles (if needed)
```

### Test Co-location
Tests live in `src/components/__tests__/` or adjacent to the module:
```
src/store/index.ts        → src/store/index.test.ts
src/utils/watermark.ts    → src/utils/watermark.e2e.test.ts
```

---

## 4. State Management

- **Library:** Zustand v4
- **Store location:** `src/store/index.ts`
- **Pattern:** Single flat store with typed selectors
- **Persistence:** None (project files handle save/load)
- **Type:** `AppState` interface with actions co-located

---

## 5. Error Handling

### Frontend (React)
- Tauri `invoke()` calls wrapped in try/catch
- User-facing errors displayed via toast notifications
- Console errors logged with `[Component]` prefix for tracing

### Backend (Rust)
- All Tauri commands return `Result<T, String>`
- Errors serialized as descriptive strings for IPC
- Effect errors include the effect ID in the message

### Python Bridge (SAM3)
- JSON-RPC over stdin/stdout
- Errors returned as `{"error": "message"}` objects
- Timeout: 30s per segmentation call

---

## 6. Git Workflow

- **Strategy:** Trunk-based development
- **Main branch:** `main`
- **Feature branches:** `feature/<name>` or `fix/<name>`
- **Session branches:** `session/<timestamp>-<task>` (via `scripts/new-task.ps1`)
- **Commit style:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`)
- **Pre-commit:** gitleaks, detect-secrets, semgrep, bandit (`.pre-commit-config.yaml`)
- **Merge:** Squash merge to main, delete source branch

---

## 7. Import Order Convention

```typescript
// 1. React / framework
import { useState, useRef } from "react";
// 2. Third-party libraries
import { invoke } from "@tauri-apps/api/core";
// 3. Store
import { useAppStore } from "../../store";
// 4. Local components
import ParameterPanel from "./ParameterPanel";
// 5. Utils / constants
import { PALETTE_PRESETS } from "../../engine/palettePresets";
// 6. Types (type-only imports)
import type { EffectMeta } from "../../store";
```
