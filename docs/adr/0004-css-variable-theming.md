# ADR-0004: CSS Variables for Dark/Light Theming

## Status
Accepted

## Context
The app needs a dark theme (default, cyber-urban aesthetic) and a light theme for accessibility and daytime use. The theming system must work with Tailwind CSS and allow runtime switching.

## Decision
Use **CSS custom properties (variables)** with a `data-theme` attribute on `<html>`.

## Rationale
- **Runtime switching**: Changing `data-theme` attribute instantly swaps all colors
- **Tailwind integration**: Tailwind classes reference CSS variables (`bg-surface`, `text-primary`)
- **No flash**: Default dark theme variables are defined on `:root`, light theme overrides on `[data-theme="light"]`
- **Granular control**: Every color, shadow, and gradient can be themed independently
- **No JS overhead**: Theme application is pure CSS — JS only sets the attribute

## Implementation
- `src/index.css` defines all variables for both themes
- `src/store/index.ts` holds `theme` state and `toggleTheme()` action
- `src/components/AppLayout.tsx` applies `data-theme` attribute via `useEffect`
- `src/components/Toolbar.tsx` has a toggle button (sun/moon icon)

## Consequences
- All components must use CSS variables, not hardcoded colors
- Light theme requires separate values for neumorphic shadows and glass effects
- Adding new UI elements requires defining variables in both theme blocks
