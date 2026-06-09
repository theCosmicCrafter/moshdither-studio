# Moshdither Studio — UI Research & Creative Direction Report

> **Date:** June 2026  
> **Project:** Moshdither Studio — Desktop GUI for Video/Image Effects (Dither, Datamosh, Glitch, Halftone, WebGL)  
> **Tone:** Creative Technologist / Retro-Futurist / Cyberpunk-Neon  

---

## 1. Executive Summary: Recommended Design Direction

**For Moshdither Studio, the optimal aesthetic is: *Retro-Futuristic Creative Tool* — dark-first, neon-accented, with controlled glitch/cyberpunk personality.**

This is a creative effects application, not a generic SaaS dashboard. The UI should feel like a *tool* that artists *want* to spend hours in. Think:
- **DaVinci Resolve** meets **Cyberpunk 2077** interface
- **Ableton Live** meets **NeonBlade UI**
- **Linear's precision** with **Arc Browser's dark atmosphere**

**Core principle:** The chrome should be invisible until it glows. Controls are precise, minimal, and dark — but effects and previews are vivid, saturated, and alive.

---

## 2. Component Libraries & UI Systems Evaluated

### 2.1 NeonBlade UI — *Primary Recommendation*
**Source:** `https://github.com/vprix21/neonblade-ui`  
**Style:** Cyberpunk / Neon / Sci-Fi React components

**Why it fits Moshdither Studio:**
- Built specifically for *futuristic* interfaces — not generic corporate
- Components are copy-paste (not a heavy dependency) — ideal for Electron app
- Dark-first by design

**Components directly applicable:**
| Component | Use Case in Moshdither |
|-----------|------------------------|
| **Ascii Rain** | Loading screen / splash background |
| **Border Beam Corner Cut** | Effect cards in the stack |
| **Corner Cut Button** | Primary action buttons (Import, Render) |
| **Crosshair** | Custom cursor for canvas interaction |
| **Cyber Circuit** | Background texture for sidebar/panels |
| **Datalines With Grid** | Background for timeline or preview area |
| **Glitch Text** | Section headers, effect names |
| **Glyph City** | Idle background when no media loaded |
| **Holographic Terrain** | Three.js background for hero/splash |
| **Hexagons** | Subtle background texture for panels |
| **Neon Glow / Neon Modal** | Toast notifications, modals |
| **Neon Input** | Parameter input fields |
| **Stat Card** | Export settings / render stats display |
| **Neon Bar/Line Charts** | Render progress visualization |

**Integration strategy:** Install as `devDependency` or copy individual component files into `packages/desktop-gui/src/components/ui/neonblade/`.

---

### 2.2 Cyberpunk UI (cyberpunk-ui org)
**Source:** `https://github.com/cyberpunk-ui`  
**Style:** Dark style component library for React/Vue

**Verdict:** Less polished than NeonBlade. Heavier dependency structure. **Use for reference only** — steal specific CSS patterns (glow borders, terminal-style text) rather than importing the whole library.

---

### 2.3 cybercn-ui (szvitek)
**Source:** `https://github.com/szvitek/cybercn-ui`  
**Style:** Modern, type-safe Cyberpunk with Tailwind + CVA

**Verdict:** Built with Next.js + Tailwind. Good reference for *modernizing* cyberpunk CSS (the original cyberpunk.css relied on heavy global selectors). **Reference for Tailwind class patterns** — corner-cut buttons, neon borders, terminal fonts.

---

### 2.4 shadcn/ui — *Structural Foundation*
**Role:** The *bones* of the app. Use shadcn for:
- Dialogs, tooltips, dropdowns, sliders, switches
- Form primitives (inputs, selects, checkboxes)
- Table structures (for preset lists)
- Sheet component (mobile-responsive panels)

**Customization:** Override all default shadcn tokens with the Moshdither color palette. Remove all rounded corners (use `--radius: 0px` or `2px` max for that sharp cyberpunk feel).

---

## 3. Typography Strategy

### 3.1 Banned Fonts (Too Generic)
Inter, Roboto, Arial, Open Sans, system-ui — these read as "corporate tool" not "creative studio."

### 3.2 Recommended Font Stack

