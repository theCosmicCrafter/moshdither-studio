# ADR-0003: Zustand Single Store for State Management

## Status
Accepted

## Context
The frontend needs to manage complex state: media, effect stacks, timeline, masks, UI overlays, export queue, audio, and theme. We considered Redux, MobX, Context API, and Zustand.

## Decision
Use **Zustand** with a single global store.

## Rationale
- **Minimal boilerplate**: No actions/reducers/dispatch — just state and setters
- **Performance**: Selectors prevent unnecessary re-renders without `useMemo` wrappers
- **TypeScript-first**: Full type inference from the store definition
- **No provider needed**: Store is a singleton, accessible from any component or hook
- **Undo/redo**: Custom history stack implemented in the store for effect stack changes

## Consequences
- All state lives in one store (`src/store/index.ts`), which is ~600+ lines
- Selectors (`useAppStore((s) => s.xxx)`) are used everywhere for granular subscriptions
- State shape must be carefully managed to avoid bloat
- No middleware for async — Tauri IPC calls are handled in components/hooks
