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
  // 1x1 white PNG, used as a stand-in segmentation mask.
  const MOCK_MASK_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

  // Set true once a test drives a successful open (see plugin:dialog|open).
  let mediaOpened = false;

  const mockResponses = {
    // An empty library, as a string: the real command returns file text.
    load_presets: '',
    get_presets_path: 'C:/mock/presets.json',
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
    // Reports loaded only after a test has opted in by setting
    // window.__MOSH_E2E_MEDIA_PATH__ and driving the open flow. Panels gated on
    // media (Mask, and parts of Export) cannot otherwise be reached, while
    // tests that assert the empty state -- "Load media before exporting" --
    // still get a no-media app by default.
    get_media_info: () => ({ width: 1920, height: 1080, loaded: mediaOpened }),
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
    // A 1x1 white PNG stands in for a segmentation mask. The real masks come
    // from the SAM3 Python sidecar, which no browser-side suite can run; these
    // let the mask UI reach its post-segmentation state, where the mode
    // selector, invert, clear and brush controls actually render. Without them
    // those controls are unreachable and their tests could only ever assert
    // that the app had not crashed.
    sam3_load_image: { width: 1920, height: 1080 },
    sam3_text_prompt: {
      count: 1,
      masks: [MOCK_MASK_B64],
      scores: [0.97],
    },
    sam3_point_prompt: {
      count: 1,
      masks: [MOCK_MASK_B64],
      scores: [0.95],
    },
    sam3_box_prompt: { count: 1, masks: [MOCK_MASK_B64], scores: [0.93] },
    sam3_auto_mask: { count: 1, masks: [MOCK_MASK_B64], scores: [0.91] },
    sam3_postprocess_mask: MOCK_MASK_B64,
    sam3_clear: null,
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

  const callbacks = new Map();
  let callbackId = 0;

  window.__TAURI_INTERNALS__ = {
    invoke(command, args) {
      console.log('[TAURI MOCK] invoke:', command, args);
      if (command === 'plugin:event|listen') return Promise.resolve(1);
      if (command === 'plugin:event|unlisten') return Promise.resolve();
      if (command === 'plugin:dialog|open') {
        // Default is null (user cancelled). A test opts in to a successful open
        // by setting window.__MOSH_E2E_MEDIA_PATH__ before navigation.
        const chosen = window.__MOSH_E2E_MEDIA_PATH__ || null;
        if (chosen) mediaOpened = true;
        return Promise.resolve(chosen);
      }
      if (command === 'plugin:dialog|save') return Promise.resolve(null);
      const response = mockResponses[command];
      if (typeof response === 'function') return Promise.resolve(response(args));
      if (response !== undefined) return Promise.resolve(response);
      return Promise.resolve({});
    },
    convertFileSrc(path) {
      return 'http://localhost:1420/mock-file/' + encodeURIComponent(path);
    },
    transformCallback(callback) {
      const id = String(++callbackId);
      callbacks.set(id, callback);
      return id;
    },
    unregisterCallback(id) {
      callbacks.delete(id);
    },
  };

  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener() {},
    emit() {},
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
