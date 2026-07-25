import { useState, useEffect, useRef } from "react";
import { useAppStore } from "../store";
import { sam3VideoPredictor } from "../lib/tauri";

// NOTE: Removed `React` default import and `mediaInfo` store subscription
// as they were unused. If video metadata (duration, dimensions, etc.) is
// needed in the future, re-add: `const mediaInfo = useAppStore((s) => s.mediaInfo);`

export default function FrameTimeline() {
  const isVideo = useAppStore((s) => s.isVideo);
  const proxyUrl = useAppStore((s) => s.proxyUrl);
  const currentTime = useAppStore((s) => s.currentTime);
  const setCurrentTime = useAppStore((s) => s.setCurrentTime);
  const sam3FrameMasks = useAppStore((s) => s.sam3FrameMasks);
  const setSam3FrameMasks = useAppStore((s) => s.setSam3FrameMasks);
  const clearSam3FrameMasks = useAppStore((s) => s.clearSam3FrameMasks);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  const [frames, setFrames] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Extract frames from video for SAM3 prediction
  const extractFrames = async () => {
    if (!videoRef.current || !isVideo) return;
    setIsProcessing(true);
    setStatusMessage("Extracting frames...");

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");

    const fps = 10; // Extract at 10 fps to avoid overwhelming SAM3
    const duration = video.duration;
    const frameCount = Math.floor(duration * fps);
    const extracted: string[] = [];

    const originalTime = video.currentTime;

    for (let i = 0; i < frameCount; i++) {
      video.currentTime = i / fps;
      await new Promise((resolve) => {
        video.onseeked = resolve;
      });
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const b64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
      extracted.push(b64);
      setStatusMessage(`Extracted frame ${i + 1}/${frameCount}`);
    }

    video.currentTime = originalTime;
    setFrames(extracted);
    setStatusMessage(`Running SAM3 video predictor on ${frameCount} frames...`);

    try {
      // For video predictor, we send the base64 frames
      const result = await sam3VideoPredictor(extracted);
      if (result.status === "ok") {
        const maskMap: Record<number, string> = {};
        result.frame_masks.forEach((masks: string[], i: number) => {
          if (masks.length > 0) {
            maskMap[i] = masks[0]; // take the first mask
          }
        });
        setSam3FrameMasks(maskMap);
        setStatusMessage("Video prediction complete.");
      }
    } catch (e: unknown) {
      setStatusMessage(`Video prediction failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    setIsProcessing(false);
  };

  useEffect(() => {
    setFrames([]);
    clearSam3FrameMasks();

    if (isVideo && proxyUrl) {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.src = proxyUrl;
      video.muted = true;
      videoRef.current = video;
    }
    return () => {
      const video = videoRef.current;
      if (video) {
        video.pause();
        video.src = "";
        video.onseeked = null;
        videoRef.current = null;
      }
      setFrames([]);
      clearSam3FrameMasks();
    };
  }, [clearSam3FrameMasks, isVideo, proxyUrl]);

  if (!isVideo) return null;

  const currentFrameIndex = Math.floor(currentTime * 10);

  return (
    <div className="flex flex-col gap-2 p-2 bg-[var(--surface-1)] rounded">
      <div className="flex justify-between items-center">
        <h3 className="text-xs font-bold uppercase text-[var(--text-muted)]">Frame Timeline</h3>
        <button
          onClick={extractFrames}
          disabled={isProcessing}
          className="neo-btn rounded-md px-2 py-1 text-xs bg-[var(--surface-2)]"
        >
          {isProcessing ? "Processing..." : "Run Video Predictor"}
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2 h-16 items-center">
        {frames.length > 0 ? (
          frames.map((frame, i) => (
            <button
              key={`frame-thumb-${i}`}
              type="button"
              aria-label={`Select frame ${i + 1}`}
              className={`relative flex-shrink-0 cursor-pointer border-2 frame-thumb p-0 bg-transparent ${
                i === currentFrameIndex ? "border-[var(--accent-teal)]" : "border-transparent"
              }`}
              onClick={() => setCurrentTime(i / 10)}
            >
              <img src={`data:image/jpeg;base64,${frame}`} alt={`Frame ${i + 1}`} className="w-full h-full object-cover" />
              {sam3FrameMasks[i] && (
                <div className="absolute inset-0 bg-green-500/30" />
              )}
            </button>
          ))
        ) : (
          <div className="text-xs text-[var(--text-dim)]">
            Click 'Run Video Predictor' to extract frames and generate tracking masks.
          </div>
        )}
      </div>
    </div>
  );
}
