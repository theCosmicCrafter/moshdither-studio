# Moshdither Studio — Unified Design Specification

> **Version:** 1.0  
> **Date:** June 9, 2026  
> **Status:** Ready for Implementation  
> **Sources:** UX Design Report 2026, UI Research Report, UI Research Supplement, Independent Web Research

---

## 1. Design Philosophy

Moshdither Studio is a **professional-grade creative effects application**. It must feel like it belongs alongside DaVinci Resolve, Premiere Pro, and Figma — not a web app crammed into Electron.

**Core Principles:**

1. **Chrome recedes, content dominates** — The WebGL canvas is the star. UI panels are dark, minimal, and invisible until needed.
2. **Precision over flash** — This is a tool artists spend hours in. Every pixel of chrome must justify its existence.
3. **Dark-first by design** — The dark interface is the *designed* version. Light mode (if ever added) is secondary.
4. **Accessible by default** — WCAG 2.2 AA minimum. Creative software is used for long sessions; eye fatigue is a real concern.
5. **Personality through restraint** — Neon accents used sparingly (10% rule). One cyan glow speaks louder than five competing colors.

**The Mood:** Sitting in a dark lab, surrounded by precision instruments, about to break a video into beautiful pieces. Competent. Powerful. Beautifully restrained.

---

## 2. Color System (OKLCH-Based)

### 2.1 Why OKLCH?

Tailwind CSS v4 uses OKLCH as its default color space. Unlike hex/HSL, OKLCH is **perceptually uniform** — changing lightness actually looks like changing brightness to human eyes. No more "dead gray zone" in gradients.

For 2026 projects, OKLCH is the standard. We define colors via CSS custom properties using OKLCH values, which shadcn/ui and Tailwind v4 natively support.

### 2.2 Base Surface Tokens

| Token | OKLCH Value | Hex Approx | Usage |
|-------|-------------|------------|-------|
| `--bg-base` | `oklch(8% 0.01 270)` | `#0A0A0F` | Deepest background, empty canvas areas |
| `--bg-panel` | `oklch(12% 0.015 270)` | `#141419` | Sidebar, properties panel backgrounds |
| `--bg-surface` | `oklch(16% 0.02 270)` | `#1E1E24` | Elevated cards, modals, dropdowns |
| `--bg-hover` | `oklch(20% 0.02 270)` | `#2A2A32` | Row hover, button hover backgrounds |
| `--bg-active` | `oklch(24% 0.025 270)` | `#32323C` | Selected state, pressed buttons |
| `--border-subtle` | `oklch(22% 0.02 270 / 0.5)` | `#2E2E3880` | Panel dividers, inactive borders |
| `--border-default` | `oklch(30% 0.025 270 / 0.6)` | `#3A3A4599` | Active borders, focus rings |

### 2.3 Text Tokens

| Token | OKLCH Value | Hex Approx | Usage |
|-------|-------------|------------|-------|
| `--text-primary` | `oklch(92% 0.01 270)` | `#E8E8EC` | Headings, labels, primary content |
| `--text-secondary` | `oklch(72% 0.02 270)` | `#9CA3AF` | Descriptions, hints, metadata |
| `--text-muted` | `oklch(55% 0.015 270)` | `#6B7280` | Disabled text, placeholders |
| `--text-inverse` | `oklch(8% 0.01 270)` | `#0A0A0F` | Text on accent-colored buttons |

### 2.4 Accent Tokens (The "Neon" Identity)

| Token | OKLCH Value | Hex Approx | Usage |
|-------|-------------|------------|-------|
| `--accent-primary` | `oklch(65% 0.2 170)` | `#00D4AA` | Primary actions, focus rings, selection |
| `--accent-primary-glow` | `oklch(65% 0.2 170 / 0.3)` | — | Glow effects, shadows |
| `--accent-secondary` | `oklch(55% 0.18 340)` | `#EF4444` | Destructive actions, errors |
| `--accent-warning` | `oklch(70% 0.15 80)` | `#F59E0B` | Warnings, progress indicators |
| `--accent-info` | `oklch(60% 0.15 250)` | `#3B82F6` | Informational highlights |

**The 10% Rule:** Accent colors must not exceed 10% of any viewport area. One cyan button per panel, not five.

### 2.5 Category Colors (Effect Types)

| Category | Token | Color | Usage |
|----------|-------|-------|-------|
| Python Effects | `--cat-python` | `--accent-primary` (cyan) | Dither, Datamosh |
| WebGL Effects | `--cat-webgl` | `oklch(55% 0.15 280)` | Glitch, Halftone, CRT |
| Combined Pipeline | `--cat-combined` | `--accent-warning` (amber) | Multi-effect renders |

