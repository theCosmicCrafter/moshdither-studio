# MoshDither Studio — UI/UX Improvement Plan

**Version:** 1.0  
**Date:** June 12, 2026  
**Status:** Ready for Implementation  
**Scope:** Comprehensive UX overhaul of the desktop-gui frontend

---

## Executive Summary

The current UI is functional but falls short of the "precision instrument" feel defined in the `DESIGN_SPEC_UNIFIED.md`. This plan identifies 10 high-impact improvement areas based on analysis of modern creative tools (DaVinci Resolve, Figma, Blender, After Effects) and the current codebase audit. All changes leverage existing dependencies (Framer Motion, Radix UI, Tailwind CSS) and require no new runtime packages.

**Quick Wins (Week 1):**
- Resizable panels
- Collapsible property sections
- Empty-state onboarding canvas
- Inline style → Tailwind migration (critical files)

**Medium Effort (Week 2–3):**
- Micro-interactions (hover, selection, drag)
- Effect stack thumbnails + drag-to-reorder
- Viewport HUD overlay
- Workspace preset system

**Deep Polish (Week 4+):**
- Keyboard shortcut hint system
- Advanced timeline with keyframe lanes
- Plugin/extension discovery UI
- Color-blind preview modes

---

## 1. Current State Analysis

### What Works Well
- Dark-first color system (`index.css` tokens are solid)
- Font stack (Inter + JetBrains Mono + Space Grotesk)
- Component atomic design (atoms/molecules/organisms/templates)
- Accessibility foundations (high contrast, color-blind modes, reduced motion)
- Command palette exists
- Error boundaries + crash recovery
- Framer Motion already in `package.json`

### Critical Pain Points

| Issue | Severity | Evidence | Impact |
|-------|----------|----------|--------|
| **Inline styles everywhere** | High | `PropertiesPanel.tsx` ~600 inline style objects; `StudioLayout.tsx` hardcoded pixel values | Unmaintainable, no hover states, CSP friction |
| **Fixed panel widths** | High | `StudioLayout.tsx`: left=320px, right=360px | No adaptability for small screens or user preference |
| **No section collapse** | High | `PropertiesPanel.tsx` is 1700+ lines, all content visible at once | Cognitive overload, excessive scrolling |
| **No visual feedback on interactions** | Medium | Buttons change instantly; no easing on state changes | Feels "cheap," reduces perceived quality |
| **Effect stack is text-only** | Medium | `EffectStack.tsx` shows names only, no thumbnails/previews | Hard to identify effects at a glance |
| **Viewport has no HUD** | Medium | Zoom/quality/aspect controls buried in `Viewport.tsx` state | Users lose context of current view settings |
| **No workspace presets** | Medium | Layout is rigid; no save/restore layout states | Power users can't optimize workflow |
| **SAM UI is cluttered** | Medium | Model status, IoU slider, background removal, post-processing, mask layers all in one block | Hard to follow the segmentation workflow |

---

## 2. Research: Modern Creative Tool Patterns

### DaVinci Resolve
- **Node-based workflows** contextual to the task at hand
- **Pages**: Edit, Color, Fusion, Fairlight, Deliver — each is a complete workspace
- **Dual viewer**: Source vs. Timeline viewer with split-view toggle
- **Panels are modular**: Every panel can be undocked, resized, or hidden

### Figma
- **Auto-layout**: Components reflow intelligently
- **Minimal chrome**: The canvas dominates; UI is thin and contextual
- **Properties panel**: Collapsible sections with search; values are inline-editable
- **Component variants**: Compact dropdowns, not full-width selects

### Blender
- **Workspace tabs**: Layout, Modeling, Sculpting, Animation, Rendering
- **Customizable regions**: Any panel edge can be dragged to resize
- **Tooltips everywhere**: Hover any control for a description + shortcut
- **Gizmos on canvas**: 3D manipulators that float over the viewport

### After Effects
- **Layer panel**: Thumbnail + name + visibility + solo + lock
- **Twirly sections**: Parameters grouped under disclosure triangles
- **Composition panel**: Info bar at bottom shows pixel coordinates, color values
- **RAM preview**: Spacebar = playback; UI shows green cache bar on timeline

### Lessons Applied
1. **Panels must be resizable** — users have different monitors and tasks
2. **Group related controls under collapsible headers** — reduces visual load
3. **Show state directly on the canvas** — don't bury info in sidebars
4. **Animate state changes** — 150ms ease transitions feel "premium"
5. **Give power users workspace presets** — one size never fits all

