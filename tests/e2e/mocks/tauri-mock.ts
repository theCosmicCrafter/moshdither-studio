/**
 * Tauri API mock for E2E tests.
 * Injected via Playwright page.addInitScript() to stub out @tauri-apps/api
 * so the frontend runs without the Rust backend.
 */

export const tauriMockScript = `
(() => {
  // Dismiss onboarding modal and clear auto-save before app renders
  try {
    localStorage.setItem("onboardingDismissed", "true");
    localStorage.removeItem("moshdither_autosave_v1");
    localStorage.removeItem("moshdither_recent_projects_v1");
  } catch (e) {}

  // Mock invoke — returns canned data per command
  const mockResponses = {
    list_effects: [
      { id: "dithering.bayer", name: "Bayer Dither", category: "dithering", media_type: "image", parameters: [] },
      { id: "dithering.floyd_steinberg", name: "Floyd-Steinberg", category: "dithering", media_type: "image", parameters: [] },
      { id: "analog.vhs", name: "VHS", category: "analog", media_type: "video", parameters: [] },
      { id: "glitch.slice_shift", name: "Slice Shift", category: "glitch", media_type: "video", parameters: [] },
      { id: "color.brightness", name: "Brightness", category: "color", media_type: "image", parameters: [] },
    ],
    list_effects_by_category: (args) => {
      const all = [
        { id: "dithering.bayer", name: "Bayer Dither", category: "dithering", media_type: "image", parameters: [] },
        { id: "dithering.floyd_steinberg", name: "Floyd-Steinberg", category: "dithering", media_type: "image", parameters: [] },
      ];
      return all.filter(e => e.category === args.category);
    },
    get_media_info: { width: 1920, height: 1080, loaded: false },
    get_environment_status: {
      mode: "portable",
      python_ok: true,
      venv_ok: true,
      pip_ok: true,
      ffmpeg_ok: true,
      ffprobe_ok: true,
      ffglitch_ok: false,
    },
    sam3_init: "SAM3 engine initialized",
    load_media: () => {},
    get_frame_data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    apply_effect: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    apply_effect_stack: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    generate_proxy_command: "C:/tmp/moshdither-proxy/test_proxy_1280p.mp4",
  };

  // Mock window object for @tauri-apps/api/window
  const mockWindow = {
    label: "main",
    isFullscreen: () => Promise.resolve(false),
    isMaximized: () => Promise.resolve(false),
    minimize: () => Promise.resolve(),
    maximize: () => Promise.resolve(),
    unmaximize: () => Promise.resolve(),
    setFullscreen: () => Promise.resolve(),
    close: () => Promise.resolve(),
    onResized: () => Promise.resolve(() => {}),
    onDragDropEvent: () => Promise.resolve(() => {}),
  };

  window.__TAURI_INTERNALS__ = {
    invoke(command, args) {
      console.log('[TAURI MOCK] invoke:', command, args);
      const response = mockResponses[command];
      if (typeof response === 'function') return Promise.resolve(response(args));
      if (response !== undefined) return Promise.resolve(response);
      return Promise.resolve({});
    },
    convertFileSrc(path) {
      return 'http://localhost:1420/mock-file/' + encodeURIComponent(path);
    },
  };

  // Mock @tauri-apps/api/core
  window.__TAURI_API__ = {
    core: {
      invoke: (cmd, args) => window.__TAURI_INTERNALS__.invoke(cmd, args),
      convertFileSrc: (path) => window.__TAURI_INTERNALS__.convertFileSrc(path),
    },
  };

  // Mock @tauri-apps/api/window — getCurrentWindow returns a mock window
  window.__TAURI_WINDOW__ = {
    getCurrentWindow: () => mockWindow,
  };

  // Mock @tauri-apps/api/webview — getCurrentWebview returns a mock webview
  window.__TAURI_WEBVIEW__ = {
    getCurrentWebview: () => ({
      onDragDropEvent: () => Promise.resolve(() => {}),
    }),
  };

  // Mock @tauri-apps/plugin-dialog
  window.__TAURI_DIALOG__ = {
    open: () => Promise.resolve(null),
    save: () => Promise.resolve(null),
  };
})();
`;