### 2.6 shadcn/ui Variable Mapping

Map to shadcn's standard CSS variable names for compatibility:

```css
@layer base {
  :root {
    --background: var(--bg-base);
    --foreground: var(--text-primary);
    --card: var(--bg-surface);
    --card-foreground: var(--text-primary);
    --popover: var(--bg-surface);
    --popover-foreground: var(--text-primary);
    --primary: var(--accent-primary);
    --primary-foreground: var(--text-inverse);
    --secondary: var(--bg-panel);
    --secondary-foreground: var(--text-primary);
    --muted: var(--bg-panel);
    --muted-foreground: var(--text-muted);
    --accent: var(--bg-hover);
    --accent-foreground: var(--text-primary);
    --destructive: var(--accent-secondary);
    --destructive-foreground: var(--text-primary);
    --border: var(--border-subtle);
    --input: var(--border-default);
    --ring: var(--accent-primary);
    --radius: 0.25rem;
  }
}
```

**Note:** `--radius: 0.25rem` (4px) max. This is a technical tool, not a consumer app. Sharp corners signal precision.

### 2.7 OKLCH Generation Strategy

Use **tweakcn.com** (the best shadcn theme generator per 2026 rankings) to:
1. Input base hue (170 for cyan, the "creative tech" signal)
2. Generate the full variable set in OKLCH
3. Export to `globals.css`
4. Manually override surface colors to be more neutral (reduce chroma for bg tokens)

---

## 3. Typography System

### 3.1 Font Stack

| Purpose | Font | Weight | Size Range | Source |
|---------|------|--------|------------|--------|
| UI Body / Labels | **Inter** | 400–500 | 12–14px | Google Fonts |
| UI Headings | **Inter** | 600–700 | 16–24px | Google Fonts |
| App Title / Brand | **Space Grotesk** | 700 | 20–28px | Google Fonts |
| Monospace / Params | **JetBrains Mono** | 400–500 | 11–13px | Google Fonts |
| Code / Logs | **JetBrains Mono** | 400 | 12px | Google Fonts |

**Why Inter over Space Grotesk for UI text:** Inter is designed for screen readability at small sizes. Space Grotesk has character but sacrifices legibility at 11px in a properties panel. Use Space Grotesk for *headlines and brand moments only*.

**Anti-aliasing:**
```css
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

### 3.2 Type Scale

| Token | Size | Line Height | Letter Spacing | Usage |
|-------|------|-------------|----------------|-------|
| `text-2xl` | 24px | 32px | -0.02em | App title, empty state headline |
| `text-xl` | 20px | 28px | -0.015em | Section headers, modal titles |
| `text-lg` | 16px | 24px | -0.01em | Panel titles, effect names |
| `text-base` | 14px | 20px | 0 | Body text, button labels |
| `text-sm` | 12px | 16px | 0.01em | Secondary labels, hints |
| `text-xs` | 11px | 14px | 0.02em | Parameter values, metadata |

### 3.3 Monospace Patterns

```css
.param-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.param-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--text-primary);
}
```

This creates the "data readout" aesthetic — parameters feel like instrument panel readings.

---

## 4. Component Architecture

### 4.1 Foundation: shadcn/ui

Install via CLI:
```bash
npx shadcn@latest init
npx shadcn add button slider switch select dialog tooltip progress scroll-area resizable
```

**Override all default styling** with the tokens in Section 2. Remove all default rounded corners.

### 4.2 Atmosphere Layer: Magic UI (Selective)

Install only these specific components:
```bash
npx magicui@latest add terminal
npx magicui@latest add noise-texture
npx magicui@latest add retro-grid
npx magicui@latest add border-beam
npx magicui@latest add shimmer-button
```

| Component | Where It Goes | Why |
|-----------|---------------|-----|
| `Terminal` | Render log output in modal | Typing effect matches CLI aesthetic |
| `Noise Texture` | App root overlay at 3% opacity | Prevents banding, adds film grain |
| `Retro Grid` | Empty state / splash background | 80s perspective without being kitschy |
| `Border Beam` | Effect cards on hover | Subtle, not distracting |
| `Shimmer Button` | Primary CTA (Import, Render) | One dramatic moment per screen |

**Do NOT install:** Confetti, Meteors, Cool Mode — too playful for a professional tool.

### 4.3 Button Design System

**Primary Button (Import, Render, Export):**
```css
.btn-primary {
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  border-radius: var(--radius);
  padding: 8px 16px;
  font-weight: 500;
  font-size: 14px;
  transition: all 150ms ease-out;
  box-shadow: 0 0 0 0 var(--accent-primary-glow);
}

