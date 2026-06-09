# MoshDither Studio — UX/UI Design Report & Recommendations
**Date:** June 9, 2026  
**Focus:** Desktop Creative Software (Electron + React + WebGL)  
**Research Scope:** Current UX best practices, component libraries, design systems, dark-mode standards, and creative-app UI patterns as of mid-2026.

---

## 1. Executive Summary

MoshDither Studio is a professional-grade datamoshing/dithering application. In 2026, users expect creative software to feel as polished as DaVinci Resolve, Figma, or Adobe Premiere Pro. The interface should:

- **Default to a refined dark theme** — not pure black, but layered near-blacks with subtle elevation.
- **Use a modular, dockable panel system** — standard in every pro video/graphics app.
- **Prioritize the canvas/viewport** — media should dominate, chrome should recede.
- **Be fully accessible** — WCAG 2.2 AA is the minimum legal standard in many jurisdictions as of 2026.
- **Feel alive but not distracting** — micro-interactions for state changes, not gratuitous motion.

---

## 2. Dark Mode Best Practices (2026 Standards)

### 2.1 The "Layered Darkness" Palette
The biggest mistake in dark mode is using pure black (`#000000`). In 2026, professional apps use **near-black grays** to create depth:

| Layer | Recommended Hex | Usage |
|-------|----------------|-------|
| Base background | `#0A0A0F` or `#0F0F13` | App canvas, empty areas |
| Panel background | `#141419` or `#1A1A20` | Sidebars, properties panels |
| Elevated surface | `#1E1E24` or `#25252D` | Cards, modals, dropdowns |
| Hover/Active | `#2A2A32` or `#32323C` | Interactive row hover |
| Border/Divider | `#2E2E38` or `#3A3A45` | Subtle 1px separators |
| Primary text | `#E8E8EC` or `#F0F0F5` | Headings, labels |
| Secondary text | `#9CA3AF` or `#A1A1AA` | Descriptions, hints |
| Disabled text | `#6B7280` or `#71717A` | Inactive controls |
| Accent/Brand | `#6366F1` (indigo) or `#8B5CF6` (violet) | Primary actions, selection |
| Accent hover | `#818CF8` or `#A78BFA` | Button hover states |
| Danger | `#EF4444` | Errors, destructive actions |
| Warning | `#F59E0B` | Alerts, cautions |
| Success | `#22C55E` | Confirmations, exports |

**Key Rule:** Avoid pure white (`#FFFFFF`) text on pure black — it causes eye fatigue. Use off-white or light grays instead.

### 2.2 Contrast & Accessibility
- **WCAG 2.2 AA minimum:** 4.5:1 for normal text, 3:1 for large text.
- **WCAG 2.2 AAA recommended:** 7:1 for normal text (especially for professional tools used for long sessions).
- **Test with:** Stark, axe DevTools, or browser DevTools contrast checkers.
- **European Accessibility Act (EAA):** Fully in effect for most digital services in 2026. Professional software sold in the EU must be perceivable and operable for all users.

### 2.3 Shadows & Depth in Dark UI
- Drop shadows are **less effective** on dark backgrounds.
- Use **subtle illumination**, **glows**, or **background color shifts** to show elevation.
- Example: A modal might use `background: #1E1E24` with a `border: 1px solid #3A3A45` and a subtle `box-shadow: 0 0 0 1px rgba(255,255,255,0.05)` instead of heavy drop shadows.

### 2.4 Typography for Dark Mode
- Use **slightly heavier font weights** than in light mode (e.g., 400 instead of 300, 500 instead of 400).
- Increase line-height slightly (1.5–1.6) to reduce perceptual density.
- Ensure font anti-aliasing is consistent across platforms (`-webkit-font-smoothing: antialiased` on macOS).
- Recommended font families for creative software:
  - **Inter** — neutral, highly legible, excellent at small sizes.
  - **SF Pro** (macOS) / **Segoe UI** (Windows) — native system fonts for familiarity.
  - **JetBrains Mono** or **Fira Code** — for any technical/parameter readouts.

---

## 3. Recommended UI Libraries & Design Systems

### 3.1 Primary Recommendation: shadcn/ui + Tailwind CSS

