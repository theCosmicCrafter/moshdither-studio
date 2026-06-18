# Production Sprint — Remaining Master Checklist Items

> **For Claude:** REQUIRED SUB-SKILL: Use plan-driven-development to implement this plan task-by-task.

**Goal:** Complete the highest-impact remaining checklist items with full TDD coverage.

**Architecture:** Test-first development. Write failing tests, implement minimal code to pass, refactor.

**Tech Stack:** React + TypeScript + Vitest + jsdom + @testing-library/react (frontend), Rust built-in test framework (backend)

---

## Remaining Items (Full List)

See `docs/MASTER_CHECKLIST.md`. This sprint targets:
- Safe area / grid overlay
- Timeline zoom in/out
- Dark/Light theme toggle
- Mask rename/duplicate/delete UI
- Aspect ratio lock for output sizing

---

## Task 1: Set Up Testing Infrastructure

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`

**Step 1: Install test dependencies**
```bash
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

**Step 2: Create vitest config**
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
```

**Step 3: Create test setup**
```typescript
import '@testing-library/jest-dom';
```

**Step 4: Add tsconfig types**
```json
"types": ["vitest/globals", "@testing-library/jest-dom"]
```

**Step 5: Verify — run `npm test -- --run`**
Expected: No tests found yet, but config loads without errors.

---

## Task 2: Safe Area / Grid Overlay

**Files:**
- Create: `src/components/Preview/Overlays.test.tsx`
- Create: `src/components/Preview/Overlays.tsx`
- Modify: `src/components/Preview/index.tsx`
- Modify: `src/store/index.ts`

**Step 1: Write failing tests**
Test: renders safe area lines (80% and 90% of frame)
Test: renders grid lines (rule of thirds, center cross)
Test: toggles visibility based on store state
Test: respects aspect ratio

**Step 2: Implement Overlays component**
SVG overlay with configurable safe areas and grids.

**Step 3: Add store state**
`showSafeArea`, `showGrid`, `safeAreaPercent`, `gridType`

**Step 4: Wire into Preview**

**Step 5: Run tests — verify pass**

---

## Task 3: Timeline Zoom

**Files:**
- Create: `src/components/Timeline/zoom.test.ts`
- Modify: `src/components/Timeline/index.tsx`
- Modify: `src/store/index.ts`

**Step 1: Write failing tests**
Test: zoomIn increases zoom level
Test: zoomOut decreases zoom level
Test: zoom bounds (min 1x, max 10x)
Test: zoom affects frame-to-pixel mapping
Test: zoom preserves current playhead position

**Step 2: Implement zoom math**
Pure zoom functions in `zoom.ts`.

**Step 3: Add store state**
`timelineZoom: number` (default 1)

**Step 4: Wire zoom controls into Timeline UI**

**Step 5: Run tests — verify pass**

---

## Task 4: Dark/Light Theme Toggle

**Files:**
- Create: `src/theme/ThemeProvider.test.tsx`
- Create: `src/theme/ThemeProvider.tsx`
- Create: `src/theme/types.ts`
- Modify: `src/store/index.ts`
- Modify: `src/main.tsx`
- Modify: `src/index.css`

**Step 1: Write failing tests**
Test: defaults to dark theme
Test: toggles to light theme
Test: persists theme to localStorage
Test: applies CSS class to document

**Step 2: Implement ThemeProvider**
Context/provider pattern with localStorage persistence.

**Step 3: Add store state**
`theme: 'dark' | 'light'`

**Step 4: Update CSS for light mode**
Use CSS custom properties for all colors.

**Step 5: Run tests — verify pass**

---

## Task 5: Mask Rename / Duplicate / Delete

**Files:**
- Create: `src/components/MaskPanel/MaskManager.test.tsx`
- Create: `src/components/MaskPanel/MaskManager.tsx`
- Modify: `src/store/index.ts`
- Modify: `src/components/MaskPanel/index.tsx`

**Step 1: Write failing tests**
Test: renders mask list with names
Test: rename updates mask name
Test: duplicate creates copy with "(copy)" suffix
Test: delete removes mask
Test: visibility toggle works

**Step 2: Implement MaskManager component**
List with inline editing, action buttons.

**Step 3: Add store actions**
`renameMask(id, name)`, `duplicateMask(id)`, `deleteMask(id)`

**Step 4: Wire into MaskPanel**

**Step 5: Run tests — verify pass**

---

## Task 6: Aspect Ratio Lock for Output Sizing

**Files:**
- Create: `src/utils/aspectRatio.test.ts`
- Create: `src/utils/aspectRatio.ts`
- Modify: `src/components/ExportPanel/index.tsx`
- Modify: `src/store/index.ts`

**Step 1: Write failing tests**
Test: calculateAspectRatio(1920, 1080) = 16/9
Test: lock width changes height proportionally
Test: lock height changes width proportionally
Test: fit mode scales to fit within bounds
Test: fill mode scales to cover bounds
Test: stretch mode ignores aspect ratio

**Step 2: Implement aspect ratio math**
Pure functions for aspect ratio calculations.

**Step 3: Add store state**
`outputSizing: { mode: 'fit' | 'fill' | 'stretch', aspectRatioLocked: boolean }`

**Step 4: Wire into ExportPanel**

**Step 5: Run tests — verify pass**

---

## Task 7: Rust Tests for Audio Module

**Files:**
- Modify: `src-tauri/src/audio/mod.rs`

**Step 1: Write failing tests**
Test: AudioBakeData deserializes correctly
Test: FrameAudioFeatures has all fields
Test: inject_params adds _audio_ prefix keys
Test: inject_params handles missing frame gracefully

**Step 2: Implement test module**

**Step 3: Run `cargo test`**

---

## Task 8: Run Full Test Suite

**Step 1: Frontend tests**
```bash
npm test -- --run
```

**Step 2: Rust tests**
```bash
cd src-tauri && cargo test
```

**Step 3: Type checking**
```bash
npm run build
```

**Step 4: Lint**
```bash
npm run lint
```

---

## Commit Plan

1. Commit: `test: setup vitest + testing-library infrastructure`
2. Commit: `feat: safe area and grid overlay on preview`
3. Commit: `feat: timeline zoom in/out`
4. Commit: `feat: dark/light theme toggle`
5. Commit: `feat: mask rename, duplicate, delete UI`
6. Commit: `feat: aspect ratio lock and fit/fill/stretch output sizing`
7. Commit: `test: Rust audio module unit tests`
8. Commit: `chore: update master checklist`
