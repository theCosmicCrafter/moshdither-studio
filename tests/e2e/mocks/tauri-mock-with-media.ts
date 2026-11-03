/**
 * Tauri API mock pre-loaded with test media for E2E flow tests.
 * Use this variant when a test needs to exercise export, SAM3 mask, or other
 * features that require a loaded media file.
 *
 * This is a `buildTauriMockScript` config over the shared harness in
 * `./tauri-mock` -- it used to be a hand-copied second mock and had drifted
 * from the base (different mask payloads, `ffglitch_ok`, `load_media`'s
 * return, dialog paths). Only the differences live here now.
 */

import { buildTauriMockScript } from "./tauri-mock";

const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// Bayer's own matrix_size parameter, given real definitions so tests can
// actually drive a parameter change through the UI (rather than just
// checking that some slider/input exists somewhere on the page).
const bayerParameters = [
  { id: "matrix_size", name: "Matrix Size", type: "select", default: 0, options: ["2", "4", "8", "16"] },
];

export const tauriMockWithMediaScript = buildTauriMockScript({
  mediaLoaded: true,
  dialogOpen: "C:/tmp/moshdither/test_clip.mp4",
  dialogSave: "C:/tmp/moshdither-export/test_export.mp4",
  responses: {
    list_effects: [
      { id: "dithering.bayer", name: "Bayer Dither", category: "dithering", media_type: "image", parameters: bayerParameters },
      { id: "dithering.floyd_steinberg", name: "Floyd-Steinberg", category: "dithering", media_type: "image", parameters: [] },
      { id: "analog.vhs", name: "VHS", category: "analog", media_type: "video", parameters: [] },
      { id: "glitch.slice_shift", name: "Slice Shift", category: "glitch", media_type: "video", parameters: [] },
      { id: "color.brightness", name: "Brightness", category: "color", media_type: "image", parameters: [] },
    ],
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
    sam3_auto_mask: { count: 2, masks: [tinyPng, tinyPng], scores: [0.95, 0.82] },
    sam3_text_prompt: { count: 1, masks: [tinyPng], scores: [0.91] },
    sam3_point_prompt: { count: 1, masks: [tinyPng], scores: [0.88] },
    sam3_box_prompt: { count: 1, masks: [tinyPng], scores: [0.9] },
    sam3_postprocess_mask: tinyPng,
    sam3_clear: "cleared",
    load_media: { loaded: true, width: 1920, height: 1080 },
    load_media_from_base64: { loaded: true, width: 1920, height: 1080 },
    export_video: "C:/tmp/moshdither-export/test_export.mp4",
    apply_ffglitch: "C:/tmp/moshdither-export/test_ffglitch.mp4",
    save_media: "C:/tmp/moshdither-export/test_save.png",
    process_frame: tinyPng,
  },
});
