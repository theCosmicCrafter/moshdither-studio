> **MoshDither Studio** — Desktop GUI Package

This package contains the Electron + React + Vite frontend of MoshDither Studio.

## Tech Stack

- **Electron 42** — Cross-platform desktop shell
- **React 19** — UI framework
- **Vite 8** — Build tool and dev server
- **TypeScript 6** — Type safety
- **WebGL2** — Real-time shader preview
- **Vitest** — Unit testing

## Development

```bash
npm install
npm run dev        # Start Vite dev server + Electron
```

## Build

```bash
npm run build      # TypeScript compile + Vite build
```

## Lint

```bash
npm run lint       # ESLint with react-hooks rules
```

## Test

```bash
npm test           # Vitest unit tests
```

## Security Fuses (Production)

After `electron-builder` packages the app, flip security fuses:

```bash
npm run flip-fuses -- dist/Moshdither\ Studio-win32-x64/Moshdither\ Studio.exe
```

See [`../../docs/PRODUCTION_HARDENING_PLAN.md`](../../docs/PRODUCTION_HARDENING_PLAN.md) for fuse details.

## Project Structure

```
src/
  components/      React components (atoms, molecules, organisms, templates)
  context/         React Context providers (StudioContext)
  hooks/           Custom React hooks
  types/           TypeScript type definitions
  math/            Utility math functions (Bayer matrices, etc.)
  test/            Test utilities (IPC mock, etc.)
electron/
  main.ts          Electron main process
  preload.ts       Preload script (hardened IPC bridge)
```

## License

MIT © 2026 MoshDither Studio Contributors
