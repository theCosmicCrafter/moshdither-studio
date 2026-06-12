# FFglitch on macOS and Linux

## Current Status

FFglitch does not provide official pre-built binaries for macOS or Linux.
The Windows builds (`ffgac.exe`, `ffedit.exe`) are bundled with the app.

On macOS and Linux, the **Environment Setup** modal will:
- Skip the FFglitch installation step
- Show a yellow caution note
- Still install Python, FFmpeg, and all Python dependencies correctly

## Impact

Effects that rely on FFglitch will be unavailable or degraded:
- **Datamoshing** (mosh effects that use FFglitch's frame-level manipulation)
- **FFglitch-specific filters** (glitch, noise, delay, buffer effects)

Effects that do NOT require FFglitch will work normally:
- **Dithering** (all algorithms)
- **Halftone**
- **Color palette reduction**
- **AI masking / SAM segmentation**
- **Background removal**
- **WebGL-based effects** (glitch, CRT, etc.)

## Workarounds

### Option 1: Build FFglitch from Source

FFglitch is open-source. You can build it from the official repository:

```bash
# Clone the repository
git clone https://github.com/ramiropolla/ffglitch.git
cd ffglitch

# Follow the build instructions in the repo's README
# Typically involves:
#   ./configure
#   make
#   make install

# After building, place the resulting ffgac and ffedit binaries
# in your system PATH or in the app's bundled directory:
#   ~/Library/Application Support/MoshDither Studio/assets/bin/ffglitch/  (macOS)
#   ~/.config/MoshDither Studio/assets/bin/ffglitch/                    (Linux)
```

### Option 2: Use Homebrew (macOS)

If a Homebrew formula exists or is contributed:

```bash
brew install ffglitch
```

As of 2026, this is not available. Check `brew search ffglitch` for updates.

### Option 3: Use System PATH Mode

If you already have a working FFmpeg setup and don't need datamoshing:

1. Open **Properties Panel → Backend Environment**
2. Switch to **System PATH** mode
3. The app will use your system's FFmpeg and skip FFglitch entirely

## Future Plans

We are tracking FFglitch cross-platform support. When official builds become
available, the auto-installer will be updated to download them automatically.

See the project's GitHub issues for status updates:
https://github.com/ramiropolla/ffglitch/issues

## Windows Users

No action needed. FFglitch is bundled and auto-installed on Windows.