**Display / Headlines (App title, section headers, effect names):**
| Font | Source | Character |
|------|--------|-----------|
| **Neue Machina** | Pangram Pangram | Mechanical, precise, sharp edges — perfect for "Moshdither" branding |
| **Clash Display** | Fontshare | Bold geometric, slightly aggressive |
| **Satoshi** | Fontshare | Clean geometric with personality |
| **Space Grotesk** | Google Fonts | Free alternative, tech-forward |
| **JetBrains Mono** | Google Fonts | For code-like parameter readouts |

**Body / UI Text (Controls, labels, descriptions):**
| Font | Source | Character |
|------|--------|-----------|
| **Plus Jakarta Sans** | Google Fonts | Refined, readable, modern |
| **Instrument Sans** | Google Fonts | Neutral but crafted |
| **DM Sans** | Google Fonts | Free, friendly, geometric |

**Monospace (Parameter values, file paths, render logs):**
| Font | Source |
|------|--------|
| **JetBrains Mono** | Google Fonts |
| **IBM Plex Mono** | Google Fonts |
| **DM Mono** | Google Fonts |

### 3.3 Typography Patterns for Creative Software
- **Effect names** in the stack: Use display font at 14-16px, ALL CAPS, letter-spacing `0.05em`
- **Parameter labels**: Monospace at 11px, uppercase, muted color
- **Values**: Monospace at 12-13px, bright color — creates "data readout" aesthetic
- **Hero/empty states**: Display font at 24-32px, centered, with glitch animation

---

## 4. Color Palette & Theme Architecture

### 4.1 Dark-First Philosophy
Following Linear, Raycast, Arc Browser — the dark interface is the *designed* version. Light mode (if any) is secondary.

### 4.2 Moshdither Color Tokens

```css
:root {
  /* Surfaces — deep, layered darkness */
  --bg-primary: #08080a;       /* Deepest background */
  --bg-secondary: #0f0f12;     /* Panel backgrounds */
  --bg-tertiary: #16161a;       /* Elevated cards */
  --bg-hover: #1c1c22;         /* Hover states */
  --bg-active: #22222a;        /* Active/selected */

  /* Text — high contrast, slightly warm to avoid clinical feel */
  --text-primary: #f0f0f5;
  --text-secondary: #8a8a9a;
  --text-tertiary: #5a5a6a;
  --text-disabled: #4a4a5a;

  /* Borders — subtle, often glowing */
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-default: rgba(255, 255, 255, 0.1);
  --border-focus: rgba(0, 255, 200, 0.5);   /* Cyan glow on focus */

  /* Neon Accents — one dominant, used sparingly */
  --accent-primary: #00ffc8;     /* Cyan — primary action, focus */
  --accent-primary-glow: rgba(0, 255, 200, 0.3);
  --accent-secondary: #ff3366;   /* Magenta — destructive, alerts */
  --accent-tertiary: #ffaa00;    /* Amber — warnings, progress */

  /* Effect Category Colors */
  --cat-python: #00ffc8;         /* Cyan for Python effects (dither, datamosh) */
  --cat-webgl: #8866ff;          /* Purple for WebGL effects (glitch, halftone) */
  --cat-combined: #ffaa00;       /* Amber for combined pipelines */

  /* Semantic */
  --success: #00ffc8;
  --warning: #ffaa00;
  --error: #ff3366;
  --info: #4488ff;
}
```

### 4.3 Accent Distribution Rule
**70-20-10**: 70% neutral dark surfaces, 20% secondary text/borders, 10% neon accent. Never use more than one neon color in the same viewport area.

---

## 5. Button & Control Design Patterns

### 5.1 Primary Actions (Import, Render, Export)
- **Shape:** Corner-cut (diagonal clipped corner) — signature cyberpunk shape
- **Background:** Solid `--accent-primary` with subtle inner glow
- **Border:** 1px solid `--accent-primary-glow`
- **Hover:** Increase glow intensity, slight scale(1.02)
- **Active:** Scale(0.98), darken background
- **Text:** Dark `#08080a` on light accent — maximum contrast

### 5.2 Secondary Actions (Add Effect, Toggle)
- **Shape:** Rectangle with 1px border
- **Background:** Transparent or `--bg-tertiary`
- **Border:** `--border-default`, glows `--accent-primary` on hover
- **Icon + Label:** Icon left, label right, monospace font

### 5.3 Danger Actions (Delete, Remove Effect)
- **Shape:** Corner-cut (opposite corner from primary)
- **Color:** `--accent-secondary` (magenta)
- **Glow:** Subtle red pulse animation on hover

