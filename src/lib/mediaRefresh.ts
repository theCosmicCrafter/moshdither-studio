import { useAppStore } from "../store";
import {
  convertFileSrc,
  generateProxy,
  getFrameData,
  getMediaInfo,
  getMediaMetadata,
} from "./tauri";
import { logger } from "../utils/logger";

const VIDEO_EXT = /\.(mp4|avi|mov|mkv|webm|m4v|flv|wmv|mpeg|mpg)$/i;

/**
 * The single media-state sync after ANY load path (File menu, native OS
 * drag-drop, the HTML5 dropzone, session restore, animate-as-video).
 *
 * It used to exist twice — AppLayout.refreshPreview and PreviewViewport's
 * refreshPreviewFromBackend — and the copies had already drifted: the
 * viewport's version never set duration/mediaFps, so a video that arrived
 * over the dropzone kept the 10 s / 30 fps defaults and could export
 * trimmed at ten seconds.
 *
 * Returns false when the backend reports no media or the refresh fails; the
 * status bar already carries the reason, so callers only need to not claim
 * success.
 */
export async function refreshMediaState(): Promise<boolean> {
  try {
    const info = await getMediaInfo();
    if (!info.loaded) return false;

    const s = useAppStore.getState();
    const path = s.filePath;
    const isVideoFile = !!path && VIDEO_EXT.test(path);
    s.setMediaLoaded(true);
    s.setMediaInfo({ width: info.width, height: info.height });
    s.setIsVideo(isVideoFile);

    // Always use the backend-generated PNG data URL — reliable in dev/prod.
    const frame = await getFrameData();
    s.setPreviewDataUrl(frame);
    s.setOriginalDataUrl(frame);

    if (isVideoFile && path) {
      // The clip's real length and frame rate. Without these `duration`
      // stays at the store default of 10, so the timeline claims every
      // video is ten seconds, playback stops there, and an export with no
      // out-point set TRIMS there — a 35-second clip exported as 10.
      try {
        const meta = await getMediaMetadata(path);
        if (typeof meta.duration === "number" && meta.duration > 0) {
          s.setDuration(meta.duration);
        }
        s.setMediaFps(typeof meta.fps === "number" && meta.fps > 0 ? meta.fps : 30);
      } catch (err) {
        // A probe failure must not block loading the media; the timeline
        // just keeps whatever length it had.
        logger.warn("metadata", "Could not read media duration", { err: String(err) });
      }
      try {
        const proxy = await generateProxy(path, 1280, 28);
        s.setProxyUrl(convertFileSrc(proxy));
      } catch (err) {
        logger.warn("proxy", "Proxy generation failed", { err: String(err) });
        s.setProxyUrl(null);
      }
    } else {
      s.setProxyUrl(null);
      s.setMediaFps(30);
    }
    return true;
  } catch (err) {
    logger.error("preview", "refreshMediaState failed", { err: String(err) });
    const msg = err instanceof Error ? err.message : String(err);
    useAppStore.getState().setStatusMessage(`Preview refresh failed: ${msg}`);
    return false;
  }
}
