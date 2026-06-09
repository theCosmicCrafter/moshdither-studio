/**
 * Metadata handling for MoshDither Studio.
 *
 * Reads and preserves media metadata (EXIF for images, XMP/ID3 for video)
 * through the render pipeline using ffmpeg/ffprobe.
 */

export interface MediaMetadata {
  creationTime?: string;
  artist?: string;
  title?: string;
  comment?: string;
  encoder?: string;
  width?: number;
  height?: number;
  duration?: number;
  fps?: number;
  bitrate?: number;
  codec?: string;
  // Raw key-value pairs from ffprobe
  tags?: Record<string, string>;
}

/**
 * Parse ffprobe JSON output into a structured MediaMetadata object.
 */
export function parseFfprobeOutput(raw: unknown): MediaMetadata {
  const meta: MediaMetadata = {};
  const probe = raw as {
    format?: { tags?: Record<string, string>; duration?: string; bit_rate?: string };
    streams?: Array<{
      width?: number; height?: number; codec_name?: string; avg_frame_rate?: string; tags?: Record<string, string>;
    }>;
  };

  if (probe.format?.tags) {
    const tags = probe.format.tags;
    meta.tags = tags;
    meta.creationTime = tags.creation_time || tags.date || tags.DateTimeOriginal;
    meta.artist = tags.artist || tags.ARTIST || tags.author;
    meta.title = tags.title || tags.TITLE;
    meta.comment = tags.comment || tags.COMMENT || tags.description;
    meta.encoder = tags.encoder || tags.Encoder || tags.Software;
  }

  if (probe.format?.duration) {
    meta.duration = parseFloat(probe.format.duration);
  }
  if (probe.format?.bit_rate) {
    meta.bitrate = parseInt(probe.format.bit_rate, 10);
  }

  const videoStream = probe.streams?.find((s) => s.width && s.height);
  if (videoStream) {
    meta.width = videoStream.width;
    meta.height = videoStream.height;
    meta.codec = videoStream.codec_name;
    if (videoStream.avg_frame_rate) {
      const [num, den] = videoStream.avg_frame_rate.split("/").map(Number);
      if (den && den !== 0) meta.fps = num / den;
    }
  }

  return meta;
}

/**
 * Build ffmpeg arguments to preserve metadata from source to output.
 * Use `-map_metadata 0` to copy all metadata streams.
 */
export function addMetadataPreservationArgs(existingArgs: string[]): string[] {
  // Insert -map_metadata 0 after the first -i input (if not already present)
  if (existingArgs.includes("-map_metadata")) return existingArgs;

  const inputIndex = existingArgs.indexOf("-i");
  if (inputIndex === -1) return existingArgs;

  const result = [...existingArgs];
  // Insert -map_metadata 0 right after the input filename
  result.splice(inputIndex + 2, 0, "-map_metadata", "0");
  return result;
}

/**
 * Build ffmpeg arguments to embed creator credits.
 */
export function addCreatorCreditArgs(
  existingArgs: string[],
  creator: string,
  software: string = "MoshDither Studio",
): string[] {
  const result = [...existingArgs];
  // Avoid duplicates
  if (!result.includes("-metadata")) {
    result.push("-metadata", `artist=${creator}`);
    result.push("-metadata", `encoder=${software}`);
  }
  return result;
}
