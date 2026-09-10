/**
 * Tauri API mock pre-loaded with test media for E2E flow tests.
 * Use this variant when a test needs to exercise export, SAM3 mask, or other
 * features that require a loaded media file.
 */

export const tauriMockWithMediaScript = `
(() => {
  try {
    localStorage.setItem("onboardingDismissed", "true");
    localStorage.removeItem("moshdither_autosave_v1");
    localStorage.removeItem("moshdither_recent_projects_v1");
  } catch (e) {}

  const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  // Bayer's own matrix_size parameter, given real definitions so tests can
  // actually drive a parameter change through the UI (rather than just
  // checking that some slider/input exists somewhere on the page).
  const bayerParameters = [
    { id: "matrix_size", name: "Matrix Size", type: "select", default: 0, options: ["2", "4", "8", "16"] },
  ];

  const mockResponses = {
    // An empty library, as a string: the real command returns file text.
    load_presets: '',
    get_presets_path: 'C:/mock/presets.json',
    list_effects: [
      { id: "dithering.bayer", name: "Bayer Dither", category: "dithering", media_type: "image", parameters: bayerParameters },
      { id: "dithering.floyd_steinberg", name: "Floyd-Steinberg", category: "dithering", media_type: "image", parameters: [] },
      { id: "analog.vhs", name: "VHS", category: "analog", media_type: "video", parameters: [] },
      { id: "glitch.slice_shift", name: "Slice Shift", category: "glitch", media_type: "video", parameters: [] },
      { id: "color.brightness", name: "Brightness", category: "color", media_type: "image", parameters: [] },
    ],
    list_effects_by_category: (args) => {
      const all = [
        { id: "dithering.bayer", name: "Bayer Dither", category: "dithering", media_type: "image", parameters: bayerParameters },
        { id: "dithering.floyd_steinberg", name: "Floyd-Steinberg", category: "dithering", media_type: "image", parameters: [] },
      ];
      return all.filter(e => e.category === args.category);
    },
    get_media_info: { width: 1920, height: 1080, loaded: true },
    get_media_metadata: {},
    get_environment_status: {
      mode: "portable",
      python_ok: true,
      venv_ok: true,
      pip_ok: true,
      ffmpeg_ok: true,
      ffprobe_ok: true,
      ffglitch_ok: true,
    },
    sam3_init: "SAM3 engine initialized",
    sam3_load_image: { width: 1920, height: 1080 },
    sam3_auto_mask: { count: 2, masks: [tinyPng, tinyPng], scores: [0.95, 0.82] },
    sam3_text_prompt: { count: 1, masks: [tinyPng], scores: [0.91] },
    sam3_point_prompt: { count: 1, masks: [tinyPng], scores: [0.88] },
    sam3_box_prompt: { count: 1, masks: [tinyPng], scores: [0.9] },
    sam3_postprocess_mask: tinyPng,
    sam3_clear: "cleared",
    load_media: { loaded: true, width: 1920, height: 1080 },
    load_media_from_base64: { loaded: true, width: 1920, height: 1080 },
    get_frame_data: tinyPng,
    apply_effect: tinyPng,
    apply_effect_stack: tinyPng,
    export_video: "C:/tmp/moshdither-export/test_export.mp4",
    apply_ffglitch: "C:/tmp/moshdither-export/test_ffglitch.mp4",
    save_media: "C:/tmp/moshdither-export/test_save.png",
    process_frame: tinyPng,
    generate_proxy_command: "C:/tmp/moshdither-proxy/test_proxy_1280p.mp4",
  };

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
      if (command === 'plugin:dialog|open') return Promise.resolve("C:/tmp/moshdither/test_clip.mp4");
      if (command === 'plugin:dialog|save') return Promise.resolve("C:/tmp/moshdither-export/test_export.mp4");
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

  window.__TAURI_API__ = {
    core: {
      invoke: (cmd, args) => window.__TAURI_INTERNALS__.invoke(cmd, args),
      convertFileSrc: (path) => window.__TAURI_INTERNALS__.convertFileSrc(path),
    },
  };

  window.__TAURI_WINDOW__ = {
    getCurrentWindow: () => mockWindow,
  };

  window.__TAURI_WEBVIEW__ = {
    getCurrentWebview: () => ({
      onDragDropEvent: () => Promise.resolve(() => {}),
    }),
  };

  window.__TAURI_DIALOG__ = {
    open: () => Promise.resolve("C:/tmp/moshdither/test_clip.mp4"),
    save: () => Promise.resolve("C:/tmp/moshdither-export/test_export.mp4"),
  };
})();
`;