**Why shadcn/ui is the 2026 standard:**
- Copy-paste components — you own every pixel. No dependency lock-in.
- Built on **Radix UI** primitives (though Adobe's React Aria is emerging as the long-term successor).
- Deep **Tailwind CSS** integration — perfect for custom dark themes.
- Massive ecosystem: every major AI app builder (Lovable, v0, Bolt) uses it as a foundation.
- **Dark mode is first-class:** Built-in `dark` class support with CSS variables.

**Relevant shadcn/ui components for MoshDither Studio:**
- `Button`, `Slider`, `Switch`, `Select`, `Input`, `Tabs`
- `Dialog` — for export/render modals
- `Dropdown Menu` — for effect stack actions
- `Tooltip` — for parameter explanations
- `Progress` — for render pipeline progress
- `Scroll Area` — custom scrollbars that match the dark theme
- `Resizable` — for dockable panels (critical!)
- `Context Menu` — right-click on effects/timeline

**Cons to be aware of:**
- Radix UI's long-term maintenance is uncertain (team shifted to Base UI).
- Default styling can feel generic unless customized heavily.
- Manual updates required.

### 3.2 Alternative: Untitled UI React

**Why consider it:**
- 5,000+ components — the most comprehensive library available.
- Built on **React Aria** (Adobe-maintained, actively developed, superior accessibility).
- Synced with **Untitled UI Figma** kit — design and code stay aligned.
- Includes unique components: video players, rich-text editors, calendars.
- One-time paid license ($349) for PRO, but hundreds of components are free/open-source.

**Best for:** Teams with a dedicated designer who uses Figma.

### 3.3 Animation Layer: Motion (Framer Motion)

**Motion v12** (formerly Framer Motion) is the dominant React animation library in 2026:
- Declarative API matching React's mental model.
- Built-in gesture support (hover, tap, drag).
- Trusted by Figma, Framer, and millions of projects.
- **Bundle size warning:** Can grow quickly; use only where needed.

**Recommended uses for creative software:**
- Panel slide-in/out animations (200–300ms, `ease-out`).
- Effect stack item reordering (layout animations).
- Export modal appearance.
- Toast notifications (slide + fade).
- Parameter value changes (subtle number tick animation).

**Avoid:** Over-animating the main viewport or WebGL canvas area — it competes with the actual content.

### 3.4 Icons: Lucide React

- Clean, consistent, open-source.
- 1,000+ icons covering most UI needs.
- Stroke-width adjustable for dark mode legibility.
- Used by shadcn/ui by default.

### 3.5 Emerging Libraries to Watch

| Library | Strength | Best For |
|---------|----------|----------|
| **Kibo UI** | Built on shadcn patterns, themeable | Extending shadcn with more components |
| **React Aria Components** | Adobe-maintained, maximum accessibility | Future-proofing if Radix fades |
| **Tailwind Plus** | Official Tailwind UI components | Rapid prototyping with premium polish |
| **Aceternity UI** | Animated effects, 3D, particles | Marketing/landing pages (not for tool UI) |
| **Magic UI** | Pre-built animated components | Hero sections, not application chrome |

---

## 4. Creative Software UI Patterns

### 4.1 The "Pages" or "Workspace" Model
Professional video/graphics apps organize functionality into **dedicated workspaces**:

- **DaVinci Resolve:** Media → Cut → Edit → Fusion → Color → Fairlight → Deliver
- **Premiere Pro:** Assembly → Editing → Color → Effects → Audio → Graphics

**For MoshDither Studio, consider:**
1. **Import** — Load media, preview source
2. **Effects** — Apply datamoshing/dithering stack (your current main view)
3. **Mask** — Paint/edit masks (if expanding mask features)
4. **Export** — Render settings, format selection, progress

### 4.2 Panel Architecture (Dockable / Collapsible)
The current three-panel layout (Toolbar | Workspace | Properties) is correct. Enhance it:

```
┌─────────────────────────────────────────────────────────┐
│  [Logo]  File  Edit  View  [==== Workspace Tabs ====]  │  ← Top Bar (48px)
├──────────┬──────────────────────────────┬───────────────┤
│          │                              │               │
│  Effect  │                              │  Properties   │
│  Stack   │      WEBGL CANVAS            │  Panel        │
│  (250px) │      (flex: 1)               │  (280px)      │
│          │                              │               │
│          │                              │               │
├──────────┴──────────────────────────────┴───────────────┤
│  [Timeline / Render Progress]                           │  ← Bottom Panel (optional)
└─────────────────────────────────────────────────────────┘
```

**Key patterns:**
- **Collapsible sidebars:** Chevron to collapse, remember state in localStorage.
- **Resizable panels:** Drag handles between panels (use `@radix-ui/react-resizable` or shadcn's `Resizable`).
- **Panel focus:** The active panel gets a subtle highlight (e.g., border-left accent color on the Properties panel when editing parameters).
- **Fullscreen canvas:** Double-click or button to hide all chrome and show only the WebGL canvas.

### 4.3 Timeline & Transport Controls
Even a simple timeline bar with:
- Play/Pause button
- Current time / Total duration
- Scrubber bar
- In/Out markers (for loop/render range)

...elevates the app from "image processor" to "video tool."

### 4.4 Effect Stack Design Patterns

**Current:** Vertical list of effect cards.

**2026 Best Practices:**
- **Thumbnail preview:** Each effect card shows a small before/after thumbnail.
- **Enable/disable toggle:** Always visible, not hidden in a menu.
- **Drag handles:** `⋮⋮` grip icon on the left for reordering.
- **Active state:** The selected effect gets a left border accent and slightly elevated background.
- **Badge/Chip system:** Show effect type (Datamosh, Dither, etc.) with color-coded tags.
- **Quick actions:** Hover reveals duplicate/delete buttons.
- **Expand/collapse:** Click header to collapse to save vertical space.

### 4.5 Parameter Controls

**For numeric parameters (sliders):**
- Show current value next to the slider.
- Allow direct text input for precision.
- Option + drag for fine adjustment (0.1x sensitivity).
- Shift + drag for coarse adjustment (10x sensitivity).
- Visual feedback: Slider track fills with accent color.

**For color/palette parameters:**
- Use a popover color picker (not a dropdown).
- Show recent/swatches below the picker.
- Support hex input for precision.

---

## 5. Animation & Motion Guidelines

### 5.1 Timing Tokens
Establish a consistent timing scale:

| Token | Duration | Usage |
|-------|----------|-------|
| `instant` | 0ms | Toggle states, checkbox |
| `fast` | 100ms | Hover states, button presses |
| `normal` | 200ms | Panel toggles, dropdowns |
| `slow` | 300ms | Modal open/close, page transitions |
| `emphasis` | 400–500ms | Toast entrance, important notifications |

### 5.2 Easing Tokens
| Token | Curve | Usage |
|-------|-------|-------|
| `ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Elements entering |
| `ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Elements exiting |
| `ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | Symmetric transitions |
| `spring` | Framer Motion spring | Playful interactions |

### 5.3 Specific Animation Recommendations

**DO animate:**
- Panel collapses (width/height with `overflow: hidden`).
- Effect card drag reordering (Framer Motion `layout` prop).
- Render progress bar (smooth width transition).
- Toast notifications (slide in from bottom-right, auto-dismiss).
- Modal backdrop fade (black at 50% opacity).

**DON'T animate:**
- The WebGL canvas (it has its own render loop).
- Slider thumbs while dragging (follow mouse 1:1, no lag).
- Text content during typing.
- The entire app on theme switch (instant swap preferred).

---

## 6. Accessibility Requirements (2026 Legal Landscape)

### 6.1 WCAG 2.2 Compliance Checklist
- [ ] **4.5:1 contrast ratio** minimum for all text (use WebAIM contrast checker).
- [ ] **Keyboard navigation:** Every interactive element reachable via Tab.
- [ ] **Focus indicators:** Visible focus rings (2px outline, accent color, offset 2px).
- [ ] **ARIA labels:** All icon-only buttons have `aria-label`.
- [ ] **Screen reader support:** Effect stack items announce their type and enabled state.
- [ ] **Color independence:** Error states don't rely solely on red color (use icons + text).
- [ ] **Reduced motion:** Honor `prefers-reduced-motion` media query.

### 6.2 EAA (European Accessibility Act)
If MoshDither Studio is sold in the EU:
- Must be perceivable, operable, understandable, and robust.
- Accessibility must be built in, not bolted on.
- Consider an accessibility statement in the Help menu.

---

## 7. Specific Recommendations for MoshDither Studio

### Immediate Actions (High Priority)

1. **Adopt shadcn/ui as the component foundation**
   - Install via CLI: `npx shadcn@latest init`
   - Add components: `npx shadcn add button slider switch select dialog tooltip progress`
   - Customize the `globals.css` with the dark palette from Section 2.1.

2. **Implement a CSS Custom Properties (Variable) System**
   ```css
   :root {
     --background: #0A0A0F;
     --panel: #141419;
     --surface: #1E1E24;
     --border: #2E2E38;
     --text-primary: #E8E8EC;
     --text-secondary: #9CA3AF;
     --accent: #6366F1;
     --accent-hover: #818CF8;
     --danger: #EF4444;
     --success: #22C55E;
     --warning: #F59E0B;
   }
   ```

3. **Add Lucide React icons**
   - Replace any custom icon components.
   - Use `lucide-react` package.

4. **Implement Resizable Panels**
   - Users need to resize the effect stack and properties panels.
   - Use `@radix-ui/react-resizable` or shadcn/ui's `Resizable` component.

5. **Add Keyboard Shortcuts**
   - `Space` — Play/Pause preview
   - `Ctrl/Cmd + E` — Export
   - `Ctrl/Cmd + O` — Open media
   - `Delete` — Remove selected effect
   - `Ctrl/Cmd + D` — Duplicate selected effect
   - `Ctrl/Cmd + Shift + N` — New project

### Medium-Term Enhancements

6. **Dockable/Floating Panel System**
   - Allow users to undock the Properties panel into a floating window.
   - Save workspace layout preferences.

7. **Workspace Presets**
   - "Standard" (3-panel)
   - "Focus" (canvas only + minimal HUD)
   - "Export" (timeline + render queue)

8. **Effect Thumbnail Previews**
   - Each effect card shows a mini WebGL-rendered preview.
   - Use offscreen canvas or small framebuffer for performance.

9. **Transport Controls**
   - Add a proper timeline scrubber.
   - Frame-by-frame navigation for video.

10. **Onboarding / Empty States**
    - When no media is loaded, show a large drop zone with animation.
    - First-time user tooltip tour.

### Long-Term Vision

11. **Node-Based Editor (Optional)**
    - For advanced users, offer a node-graph view like DaVinci Resolve's Fusion.
    - Each effect is a node; connections define processing order.

12. **Plugin System UI**
    - If opening to third-party effects, a plugin manager with marketplace-like UI.

13. **Multi-Language Support**
    - i18n framework (react-i18next) for global distribution.

---

## 8. Recommended Tech Stack for UI

| Concern | Recommendation | Why |
|---------|---------------|-----|
| **Components** | shadcn/ui | Own the code, full customization |
| **Styling** | Tailwind CSS v4 | Utility-first, dark mode native |
| **Animation** | Motion (Framer Motion) | Industry standard for React |
| **Icons** | Lucide React | Clean, consistent, open-source |
| **Resizable** | @radix-ui/react-resizable | Native-feeling drag handles |
| **Fonts** | Inter + JetBrains Mono | Legible, professional |
| **Color** | OKLCH in CSS | Perceptually uniform, better for theming |

---

## 9. Figma Resources (If You Have a Designer)

- **Untitled UI Figma Kit** — Largest design system, synced with React components.
- **2026 Video/Image Editing Tool UI Component** (Figma Community) — Pre-built dark/light editing tool components.
- **Material Design 3** — Google's latest, good for baseline patterns.

---

## 10. Summary: What to Do Next

1. **This week:** Install shadcn/ui, set up the dark theme color system in `globals.css`, replace existing buttons/sliders with shadcn components.
2. **Next week:** Implement resizable panels and add Lucide icons throughout.
3. **Month 1:** Add keyboard shortcuts, workspace layout persistence, and proper empty states.
4. **Month 2–3:** Transport controls, timeline, effect thumbnail previews, onboarding flow.

The goal is to make MoshDither Studio feel like it belongs alongside DaVinci Resolve and Premiere Pro — not a web app crammed into Electron, but a native-feeling professional creative tool.

---

*Report compiled based on 2026 UI/UX best practices, current component library landscapes, and professional creative software design patterns.*
