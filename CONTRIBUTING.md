# Contributing to MoshDither Studio

Thank you for your interest in contributing! This document will help you get started.

## Development Setup

1. **Install Rust**: [rustup.rs](https://rustup.rs/)
2. **Install Node.js 18+**: [nodejs.org](https://nodejs.org/)
3. **Clone the repository**:
   ```bash
   git clone https://github.com/your-org/moshdither-studio.git
   cd moshdither-studio
   ```
4. **Install dependencies**:
   ```bash
   npm install
   ```
5. **Run in development mode**:
   ```bash
   npm run tauri:dev
   ```

## Project Structure

- `src/` — React + TypeScript frontend
- `src-tauri/src/` — Rust backend
- `src-tauri/src/effects/` — Effect implementations (one category per folder)
- `docs/` — Architecture and API documentation

## Adding a New Effect

See [docs/EFFECT_GUIDE.md](docs/EFFECT_GUIDE.md) for a step-by-step guide.

## Pull Request Process

1. Fork the repository and create a feature branch
2. Make your changes with clear commit messages
3. Run `cargo fmt`, `cargo clippy`, and `npm run lint` before submitting
4. Open a PR with a description of what changed and why

## Questions?

Open an issue or discussion on GitHub.