### 5.4 Toggle Switches
- **Track:** `--bg-tertiary` with `--border-default`
- **Thumb:** `--accent-primary` when on, `--text-tertiary` when off
- **Transition:** 150ms spring easing
- **Glow:** Thumb emits `--accent-primary-glow` when active

### 5.5 Sliders (Parameter Controls)
- **Track:** `--bg-tertiary`, 2px height
- **Fill:** Gradient from `--accent-primary` to `--accent-tertiary`
- **Thumb:** 12px circle, `--accent-primary`, glows on hover
- **Value display:** Monospace, positioned above or to the right

---

## 6. Animation & Motion Patterns

### 6.1 Page/Section Transitions
- **Duration:** 300-400ms
- **Easing:** `cubic-bezier(0.16, 1, 0.3, 1)` (expo out — fast start, slow settle)
- **Pattern:** Fade + slight upward slide (8-16px)

### 6.2 Effect Stack Animations
- **Add effect:** Card slides in from right + opacity 0→1, 200ms
- **Remove effect:** Card shrinks to height 0 + opacity 1→0, 150ms
- **Reorder:** Smooth layout transition using `layout` prop (Framer Motion)
- **Toggle on/off:** Green/cyan pulse on the enable indicator

### 6.3 Micro-Interactions
| Interaction | Animation |
|-------------|-----------|
| Button hover | Glow intensifies + 2px upward float |
| Card select | Left border glows `--accent-primary`, 150ms |
| Input focus | Border transitions to `--accent-primary` with glow |
| Toast enter | Slide from right + fade, 300ms |
| Toast exit | Fade + shrink, 200ms |
| Render progress | Progress bar has shimmering/striped animation |
| Canvas loading | ASCII rain or glyph city behind "Loading..." |

### 6.4 Background Ambient Effects
- **Subtle grid overlay:** 1px lines at 5% opacity, creates technical feel
- **Grain texture:** SVG noise overlay at 3% opacity, prevents banding on dark surfaces
- **Corner circuits:** SVG circuit traces in panel corners (from NeonBlade)

### 6.5 Reduced Motion Support
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 7. Layout & Spatial Design

### 7.1 Panel Structure (Current App Layout)
```
┌─────────────────────────────────────────────────────┐
│  Toolbar (Import | Export | Record | Settings)       │  ← 48px, glassmorphism
├──────────┬────────────────────────────┬─────────────┤
│          │                            │             │
│  Sidebar │        Canvas /            │ Properties │
│  (Effects│        Preview             │  Panel     │
│   Stack) │        (WebGL)             │ (Params)   │
│  280px   │        Center Stage        │  280px     │
│          │                            │             │
├──────────┴────────────────────────────┴─────────────┤
│  Timeline / Status Bar                               │  ← 32px
└─────────────────────────────────────────────────────┘
```

### 7.2 Layout Rules
- **No rounded corners** on main panels — sharp edges feel more technical
- **Panel dividers:** 1px `--border-subtle`, no shadows
- **Selected state:** Left 2px accent border + slight background shift
- **Glassmorphism sparingly:** Only on floating elements (toasts, dropdowns, modals)

### 7.3 Responsive Behavior
- **< 1200px:** Collapse properties panel into a drawer/sheet
- **< 768px:** Stack sidebar below canvas, full-width
- **Touch:** Increase button hit areas to 44px minimum

---

## 8. Specific Recommendations for Moshdither Studio

### 8.1 Splash Screen / Empty State
When no media is loaded, show:
- **Holographic Terrain** or **Glyph City** as background (NeonBlade components)
- **Glitch Text** animation on "Drop media or click Import"
- **Cyber Circuit** traces animating from corners toward center

### 8.2 Effect Stack Cards
Current `EffectCard` should be redesigned:
- **Corner-cut border** (Border Beam Corner Cut variant)
- **Effect type icon** in monochrome, glows when enabled
- **Category indicator:** Left edge 3px — cyan for Python, purple for WebGL
- **Parameter preview:** Monospace mini-readout of key params
- **Drag handle:** 6-dot grid pattern on the left

### 8.3 Canvas / Preview Area
- **Crosshair cursor** when hovering over canvas (NeonBlade component)
- **Datalines with Grid** subtle background overlay when idle
- **Render progress overlay:** Neon progress bar + terminal-style log output

