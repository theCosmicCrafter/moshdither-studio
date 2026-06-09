import { describe, it, expect } from "vitest";
import { parseFfprobeOutput, addMetadataPreservationArgs, addCreatorCreditArgs } from "../metadata";

describe("Metadata utilities", () => {
  it("parses ffprobe output into structured metadata", () => {
    const raw = {
      format: {
        tags: {
          creation_time: "2026-01-15T10:30:00Z",
          artist: "Test Artist",
          title: "Test Title",
          comment: "A test video",
        },
        duration: "60.5",
        bit_rate: "5000000",
      },
      streams: [
        { codec_name: "h264", width: 1920, height: 1080, avg_frame_rate: "30000/1001" },
      ],
    };
    const meta = parseFfprobeOutput(raw);
    expect(meta.creationTime).toBe("2026-01-15T10:30:00Z");
    expect(meta.artist).toBe("Test Artist");
    expect(meta.title).toBe("Test Title");
    expect(meta.comment).toBe("A test video");
    expect(meta.duration).toBe(60.5);
    expect(meta.bitrate).toBe(5000000);
    expect(meta.width).toBe(1920);
    expect(meta.height).toBe(1080);
    expect(meta.fps).toBeCloseTo(29.97, 1);
    expect(meta.codec).toBe("h264");
  });

  it("returns empty metadata for null input", () => {
    const meta = parseFfprobeOutput({});
    expect(meta.tags).toBeUndefined();
    expect(meta.duration).toBeUndefined();
  });

  it("adds -map_metadata 0 after input", () => {
    const args = ["-i", "input.mp4", "-c:v", "libx264", "output.mp4"];
    const result = addMetadataPreservationArgs(args);
    expect(result).toEqual(["-i", "input.mp4", "-map_metadata", "0", "-c:v", "libx264", "output.mp4"]);
  });

  it("does not duplicate -map_metadata", () => {
    const args = ["-i", "input.mp4", "-map_metadata", "0", "output.mp4"];
    const result = addMetadataPreservationArgs(args);
    expect(result).toEqual(args);
  });

  it("adds creator credit metadata", () => {
    const args = ["-i", "input.mp4", "output.mp4"];
    const result = addCreatorCreditArgs(args, "Jane Doe");
    expect(result).toContain("-metadata");
    expect(result).toContain("artist=Jane Doe");
    expect(result).toContain("encoder=MoshDither Studio");
  });
});