.btn-primary:hover {
  box-shadow: 0 0 20px 4px var(--accent-primary-glow);
  transform: translateY(-1px);
}

.btn-primary:active {
  transform: scale(0.98);
}
```

**Secondary Button (Add Effect, Toggle):**
```css
.btn-secondary {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  padding: 6px 12px;
  font-weight: 400;
  font-size: 13px;
  transition: all 150ms ease-out;
}

.btn-secondary:hover {
  border-color: var(--accent-primary);
  color: var(--text-primary);
}
```

**Danger Button (Delete, Remove):**
```css
.btn-danger {
  background: var(--accent-secondary);
  color: var(--text-primary);
  border: none;
  border-radius: var(--radius);
  padding: 6px 12px;
}
```

**Corner-Cut Variant (Optional Decorative):**
Use the CodePen jh3y pattern for the app title bar or splash screen only — never for functional buttons. Corner cuts reduce clickable area and hurt usability.

### 4.4 Toggle Switches

```css
.switch-track {
  width: 36px;
  height: 20px;
  background: var(--bg-hover);
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
  transition: background 150ms ease-out;
}

.switch-track[data-checked] {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
}

.switch-thumb {
  width: 16px;
  height: 16px;
  background: var(--text-primary);
  border-radius: 50%;
  transition: transform 150ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

### 4.5 Sliders (Parameter Controls)

```css
.slider-track {
  height: 4px;
  background: var(--bg-hover);
  border-radius: 2px;
}

.slider-range {
  background: linear-gradient(
    90deg,
    var(--accent-primary),
    oklch(55% 0.15 280)
  );
  border-radius: 2px;
}

.slider-thumb {
  width: 14px;
  height: 14px;
  background: var(--text-primary);
  border: 2px solid var(--accent-primary);
  border-radius: 50%;
  box-shadow: 0 0 8px var(--accent-primary-glow);
}
```

**Behavior:**
- Option+drag: 0.1x sensitivity (fine adjustment)
- Shift+drag: 10x sensitivity (coarse adjustment)
- Direct text input for precision values

### 4.6 Effect Cards (EffectStack)

```
┌─────────────────────────────────────┐
│ ▓▓  [ICON]  Effect Name          ● │  ← Drag handle + name + toggle
│      Param: value  Param: value     │  ← Monospace param readout
└─────────────────────────────────────┘
```

```css
.effect-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--category-color);
  border-radius: var(--radius);
  padding: 12px;
  transition: all 150ms ease-out;
}

.effect-card:hover {
  border-color: var(--border-default);
}

.effect-card[data-selected] {
  border-left-width: 3px;
  background: var(--bg-hover);
}

.effect-card[data-enabled="false"] {
  opacity: 0.5;
}
```

**Drag handle:** Six-dot grid `⋮⋮` on the far left.
**Category indicator:** Left border 3px — cyan for Python, purple for WebGL.
**Quick actions:** Duplicate and delete appear on hover (not always visible to reduce clutter).

---

## 5. Layout Architecture

### 5.1 Panel Structure

```
┌─────────────────────────────────────────────────────────┐
│  [Logo]  File  Edit  View  [==== Workspace ====]   [X] │  ← Toolbar (48px)
├──────────┬──────────────────────────────┬───────────────┤
│          │                              │               │
│  Effect  │                              │  Properties   │
│  Stack   │      WEBGL CANVAS            │  Panel        │
│  (260px) │      (flex: 1)               │  (280px)      │
│          │                              │               │
│          │                              │               │
├──────────┴──────────────────────────────┴───────────────┤
│  [Timeline / Transport]     [Status: Ready]  [Progress] │  ← Bottom Bar (32px)
└─────────────────────────────────────────────────────────┘
```

### 5.2 Panel Behaviors

| Feature | Implementation |
|---------|----------------|
| Collapsible sidebars | Chevron toggle, state persisted in localStorage |
| Resizable panels | `@radix-ui/react-resizable` drag handles between panels |
| Fullscreen canvas | Button or double-click to hide all chrome |
| Panel focus | Subtle left-border accent on active panel |
| Workspace presets | "Standard" (3-panel), "Focus" (canvas only), "Export" |

### 5.3 Responsive Breakpoints

| Breakpoint | Behavior |
|------------|----------|
| `< 1200px` | Collapse Properties panel into drawer/sheet |
| `< 768px` | Stack sidebar below canvas, full-width |
| Touch devices | Minimum 44px hit targets |

---

## 6. Icon System

### 6.1 Primary: Phosphor Icons

```bash
npm install @phosphor-icons/react
```

| Icon Style | Usage |
|------------|-------|
| **Regular** | Default state |
| **Bold** | Active/selected state |
| **Fill** | Toggled on state |
| **Duotone** | Decorative headers, empty states |

**Why Phosphor over Lucide:**
- 9,000+ icons (vs 1,000+)
- Duotone style creates depth on dark surfaces without adding color
- More character while maintaining accessibility
- Better coverage of tool/action icons

### 6.2 Icon Mapping (Moshdither-Specific)

| Action | Icon | Weight |
|--------|------|--------|
| Import media | `Upload` | Regular |
| Export/Render | `Export` | Bold |
| Add effect | `Plus` | Regular |
| Remove effect | `Trash` | Regular |
| Duplicate effect | `Copy` | Regular |
| Move up/down | `CaretUp` / `CaretDown` | Regular |
| Enable/disable | Toggle component (not icon) | — |
| Play/Pause | `Play` / `Pause` | Fill |
| Settings | `Gear` | Regular |
| Fullscreen | `ArrowsOut` | Regular |
| Undo | `ArrowCounterClockwise` | Regular |
| Redo | `ArrowClockwise` | Regular |

---

## 7. Animation & Motion

### 7.1 Timing Tokens

| Token | Duration | Easing | Usage |
|-------|----------|--------|-------|
| `instant` | 0ms | — | Toggle states |
| `fast` | 100ms | `ease-out` | Hover states |
| `normal` | 200ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Panel toggles, dropdowns |
| `slow` | 300ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Modal open/close |
| `emphasis` | 400ms | `spring` | Toast entrance |

### 7.2 Specific Animations

**DO animate:**
- Panel collapses (width/height with `overflow: hidden`)
- Effect card reordering (Framer Motion `layout` prop)
- Render progress bar (smooth width transition)
- Toast notifications (slide from bottom-right)
- Modal backdrop fade (black at 50% opacity)

**DON'T animate:**
- The WebGL canvas (it has its own render loop)
- Slider thumbs while dragging (1:1 mouse tracking)
- Text during typing
- The entire app on state changes

### 7.3 Framer Motion Patterns

```tsx
// Panel slide-in
<motion.div
  initial={{ x: -20, opacity: 0 }}
  animate={{ x: 0, opacity: 1 }}
  exit={{ x: -20, opacity: 0 }}
  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
>

// Effect stack reordering
<motion.div layout transition={{ duration: 0.2, type: "spring" }}>

// Staggered list entrance
<motion.div
  variants={{
    hidden: { opacity: 0, y: 8 },
    visible: (i) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.03, duration: 0.2 }
    })
  }}
>
```

---

## 8. Empty States & Atmosphere

### 8.1 No Media Loaded

```
┌─────────────────────────────────────────┐
│                                         │
│      [Retro Grid Background]            │
│                                         │
│         Drop media here                 │
│      or click Import to begin           │
│                                         │
│         [  Import Media  ]             │
│                                         │
└─────────────────────────────────────────┘
```

- **Background:** Magic UI `Retro Grid` at 5% opacity
- **Text:** Space Grotesk, 24px, `--text-primary`
- **Button:** Primary style with shimmer effect
- **No animations that loop infinitely** — static grid, not spinning

### 8.2 Loading State

- **Progress:** shadcn `Progress` component with cyan fill
- **Log output:** Magic UI `Terminal` component with typing effect
- **Status text:** JetBrains Mono, "Initializing render pipeline..."

### 8.3 Grain Texture (App-Wide)

```css
.app-root::after {
  content: '';
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,...noise...");
  opacity: 0.03;
  pointer-events: none;
  z-index: 9999;
}
```

---

## 9. Accessibility Requirements

### 9.1 WCAG 2.2 Compliance

| Requirement | Implementation |
|-------------|----------------|
| **4.5:1 contrast** | All text meets minimum. Primary text at 7:1 (AAA). |
| **Keyboard navigation** | Tab order follows visual order. All interactive elements reachable. |
| **Focus indicators** | 2px solid `--accent-primary` outline, offset 2px. |
| **ARIA labels** | Every icon-only button has `aria-label`. |
| **Screen readers** | Effect stack announces type, name, enabled state. |
| **Color independence** | Errors use icon + text, not just red color. |
| **Reduced motion** | `prefers-reduced-motion` disables all non-essential animations. |

### 9.2 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 10. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Space` | Play/Pause preview |
| `Ctrl/Cmd + O` | Open media |
| `Ctrl/Cmd + E` | Export/Render |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Ctrl/Cmd + D` | Duplicate selected effect |
| `Delete` | Remove selected effect |
| `Ctrl/Cmd + Shift + N` | New project |
| `F11` | Fullscreen canvas |
| `Esc` | Close modal / exit fullscreen |

---

## 11. Implementation Roadmap

### Phase 1: Foundation (Week 1)

1. Install shadcn/ui and required components
2. Install Phosphor Icons, Inter, Space Grotesk, JetBrains Mono
3. Define OKLCH color tokens in `globals.css`
4. Configure shadcn theme variables
5. Set `--radius: 0.25rem` (remove excessive rounding)
6. Add grain texture overlay to app root

### Phase 2: Core Chrome (Week 2)

1. Redesign Toolbar with Phosphor icons + primary/secondary buttons
2. Redesign Sidebar panels with category-colored borders
3. Implement resizable panels with drag handles
4. Add collapsible sidebar behavior
5. Implement keyboard shortcuts

### Phase 3: Components (Week 3)

1. Install selective Magic UI components (Terminal, Noise, Retro Grid, Border Beam)
2. Redesign EffectCard with category colors + param readout
3. Redesign RenderModal with Terminal component + progress bar
4. Add Retro Grid empty state
5. Add shimmer effect to primary CTAs

### Phase 4: Polish (Week 4)

1. Framer Motion layout animations for effect stack
2. Focus ring styling across all interactive elements
3. Reduced motion support
4. Accessibility audit (axe DevTools, keyboard nav)
5. Performance audit (60fps on animations)

---

## 12. Tech Stack Summary

| Concern | Choice | Why |
|---------|--------|-----|
| **Components** | shadcn/ui | Own the code, full customization, Radix primitives |
| **Styling** | Tailwind CSS v4 | Utility-first, OKLCH native, dark mode built-in |
| **Animation** | Framer Motion | Industry standard, layout animations, gestures |
| **Icons** | Phosphor React | Duotone depth, 9k+ icons, more character than Lucide |
| **Atmosphere** | Magic UI (selective) | Terminal, noise, grid — not the full library |
| **Colors** | OKLCH in CSS | Perceptually uniform, Tailwind v4 default |
| **Theme Gen** | tweakcn.com | Best shadcn theme generator per 2026 rankings |
| **Fonts** | Inter + JetBrains Mono | Legibility at small sizes + monospace data aesthetic |
| **Resizable** | Radix Resizable | Native-feeling drag handles |

---

## 13. What NOT to Do

| Don't | Why |
|-------|-----|
| Use corner-cut buttons for functional actions | Reduces clickable area, hurts usability |
| Install all of Magic UI | Too playful for a professional tool |
| Use more than one neon color per viewport | Creates visual chaos |
| Animate the WebGL canvas area | Competes with actual content |
| Use pure black `#000000` backgrounds | Causes eye fatigue in long sessions |
| Use pure white `#FFFFFF` text | Same — causes fatigue |
| Skip reduced-motion support | Accessibility is not optional in 2026 |
| Use rounded corners > 4px | This is a precision tool, not a consumer app |
| Add infinite looping background animations | Distracting during 4+ hour sessions |

---

## 14. References

### Documents
- `docs/UX_DESIGN_REPORT_2026.md` — Professional tool UX foundations
- `UI_RESEARCH_REPORT.md` — Cyberpunk aesthetic research
- `UI_RESEARCH_SUPPLEMENT.md` — Independent component library research

### Tools
- **tweakcn.com** — shadcn/ui theme generator
- **phosphoricons.com** — Icon library
- **fontshare.com** — Free commercial fonts
- **magicui.design** — Animated components
- **uiverse.io** — Community UI elements
- **reactbits.dev** — Lightweight animated components

### Design System References
- **Carbon Design System** (IBM) — Token architecture
- **Linear** — Dark UI precision and minimal chrome
- **DaVinci Resolve** — Professional creative tool layout
- **Raycast** — Dark-first design philosophy

---

*Specification compiled from three internal research documents plus independent web research on 2026 UI/UX best practices, OKLCH color standards, and creative software design patterns.*
