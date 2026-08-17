/**
 * Design tokens are stored as complete CSS colors (`--surface: #131314`) so
 * that hand-written rules in index.css can use `var(--surface)` directly.
 *
 * Tailwind cannot apply an opacity modifier to an opaque `var()` string: for
 * `bg-surface/40` it emits `rgb(var(--surface) / 0.4)`, which is invalid once
 * the variable expands to a hex literal, so the browser drops the declaration
 * and the utility silently falls back — translucent panels rendered fully
 * transparent and tinted borders rendered in Tailwind's default gray. 105 such
 * usages across 19 files were affected.
 *
 * Routing each token through `token()` keeps the bare utility byte-identical
 * (`var(--x)`) while making the `/<alpha>` form resolve through color-mix,
 * which supports a `var()` operand. Requires Chromium 111+ / Safari 16.2+ /
 * Firefox 113+; the Tauri v2 webview and all dev browsers are well past that.
 */
const token =
  (name) =>
  ({ opacityValue } = {}) =>
    opacityValue === undefined
      ? `var(${name})`
      : `color-mix(in srgb, var(${name}) calc(${opacityValue} * 100%), transparent)`;

/** A token at partial alpha, for use in keyframes where no utility applies. */
const glow = (name, alpha) =>
  `color-mix(in srgb, var(${name}) ${alpha * 100}%, transparent)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Legacy compat. Ten further shims once sat here -- background,
        // foreground, primary-foreground, accent-2, teal, card,
        // card-foreground, ring, muted-foreground and destructive -- with zero
        // references left anywhere in src/ (there is no @apply in this project,
        // so component class strings are the only consumer). They were removed;
        // the three below are still in use, so they stay until their call sites
        // migrate to the Material-style tokens listed underneath.
        border: token("--border-primary"), // 2 uses
        input: token("--bg-input"), // 9 uses
        muted: token("--text-muted"), // 76 uses

        // Cyber-Urban design tokens
        "accent-cyan": token("--teal"),
        surface: token("--surface"),
        "surface-main": token("--surface-main"),
        "surface-dim": token("--surface-dim"),
        "surface-bright": token("--surface-bright"),
        "surface-variant": token("--surface-variant"),
        "surface-container-lowest": token("--surface-container-lowest"),
        "surface-container-low": token("--surface-container-low"),
        "surface-container": token("--surface-container"),
        "surface-container-high": token("--surface-container-high"),
        "surface-container-highest": token("--surface-container-highest"),
        "surface-tint": token("--surface-tint"),

        "on-surface": token("--on-surface"),
        "on-surface-variant": token("--on-surface-variant"),
        "on-background": token("--on-background"),
        outline: token("--outline"),
        "outline-variant": token("--outline-variant"),

        "accent-pink": token("--accent-pink"),
        "accent-gold": token("--accent-gold"),
        "accent-teal": token("--accent-teal"),

        primary: token("--primary"),
        "primary-container": token("--primary-container"),
        "on-primary": token("--on-primary"),
        "on-primary-container": token("--on-primary-container"),
        "primary-fixed": token("--primary-fixed"),
        "primary-fixed-dim": token("--primary-fixed-dim"),
        "on-primary-fixed": token("--on-primary-fixed"),
        "on-primary-fixed-variant": token("--on-primary-fixed-variant"),

        secondary: token("--secondary"),
        "secondary-container": token("--secondary-container"),
        "on-secondary": token("--on-secondary"),
        "on-secondary-container": token("--on-secondary-container"),
        "secondary-fixed": token("--secondary-fixed"),
        "secondary-fixed-dim": token("--secondary-fixed-dim"),
        "on-secondary-fixed": token("--on-secondary-fixed"),
        "on-secondary-fixed-variant": token("--on-secondary-fixed-variant"),

        tertiary: token("--tertiary"),
        "tertiary-fixed": token("--tertiary-fixed"),
        "tertiary-fixed-dim": token("--tertiary-fixed-dim"),
        "tertiary-container": token("--tertiary-container"),
        "on-tertiary": token("--on-tertiary"),
        "on-tertiary-container": token("--on-tertiary-container"),
        "on-tertiary-fixed": token("--on-tertiary-fixed"),
        "on-tertiary-fixed-variant": token("--on-tertiary-fixed-variant"),

        error: token("--danger"),
        "error-container": token("--error-container"),
        "on-error": token("--on-error"),
        "on-error-container": token("--on-error-container"),

        "inverse-surface": token("--inverse-surface"),
        "inverse-on-surface": token("--inverse-on-surface"),
        "inverse-primary": token("--inverse-primary"),
      },
      fontFamily: {
        display: ["Geist Variable", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono Variable", "Fira Code", "monospace"],
        hand: ["Architects Daughter", "cursive"],
        // Typographic role aliases — all resolve to the variable Geist face
        "label-md": ["Geist Variable", "system-ui", "sans-serif"],
        "label-sm": ["Geist Variable", "system-ui", "sans-serif"],
        "code-sm": ["JetBrains Mono Variable", "Fira Code", "monospace"],
        "headline-md": ["Geist Variable", "system-ui", "sans-serif"],
        "headline-lg": ["Geist Variable", "system-ui", "sans-serif"],
        "body-md": ["Geist Variable", "system-ui", "sans-serif"],
        "body-sm": ["Geist Variable", "system-ui", "sans-serif"],
        "data-micro": ["Geist Variable", "system-ui", "sans-serif"],
      },
      fontSize: {
        "label-md": ["12px", { lineHeight: "16px", letterSpacing: "0.02em", fontWeight: "500" }],
        "label-sm": ["10px", { lineHeight: "14px", letterSpacing: "0.05em", fontWeight: "500" }],
        "code-sm": ["11px", { lineHeight: "16px", fontWeight: "400" }],
        "headline-md": ["20px", { lineHeight: "26px", fontWeight: "600" }],
        "headline-lg": ["28px", { lineHeight: "36px", letterSpacing: "0.05em", fontWeight: "800" }],
        "body-md": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "body-sm": ["12px", { lineHeight: "16px", fontWeight: "400" }],
        "data-micro": ["8px", { lineHeight: "10px", fontWeight: "700" }],

        // ── Dense tool-chrome sizes ──────────────────────────────────────
        // These capture, 1:1, the raw pixel sizes that were previously written
        // as arbitrary `text-[Npx]` values at 75 call sites across 14 files.
        //
        // They deliberately declare font-size and NOTHING else: no weight, no
        // letter-spacing, no line-height. That makes `.text-dense-xs` byte-
        // identical to the `.text-[10px]` it replaced, so adopting them moved
        // no pixels. Mapping those call sites onto the *semantic* roles above
        // instead would have restyled them -- `label-sm` carries 500-weight and
        // 0.05em tracking, which fights the `tracking-wider` some sites already
        // set and risks overflow in the width-constrained numeric readouts
        // (`w-8 text-right`, `min-w-[50px]`).
        //
        // The point of naming them is that arbitrary values can't be audited or
        // linted, so drift was invisible; a named ramp makes the remaining
        // consolidation onto real roles a deliberate, reviewable change. Prefer
        // a semantic role above for new code -- reach here only to match the
        // density of surrounding tool chrome.
        "dense-3xs": "8px",
        "dense-2xs": "9px",
        "dense-xs": "10px",
        "dense-sm": "11px",
        "dense-md": "12px",
        "dense-lg": "13px",
        "dense-xl": "14px",
      },
      spacing: {
        "container-padding": "1rem",
        "panel-gap": "0.5rem",
        "sidebar-width": "320px",
        "timeline-height": "180px",
        "header-height": "56px",
        "element-gap": "0.5rem",
      },
      borderRadius: {
        sm: "2px",
        DEFAULT: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
        "2xl": "16px",
        full: "9999px",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-glow": "pulseGlow 2s infinite ease-in-out",
        shimmer: "shimmer 1.5s infinite ease-in-out",
        scanline: "scanline 3s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        // These two animations hard-coded rgba(255,0,127) and rgba(255,223,0).
        // Neither is a current brand color: the pink is the high-contrast
        // theme's accent (#ff007f) rather than the default #ffade0, and the
        // gold (#ffdf00) appears in no theme at all. Being literals they also
        // stayed fixed while the rest of the UI re-themed. Routing them through
        // the accent tokens keeps the same glow shape but follows the theme.
        pulseGlow: {
          "0%": { boxShadow: `0 0 5px ${glow("--accent-pink", 0.4)}`, opacity: "0.8" },
          "50%": { boxShadow: `0 0 20px ${glow("--accent-gold", 0.8)}`, opacity: "1" },
          "100%": { boxShadow: `0 0 5px ${glow("--accent-pink", 0.4)}`, opacity: "0.8" },
        },
        shimmer: {
          "0%": { opacity: "0.5", filter: `drop-shadow(0 0 2px ${glow("--accent-pink", 0.5)})` },
          "50%": { opacity: "1", filter: `drop-shadow(0 0 8px ${glow("--accent-gold", 0.8)})` },
          "100%": { opacity: "0.5", filter: `drop-shadow(0 0 2px ${glow("--accent-pink", 0.5)})` },
        },
        scanline: {
          "0%": { top: "0%" },
          "100%": { top: "100%" },
        },
      },
    },
  },
  plugins: [],
};
