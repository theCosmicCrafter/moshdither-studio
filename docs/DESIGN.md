---
name: Cyber-Urban Creative System
colors:
  surface: '#131314'
  surface-dim: '#131314'
  surface-bright: '#3a393a'
  surface-container-lowest: '#0e0e0f'
  surface-container-low: '#1c1b1c'
  surface-container: '#201f20'
  surface-container-high: '#2a2a2b'
  surface-container-highest: '#353436'
  on-surface: '#e5e2e3'
  on-surface-variant: '#debece'
  inverse-surface: '#e5e2e3'
  inverse-on-surface: '#313031'
  outline: '#a68998'
  outline-variant: '#57404e'
  surface-tint: '#ffade0'
  primary: '#ffade0'
  on-primary: '#60004c'
  primary-container: '#ff32d0'
  on-primary-container: '#540043'
  inverse-primary: '#b0008f'
  secondary: '#e6feff'
  on-secondary: '#003739'
  secondary-container: '#00f4fe'
  on-secondary-container: '#006c71'
  tertiary: '#b8d300'
  on-tertiary: '#2c3400'
  tertiary-container: '#869a00'
  on-tertiary-container: '#262d00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffd8ed'
  primary-fixed-dim: '#ffade0'
  on-primary-fixed: '#3b002e'
  on-primary-fixed-variant: '#87006d'
  secondary-fixed: '#63f7ff'
  secondary-fixed-dim: '#00dce5'
  on-secondary-fixed: '#002021'
  on-secondary-fixed-variant: '#004f53'
  tertiary-fixed: '#d2f100'
  tertiary-fixed-dim: '#b8d300'
  on-tertiary-fixed: '#191e00'
  on-tertiary-fixed-variant: '#414c00'
  background: '#131314'
  on-background: '#e5e2e3'
  surface-variant: '#353436'
typography:
  display-lg:
    fontFamily: Bricolage Grotesque
    fontSize: 72px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Bricolage Grotesque
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-lg-mobile:
    fontFamily: Bricolage Grotesque
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: Space Mono
    fontSize: 11px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.1em
  code-sm:
    fontFamily: Space Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 24px
  panel-padding: 12px
---

## Brand & Style

The design system embodies a **Tech-Noir / Cyber-Urban** aesthetic, merging the precision of high-end professional creative software with the raw, rebellious energy of street art. It is designed for digital creators who demand a high-density, functional environment that feels like a futuristic command center rather than a corporate spreadsheet.

The visual narrative is built on the contrast between structured digital circuitry and fluid, expressive graffiti. The UI should evoke a sense of late-night productivity in a neon-lit metropolis—intense, focused, and high-energy. 

**Key Stylistic Pillars:**
- **High-Density Utility:** Maximizing screen real estate for complex editing workflows.
- **Neon Accents:** Using light as a functional tool to guide the eye toward primary actions.
- **Urban Textures:** Strategic use of "spray-paint" drip overlays and circuit-board motifs in non-functional areas to break the monotony of the dark mode interface.

## Colors

The palette is anchored in ultra-dark surfaces to provide maximum contrast for video and image content. 

- **Surfaces:** Use `#000000` for the deepest backgrounds and `#0A0A0B` for primary container surfaces. Higher elevation layers should use `#1A1A1C`.
- **Primary (Electric Pink):** Reserved for destructive actions, major recording states, and high-energy highlights.
- **Secondary (Neon Teal):** The main functional accent. Used for active states, selection outlines, and progress indicators.
- **Tertiary (Neon Yellow):** Used sparingly for warnings, tooltips, or "pro" feature callouts.
- **Functional Glows:** Primary and Secondary colors should implement a `0px 0px 12px` outer glow (bloom) when used on interactive elements to simulate neon tubing.

## Typography

This design system uses a tri-font strategy to balance character and utility:

1.  **Display & Headlines (Bricolage Grotesque):** Chosen for its quirky, expressive terminals that mimic the "tagging" energy of graffiti. Use this for landing pages, modal titles, and empty-state messaging.
2.  **UI & Body (Geist):** A technical, highly legible sans-serif for the core editor interface. It provides the "professional tool" feel required for video/image editing.
3.  **Labels & Metadata (Space Mono):** Used for technical readouts (timecodes, hex codes, layer names). This reinforces the "cyber" aspect of the brand.

**Styling Note:** For Display-level text, apply a subtle "glitch" shadow (a 1px offset pink and teal shadow) to enhance the high-energy vibe.

## Layout & Spacing

The layout follows a **High-Density Fluid Grid** model. Because this is a professional editor, the interface must prioritize content space (the viewport) while keeping tools within 1-2 clicks.

- **The Workbench:** A 4-panel layout (Files, Viewport, Timeline, Properties). Panels are separated by 2px dividers rather than wide gutters to maximize pixel real estate.
- **Density:** We use a tight 4px baseline grid. Padding within buttons and inputs is minimized to allow for more controls on screen.
- **Adaptive Reflow:** On mobile, side panels collapse into bottom sheets or slide-over trays. The Viewport maintains a minimum aspect ratio of 16:9 regardless of device size.

## Elevation & Depth

Hierarchy is established through **Tonal Layering and Glows** rather than traditional soft shadows.

- **Base Layer:** Black (#000000).
- **Control Surfaces:** Deep Charcoal (#0A0A0B) with 1px interior borders (#1A1A1C) to define edges.
- **Active Elements:** Instead of lifting an element with a shadow, we "activate" it with a 1px solid Neon Teal border and a matching 4px-8px outer blur (glow).
- **Overlays:** Modals and menus use a high-blur Backdrop Filter (20px) with a 60% opacity dark tint to maintain focus while showing the "circuitry" of the editor beneath.
- **Textures:** Digital circuit patterns should be applied at 5% opacity to background layers to add "grit" without distracting from the UI.

## Shapes

The design system utilizes **Sharp (0px)** roundedness for the core UI to maintain a technical, aggressive, and "built" look. 

- **UI Controls:** All buttons, input fields, and panels feature hard 90-degree corners.
- **Chamfered Corners:** For specific "Action" buttons (like Export or Render), use a CSS `clip-path` to create 45-degree chamfered corners on the top-right and bottom-left, nodding to industrial hardware design.
- **Visual Flourishes:** Spray-paint drips should be used as masks for decorative elements, breaking the rigid geometry of the layout.

## Components

### Buttons
- **Primary:** Solid black background, 1px Neon Teal border, Neon Teal text. On hover, the border and text glow intensely.
- **Ghost:** No background, Grey text. On hover, text changes to Electric Pink with a pink "spray" effect behind it.

### Inputs
- **Text Fields:** Sharp corners, 1px dark border. On focus, the border turns Neon Yellow and a tiny "label-caps" description appears above the field in Space Mono.
- **Sliders:** The track is a thin 2px line. The "thumb" is a vertical rectangle (6px x 16px) in Neon Teal.

### Chips & Tags
- Used for metadata (e.g., "4K", "ProRes"). These feature a "glitch" border—staggered 1px lines in pink and teal that don't quite meet at the corners.

### Lists & Layers
- High-density rows (24px height). Selected layers are highlighted with a subtle teal gradient that fades from left to right.

### Cards
- Used in the "Template" or "Asset" browser. Cards are borderless with a 2px Neon Teal "top-bar" that only appears on hover.