### 8.4 Render Modal
Already implemented — enhance with:
- **Neon Bar Chart** or animated progress ring
- **Monospace log output** with color-coded levels (cyan=info, magenta=error, amber=warning)
- **Glitch Text** on "Rendering..." header

### 8.5 Parameter Controls (Properties Panel)
- **Sliders:** Neon gradient fill, monospace value readout
- **Dropdowns:** Corner-cut select boxes with glow on open
- **Color pickers:** HSL wheel with neon accents
- **Toggle switches:** As described in section 5.4

---

## 9. Creative Technologist Tools & Pipeline Integration

### 9.1 Shader-Based Backgrounds
Since the app already uses WebGL for effects, consider:
- **Live shader background** on the UI chrome (subtle noise/grain generated via GLSL)
- **Audio-reactive UI elements** if video has audio (FFT data driving glow intensity)
- **Post-process overlay** on the entire app window (subtle scanline or CRT phosphor aesthetic)

### 9.2 Generative Art for Marketing/About
- Use **p5.js** or existing WebGL shaders to generate unique hero images for the app
- Export generative thumbnails for rendered output files

### 9.3 Asset Pipeline (Eagle.cool Integration)
If using Eagle for asset management:
- Auto-import rendered frames as sequences
- Tag outputs with effect parameters used
- Build a visual library of "dither recipes"

---

## 10. Implementation Roadmap

### Phase 1: Foundation (Week 1)
1. Install selected fonts (JetBrains Mono, Space Grotesk, Plus Jakarta Sans)
2. Define full CSS custom property theme in `index.css`
3. Replace all `border-radius` values with sharp corners (0-2px)
4. Update shadcn component tokens to match dark theme

### Phase 2: Core Chrome (Week 2)
1. Redesign `Toolbar` with corner-cut buttons + neon accents
2. Redesign `Sidebar` panels with circuit corner accents
3. Add grain texture overlay to app root
4. Implement custom Crosshair cursor for canvas

### Phase 3: Components (Week 3)
1. Import/copy NeonBlade components: `CornerCutButton`, `NeonInput`, `GlitchText`
2. Redesign `EffectCard` with border-beam + category color coding
3. Redesign `RenderModal` with neon progress + monospace logs
4. Add `AsciiRain` or `GlyphCity` as empty-state background

### Phase 4: Polish (Week 4)
1. Implement all micro-interactions (hover glows, focus states)
2. Add layout animations (Framer Motion for stack reordering)
3. Add reduced-motion support
4. Performance audit (60fps on animations)

---

## 11. Reference Links & Resources

### Directly Referenced by User
- `https://github.com/vprix21/neonblade-ui` — NeonBlade UI (primary component source)
- `https://fuguux.substack.com/p/195fca56-f4f3-4f0a-bd74-683e03bc091c` — fuguUX Substack (UX philosophy)
- `https://github.com/fynyky/elemental` — Elementary reactive library (reference only)

### Additional High-Value References
- `https://neonbladeui.neuronrush.com/components` — Full NeonBlade component gallery
- `https://github.com/szvitek/cybercn-ui` — Modern Tailwind cyberpunk patterns
- `https://frontend.horse/articles/the-linear-look/` — Linear design system analysis
- `https://muz.li/blog/dark-mode-design-systems` — Dark mode token architecture
- `https://blog.logrocket.com/ux-design/retro-futuristic-ux-designs-bringing-back-the-future/` — Retro-futurism UX principles

### Font Sources
- **Fontshare** (free, commercial-use): `https://fontshare.com` — Satoshi, Clash Display, Plus Jakarta Sans
- **Google Fonts**: Space Grotesk, JetBrains Mono, DM Sans, IBM Plex Mono
- **Pangram Pangram** (paid): Neue Machina

---

## 12. Final Creative Brief

> **Moshdither Studio is a creative weapon.** The interface should feel like you're sitting in a dark lab, surrounded by glowing monitors, about to break a video file into beautiful pieces. Every pixel of chrome should get out of the way — until you need it, and then it should glow with precision.

**The app is not "friendly." It is *competent*.** Users are artists and developers who want power, not hand-holding. The aesthetic rewards expertise with beauty.

---

*Report compiled by ODIN v5.0 — Creative Technologist Mode*
