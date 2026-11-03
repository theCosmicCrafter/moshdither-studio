/**
 * Tauri API mock for E2E tests.
 * Injected via Playwright page.addInitScript() to stub out @tauri-apps/api
 * so the frontend runs without the Rust backend.
 *
 * `tauriMockScript` is the default no-media build; variants (e.g.
 * `tauriMockWithMediaScript`) are produced by `buildTauriMockScript` with a
 * config of response overrides -- one harness, several data sets. This file
 * used to have a second hand-copied mock for media-flow tests; the copies
 * drifted (ffglitch_ok, load_media's return value, dialog paths, mask data)
 * without either side noticing.
 */

export interface TauriMockConfig {
  /**
   * Plain-data entries merged over the base response table (JSON-serialised
   * into the script). Functions are not supported -- the base table's few
   * function responses deliberately derive from the merged state, so the
   * right override is usually the data they read.
   */
  responses?: Record<string, unknown>;
  /** Path the open dialog returns. Default: opt-in via
   *  `window.__MOSH_E2E_MEDIA_PATH__` (null = cancelled). */
  dialogOpen?: string | null;
  /** Path the save dialog returns. Default: null (cancelled). */
  dialogSave?: string | null;
  /** Start with media already loaded. */
  mediaLoaded?: boolean;
}

export function buildTauriMockScript(config: TauriMockConfig = {}): string {
  const responsesJson = JSON.stringify(config.responses ?? {});
  const dialogOpenJson = JSON.stringify(config.dialogOpen ?? null);
  const dialogSaveJson = JSON.stringify(config.dialogSave ?? null);
  const mediaLoaded = config.mediaLoaded === true;
  return `
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

  // Set true once a test drives a successful open (see plugin:dialog|open),
  // or immediately when the mock was built with mediaLoaded.
  let mediaOpened = ${mediaLoaded};

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
      // Derived from the (possibly overridden) list_effects so a config that
      // swaps the catalogue keeps this command consistent with it.
      return mockResponses.list_effects.filter(e => e.category === args.category);
    },
    // Reports loaded only after a test has opted in by setting
    // window.__MOSH_E2E_MEDIA_PATH__ and driving the open flow (or built the
    // mock with mediaLoaded). Panels gated on media (Mask, and parts of
    // Export) cannot otherwise be reached, while tests that assert the empty
    // state -- "Load media before exporting" -- still get a no-media app by
    // default.
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
  // Config-provided overrides and additions land last. Function values in
  // the base (get_media_info, list_effects_by_category) read this merged
  // table at call time, so data overrides stay consistent.
  Object.assign(mockResponses, ${responsesJson});

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
        // A test opts in to a successful open by setting
        // window.__MOSH_E2E_MEDIA_PATH__ before navigation; a mock built with
        // dialogOpen always returns that path. Either marks media opened.
        const chosen = window.__MOSH_E2E_MEDIA_PATH__ || ${dialogOpenJson};
        if (chosen) mediaOpened = true;
        return Promise.resolve(chosen);
      }
      if (command === 'plugin:dialog|save') return Promise.resolve(${dialogSaveJson});
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
    open: () => Promise.resolve(${dialogOpenJson}),
    save: () => Promise.resolve(${dialogSaveJson}),
  };
})();
`;
}

export const tauriMockScript = buildTauriMockScript();