---

## 3. Improvement Areas

### 3.1 Resizable & Collapsible Panels

**Current:** Fixed 320px left / 360px right. Center canvas shrinks/grows but panels are rigid.

**Target:** Draggable panel edges with persisted widths in `localStorage`. Panels can be collapsed to icon-only mode (like VS Code's sidebar).

```
┌─────────────────────────────────────────────────────────────┐
│ [≡] │  Layers  │        Canvas (flex)        │  Properties  │
│     │  Effects │                             │  [×]         │
│     │  Presets │                             │              │
│     │          │                             │  ▼ General   │
│     │  [+]     │                             │    Opacity   │
│     │          │                             │    Blend     │
│     │          │                             │  ▲ Mask      │
│     │          │                             │  ▼ SAM       │
│     │          │                             │    Model...  │
└─────────────────────────────────────────────────────────────┘
```

**Implementation:**
- Add a `ResizablePanel` wrapper component using mouse event listeners
- Store `leftPanelWidth` / `rightPanelWidth` in `localStorage`
- Add collapse-to-icon button on each panel header
- Use CSS `resize` or a custom drag handle (1px border that becomes 4px on hover)

**Files to modify:**
- `src/components/templates/StudioLayout.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/PropertiesPanel.tsx`

---

### 3.2 Collapsible Property Sections (Accordion)

**Current:** PropertiesPanel is a single massive scrollable block. Every control is visible.

**Target:** Grouped into accordion sections:
- **General** (opacity, blend mode, time range)
- **Parameters** (effect-specific sliders)
- **Mask** (type selector, brush/radial/linear/SAM)
- **SAM AI** (model, threshold, background removal, post-processing)
- **Keyframes** (timeline scrubber per parameter)

**Implementation:**
- Use Radix UI's `@radix-ui/react-collapsible` (already a transitive dependency)
- Animate with Framer Motion `AnimatePresence` + `motion.div`
- Remember collapsed state per effect type in `localStorage`
- Add a "Collapse All / Expand All" button in the panel header

**Files to modify:**
- `src/components/layout/PropertiesPanel.tsx` (major refactor)
- Create `src/components/molecules/AccordionSection.tsx`

---

### 3.3 Empty-State Onboarding Canvas

**Current:** When no media is loaded, the center canvas is a black void.

**Target:** A beautiful, branded drop zone with:
- Animated logo (subtle glow pulse)
- Drag-and-drop area with dashed border
- "Import Media" button (primary CTA)
- Recent files list (if any)
- Keyboard shortcut hint: `Ctrl+O = Open`
- Background: subtle animated noise texture (already have `NoiseTexture` component)

**Implementation:**
- Create `src/components/organisms/EmptyCanvas.tsx`
- Use Framer Motion for the glow pulse animation
- Reuse existing `NoiseTexture` for the background
- Wire up drag-and-drop handlers from `Viewport.tsx`

---

### 3.4 Micro-Interactions & Animations

**Current:** State changes are instant. No easing.

**Target:** Every state change has a 150ms `ease-out` transition:
- Button hover: background color transition
- Toggle switch: spring animation (Framer Motion)
- Panel collapse: height animation with `AnimatePresence`
- Effect selection: left border slides in
- Toast entrance: slide-up + fade
- SAM mask generation: pulsing loading indicator

**Implementation:**
- Create `src/components/atoms/AnimatedSwitch.tsx` using Framer Motion
- Add `transition-all duration-150 ease-out` to all interactive elements
- Use `motion.div` for panel sections
- Toast stack: `AnimatePresence` with `initial={{ opacity: 0, y: 20 }}`

**Files to modify:**
- `src/components/atoms/Button.tsx`
- `src/components/atoms/Switch.tsx`
- `src/components/atoms/Toast.tsx`
- `src/index.css` (add global transition defaults)

---

### 3.5 Effect Stack Visual Redesign

**Current:** Text list with name + visibility toggle. No thumbnails.

**Target:** Rich effect cards with:
- **Thumbnail**: Mini preview of the effect (or icon if no preview)
- **Color stripe**: Left border color-coded by category (cyan=Python, purple=WebGL, amber=Combined)
- **Drag handle**: Reorder effects by dragging (critical for blend order)
- **Quick toggles**: Visibility + Solo + Lock (hover to reveal)
- **Active state**: Selected effect has a subtle glow border

**Implementation:**
- Use `@dnd-kit/core` or native HTML5 drag-and-drop for reordering
- Capture WebGL frame thumbnail on effect selection (or use icons as fallback)
- Color stripe from `--cat-python` / `--cat-webgl` / `--cat-combined` tokens

**Files to modify:**
- `src/components/EffectStack.tsx` (or wherever the effect list lives)
- `src/components/molecules/EffectCard.tsx` (new)

---

### 3.6 Viewport HUD Overlay

**Current:** Zoom/quality/aspect controls are in the Viewport component but not prominently displayed.

**Target:** A minimal HUD overlay on the canvas (like Blender's gizmo or Resolve's viewer info):
- **Top-left**: Zoom level (click to fit/100%/200%)
- **Top-right**: Quality mode badge (Live / Full / Still)
- **Bottom-left**: Timecode `00:00:00:00` + frame number
- **Bottom-right**: Resolution + aspect ratio
- **Center** (when paused): Play button overlay (fades out on hover)
- **SAM mode**: Crosshair cursor + point counter overlay

**Implementation:**
- Create `src/components/organisms/ViewportHUD.tsx`
- Position absolute over the WebGLCanvas
- Use CSS `pointer-events: none` on the container, `pointer-events: auto` on interactive elements
- Auto-hide after 2 seconds of inactivity (mouse idle)

---

### 3.7 Workspace Preset System

**Current:** Single fixed layout.

**Target:** Save/restore panel layouts:
- **Default**: Full 3-panel layout
- **Focus**: Maximized canvas, collapsed sidebars
- **Colorist**: Wide properties, timeline visible
- **Batch**: Render queue + batch processor visible
- User can save custom presets

**Implementation:**
- Add workspace state to `StudioContext`:
  ```typescript
  interface WorkspacePreset {
    id: string;
    name: string;
    leftPanelWidth: number;
    rightPanelWidth: number;
    leftPanelCollapsed: boolean;
    rightPanelCollapsed: boolean;
    visiblePanels: ('timeline' | 'hud' | 'renderQueue')[];
  }
  ```
- Persist in `localStorage`
- Add a workspace switcher dropdown in the toolbar

**Files to modify:**
- `src/context/StudioContext.tsx`
- `src/components/layout/Toolbar.tsx`

---

### 3.8 Inline Style → Tailwind Migration

**Current:** Hundreds of inline style objects throughout the codebase. The `DESIGN_SPEC_UNIFIED.md` defines a Tailwind-compatible token system, but it's not actually used.

**Target:** All styling via Tailwind classes or CSS custom properties. Zero inline styles (except dynamic positioning like canvas overlay coordinates).

**Migration Strategy:**
1. **Phase 1**: Replace common patterns with utility classes:
   - `style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}` → `className="flex flex-col gap-4"`
   - `style={{ padding: '16px' }}` → `className="p-4"`
   - `style={{ backgroundColor: 'var(--bg-surface)' }}` → `className="bg-[var(--bg-surface)]"`
2. **Phase 2**: Extract repeated patterns into component-level classes in `index.css`:
   ```css
   .panel-section {
     @apply flex flex-col gap-3 p-4 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)];
   }
   ```
3. **Phase 3**: Remove all inline styles from high-traffic files:
   - `PropertiesPanel.tsx`
   - `StudioLayout.tsx`
   - `Viewport.tsx`
   - `Toolbar.tsx`
   - `Sidebar.tsx`

**Benefits:**
- CSP compliance (no inline styles)
- Consistent spacing/sizing (Tailwind scale)
- Easier theming (all in CSS)
- Smaller bundle (classes are reused)

---

### 3.9 SAM UI Workflow Redesign

**Current:** All SAM controls in one flat block. Model status, threshold, background removal, post-processing, and mask layers are visually equal.

**Target:** A clear step-by-step flow:

```
┌─ SAM AI Segmentation ─────────────────────────┐
│                                                 │
│ Step 1: Model                                   │
│   [sam-vit-base ▼]  [Download]  ● Ready         │
│                                                 │
│ Step 2: Click on Preview                        │
│   [ ] Show hover preview (debounced)            │
│   Points: 3 (+)  |  (-)                         │
│                                                 │
│ Step 3: Refine                                │
│   IoU Threshold: [====●====] 0.65               │
│   [✓] Background Removal                        │
│                                                 │
│ Step 4: Post-Process                            │
│   ▼ Grow/Shrink  ▼ Blur  ▼ Fill Holes  ▼ Smooth │
│                                                 │
│ [Apply to Effect]  [Clear All Points]           │
└─────────────────────────────────────────────────┘
```

**Implementation:**
- Numbered steps with visual hierarchy
- Progress indicator (step 1 complete → step 2 active)
- Collapse previous steps once complete
- Inline preview of the mask in the panel (small thumbnail)

**Files to modify:**
- `src/components/layout/PropertiesPanel.tsx` (SAM section)
- Create `src/components/molecules/SAMWorkflow.tsx`

---

### 3.10 Keyboard Shortcut Hint System

**Current:** Command palette exists (`Ctrl+K`) but no in-UI hints.

**Target:** Contextual shortcut hints:
- Button tooltips show shortcut (e.g., "Undo (Ctrl+Z)")
- Shortcuts editor is accessible but also discoverable
- Press `?` to show a floating shortcut cheat sheet
- Shortcuts displayed in menu items

**Implementation:**
- Extend `Tooltip` component to accept a `shortcut` prop
- Add global `keydown` listener for `?` key
- Create `src/components/organisms/ShortcutSheet.tsx`

---

## 4. Design Token Refinements

The current tokens in `index.css` are good but need a few additions:

```css
/* Add to :root in index.css */
--transition-fast: 100ms ease-out;
--transition-base: 150ms ease-out;
--transition-slow: 300ms ease-out;

--panel-min-width: 240px;
--panel-max-width: 480px;
--toolbar-height: 48px; /* reduced from 56px for more canvas */
--timeline-height: 120px;

--z-toast: 10000;
--z-modal: 9000;
--z-dropdown: 8000;
--z-tooltip: 7000;
--z-hud: 500;
```

---

## 5. Implementation Roadmap

### Sprint 1: Foundation (Days 1–3)
1. Add transition tokens to `index.css`
2. Create `ResizablePanel` component
3. Refactor `StudioLayout.tsx` to use resizable panels
4. Create `AccordionSection` component
5. Refactor `PropertiesPanel.tsx` into collapsible sections

### Sprint 2: Polish (Days 4–6)
1. Create `EmptyCanvas` component
2. Add Framer Motion animations to `Switch`, `Button`, `Toast`
3. Create `ViewportHUD` component
4. Migrate top 5 files from inline styles to Tailwind

### Sprint 3: Power User Features (Days 7–10)
1. Redesign `EffectStack` with drag-to-reorder
2. Implement workspace preset system
3. Redesign SAM UI as step-by-step workflow
4. Add keyboard shortcut hint system
5. Add global `?` shortcut cheat sheet

### Sprint 4: Quality Assurance (Days 11–12)
1. Run full build + lint
2. Test all accessibility modes
3. Verify no inline styles remain (grep for `style={{`)
4. Cross-browser check (Chromium-based is primary, but verify)

---

## 6. Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| Inline style count | ~800+ | <50 (only dynamic coords) |
| PropertiesPanel scroll height | ~3000px | ~800px (collapsed defaults) |
| Effect identification time | ~3s (read text) | <1s (thumbnail + color) |
| New user time-to-first-effect | ~5min | <2min (empty state guidance) |
| Panel width flexibility | None | Fully resizable + collapsible |

---

## 7. Files to Create

```
src/components/molecules/
  AccordionSection.tsx      # Collapsible property group
  EffectCard.tsx             # Rich effect stack item
  ResizableHandle.tsx        # Drag-to-resize edge
  SAMWorkflow.tsx            # Step-by-step SAM UI

src/components/organisms/
  EmptyCanvas.tsx            # Drop zone / onboarding
  ViewportHUD.tsx            # Canvas overlay info
  ShortcutSheet.tsx          # ? key cheat sheet
  WorkspaceSwitcher.tsx      # Layout preset dropdown

src/hooks/
  useResizablePanel.ts       # Panel width + collapse state
  useWorkspace.ts            # Preset save/load
```

## 8. Files to Modify

```
src/components/templates/StudioLayout.tsx     # Resizable panels
src/components/layout/PropertiesPanel.tsx     # Accordion sections
src/components/layout/Toolbar.tsx             # Workspace switcher
src/components/layout/Sidebar.tsx              # Collapsible sections
src/components/organisms/Viewport.tsx          # HUD integration
src/components/EffectStack.tsx                 # Visual redesign
src/components/atoms/Button.tsx                # Motion transitions
src/components/atoms/Switch.tsx               # Motion transitions
src/components/atoms/Toast.tsx                  # AnimatePresence
src/index.css                                  # New tokens
src/context/StudioContext.tsx                  # Workspace state
```

---

*This plan was generated by the UI Wizard workflow. Each sprint should be implemented as a focused PR with manual verification steps.*
