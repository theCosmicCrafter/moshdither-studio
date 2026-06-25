import { describe, it, expect } from "vitest";
import { parseFfprobeOutput, addMetadataPreservationArgs, addCreatorCreditArgs } from "./metadata";

describe("Metadata Utilities", () => {
  describe("parseFfprobeOutput", () => {
    it("parses format tags", () => {
      const raw = {
        format: {
          tags: {
            creation_time: "2024-01-15T10:30:00Z",
            artist: "Test Artist",
            title: "Test Title",
            comment: "Test comment",
            encoder: "test-encoder",
          },
          duration: "120.5",
          bit_rate: "5000000",
        },
        streams: [],
      };
      const meta = parseFfprobeOutput(raw);
      expect(meta.creationTime).toBe("2024-01-15T10:30:00Z");
      expect(meta.artist).toBe("Test Artist");
      expect(meta.title).toBe("Test Title");
      expect(meta.comment).toBe("Test comment");
      expect(meta.encoder).toBe("test-encoder");
      expect(meta.duration).toBe(120.5);
      expect(meta.bitrate).toBe(5000000);
    });

    it("parses video stream metadata", () => {
      const raw = {
        format: {},
        streams: [
          {
            codec_name: "h264",
            width: 1920,
            height: 1080,
            avg_frame_rate: "30000/1001",
          },
        ],
      };
      const meta = parseFfprobeOutput(raw);
      expect(meta.width).toBe(1920);
      expect(meta.height).toBe(1080);
      expect(meta.codec).toBe("h264");
      expect(meta.fps).toBeCloseTo(29.97, 1);
    });

    it("handles missing format tags", () => {
      const meta = parseFfprobeOutput({ format: {}, streams: [] });
      expect(meta.creationTime).toBeUndefined();
      expect(meta.artist).toBeUndefined();
    });

    it("handles missing streams", () => {
      const meta = parseFfprobeOutput({ format: {} });
      expect(meta.width).toBeUndefined();
      expect(meta.height).toBeUndefined();
    });

    it("handles empty object input", () => {
      const meta = parseFfprobeOutput({});
      expect(meta).toEqual({});
    });

    it("handles object with no format or streams", () => {
      const meta = parseFfprobeOutput({ format: undefined, streams: undefined });
      expect(meta).toEqual({});
    });

    it("handles avg_frame_rate with zero denominator", () => {
      const raw = {
        streams: [{ width: 100, height: 100, avg_frame_rate: "30/0" }],
      };
      const meta = parseFfprobeOutput(raw);
      expect(meta.fps).toBeUndefined();
    });

    it("handles avg_frame_rate without slash", () => {
      const raw = {
        streams: [{ width: 100, height: 100, avg_frame_rate: "30" }],
      };
      const meta = parseFfprobeOutput(raw);
      // "30".split("/") = ["30"], den = undefined, so fps stays undefined
      expect(meta.fps).toBeUndefined();
    });

    it("picks first video stream (with width+height)", () => {
      const raw = {
        streams: [
          { codec_name: "aac" }, // audio stream, no width/height
          { codec_name: "h264", width: 1280, height: 720 },
        ],
      };
      const meta = parseFfprobeOutput(raw);
      expect(meta.codec).toBe("h264");
      expect(meta.width).toBe(1280);
    });

    it("preserves raw tags object", () => {
      const raw = {
        format: {
          tags: { custom_field: "custom_value", creation_time: "2024" },
        },
      };
      const meta = parseFfprobeOutput(raw);
      expect(meta.tags).toEqual({ custom_field: "custom_value", creation_time: "2024" });
    });

    it("handles uppercase tag keys", () => {
      const raw = {
        format: {
          tags: { ARTIST: "UPPER", TITLE: "Upper Title" },
        },
      };
      const meta = parseFfprobeOutput(raw);
      expect(meta.artist).toBe("UPPER");
      expect(meta.title).toBe("Upper Title");
    });

    it("handles alternative tag names (date, author, description, Software)", () => {
      const raw = {
        format: {
          tags: {
            date: "2024-06-15",
            author: "Author Name",
            description: "A description",
            Software: "Some Software",
          },
        },
      };
      const meta = parseFfprobeOutput(raw);
      expect(meta.creationTime).toBe("2024-06-15");
      expect(meta.artist).toBe("Author Name");
      expect(meta.comment).toBe("A description");
      expect(meta.encoder).toBe("Some Software");
    });
  });

  describe("addMetadataPreservationArgs", () => {
    it("inserts -map_metadata 0 after -i input", () => {
      const args = ["-i", "input.mp4", "-c:v", "libx264", "output.mp4"];
      const result = addMetadataPreservationArgs(args);
      expect(result).toEqual([
        "-i",
        "input.mp4",
        "-map_metadata",
        "0",
        "-c:v",
        "libx264",
        "output.mp4",
      ]);
    });

    it("does not add if -map_metadata already present", () => {
      const args = ["-i", "input.mp4", "-map_metadata", "0", "output.mp4"];
      const result = addMetadataPreservationArgs(args);
      expect(result).toEqual(args);
    });

    it("returns unchanged if no -i flag", () => {
      const args = ["-c:v", "libx264", "output.mp4"];
      const result = addMetadataPreservationArgs(args);
      expect(result).toEqual(args);
    });

    it("does not mutate original array", () => {
      const original = ["-i", "input.mp4", "output.mp4"];
      const originalCopy = [...original];
      addMetadataPreservationArgs(original);
      expect(original).toEqual(originalCopy);
    });
  });

  describe("addCreatorCreditArgs", () => {
    it("adds artist and encoder metadata", () => {
      const args = ["-i", "input.mp4", "output.mp4"];
      const result = addCreatorCreditArgs(args, "John Doe");
      expect(result).toContain("-metadata");
      expect(result).toContain("artist=John Doe");
      expect(result).toContain("encoder=MoshDither Studio");
    });

    it("uses custom software name", () => {
      const args = ["-i", "input.mp4", "output.mp4"];
      const result = addCreatorCreditArgs(args, "Jane", "Custom App");
      expect(result).toContain("encoder=Custom App");
    });

    it("does not add if -metadata already present", () => {
      const args = ["-i", "input.mp4", "-metadata", "title=Existing", "output.mp4"];
      const result = addCreatorCreditArgs(args, "John");
      // Should not add more -metadata entries
      const metadataCount = result.filter((a) => a === "-metadata").length;
      expect(metadataCount).toBe(1);
    });

    it("does not mutate original array", () => {
      const original = ["-i", "input.mp4", "output.mp4"];
      const originalCopy = [...original];
      addCreatorCreditArgs(original, "John");
      expect(original).toEqual(originalCopy);
    });
  });
});
