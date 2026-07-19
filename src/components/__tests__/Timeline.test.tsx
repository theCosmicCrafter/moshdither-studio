/**
 * Tests for Timeline: duration input clamping, in/out points, transport controls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useAppStore } from "../../store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve({})),
  convertFileSrc: vi.fn((path: string) => path),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(() => Promise.resolve(null)),
  save: vi.fn(() => Promise.resolve(null)),
}));

import Timeline from "../Timeline";

function resetStore() {
  useAppStore.setState({
    currentTime: 0,
    isPlaying: true,
    loopMode: "off",
    duration: 10,
    inPoint: null,
    outPoint: null,
    playbackSpeed: 1,
    audioFilePath: null,
    audioBpm: null,
  });
}

describe("Timeline", () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders without crashing", () => {
    render(<Timeline />);
    // isPlaying defaults to true, so the transport button shows "Pause"
    expect(screen.getByTitle("Pause")).toBeInTheDocument();
  });

  it("displays current time and duration", () => {
    useAppStore.getState().setCurrentTime(3.5);
    render(<Timeline />);
    expect(screen.getByText("00:03.50")).toBeInTheDocument();
    expect(screen.getByText("00:10.00")).toBeInTheDocument();
  });

  it("displays frame counter", () => {
    useAppStore.getState().setCurrentTime(2);
    render(<Timeline />);
    // 2 * 30fps = 60 frames
    expect(screen.getByText(/F:00060/)).toBeInTheDocument();
  });

  // ── Duration input clamping ────────────────────────────────
  describe("Duration input clamping", () => {
    it("clamps duration to minimum 0.1 on valid input", () => {
      render(<Timeline />);
      const durationInput = screen.getByTitle("Clip length (seconds)");
      fireEvent.change(durationInput, { target: { value: "5" } });
      expect(useAppStore.getState().duration).toBe(5);
    });

    it("clamps duration to 0.1 when input is too small", () => {
      render(<Timeline />);
      const durationInput = screen.getByTitle("Clip length (seconds)");
      fireEvent.change(durationInput, { target: { value: "0.05" } });
      expect(useAppStore.getState().duration).toBe(0.1);
    });

    it("defaults to 1 when input is NaN", () => {
      render(<Timeline />);
      const durationInput = screen.getByTitle("Clip length (seconds)");
      fireEvent.change(durationInput, { target: { value: "abc" } });
      expect(useAppStore.getState().duration).toBe(1);
    });

    it("clamps negative duration to 0.1", () => {
      render(<Timeline />);
      const durationInput = screen.getByTitle("Clip length (seconds)");
      fireEvent.change(durationInput, { target: { value: "-5" } });
      expect(useAppStore.getState().duration).toBe(0.1);
    });

    it("accepts large duration values", () => {
      render(<Timeline />);
      const durationInput = screen.getByTitle("Clip length (seconds)");
      fireEvent.change(durationInput, { target: { value: "300" } });
      expect(useAppStore.getState().duration).toBe(300);
    });
  });

  // ── In/Out points ──────────────────────────────────────────
  describe("In/Out points", () => {
    it("sets in point on IN button click", () => {
      useAppStore.getState().setCurrentTime(3);
      render(<Timeline />);
      fireEvent.click(screen.getByText("IN"));
      expect(useAppStore.getState().inPoint).toBe(3);
    });

    it("sets out point on OUT button click", () => {
      useAppStore.getState().setCurrentTime(7);
      render(<Timeline />);
      fireEvent.click(screen.getByText("OUT"));
      expect(useAppStore.getState().outPoint).toBe(7);
    });

    it("shows CLR button when in/out points are set", () => {
      useAppStore.getState().setInPoint(2);
      render(<Timeline />);
      expect(screen.getByText("CLR")).toBeInTheDocument();
    });

    it("clears in/out points on CLR click", () => {
      useAppStore.getState().setInPoint(2);
      useAppStore.getState().setOutPoint(8);
      render(<Timeline />);
      fireEvent.click(screen.getByText("CLR"));
      expect(useAppStore.getState().inPoint).toBeNull();
      expect(useAppStore.getState().outPoint).toBeNull();
    });

    it("does not show CLR button when no in/out points", () => {
      render(<Timeline />);
      expect(screen.queryByText("CLR")).not.toBeInTheDocument();
    });

    it("rounds in point to integer", () => {
      useAppStore.getState().setCurrentTime(3.7);
      render(<Timeline />);
      fireEvent.click(screen.getByText("IN"));
      expect(useAppStore.getState().inPoint).toBe(4);
    });

    it("rounds out point to integer", () => {
      useAppStore.getState().setCurrentTime(5.3);
      render(<Timeline />);
      fireEvent.click(screen.getByText("OUT"));
      expect(useAppStore.getState().outPoint).toBe(5);
    });
  });

  // ── Transport controls ─────────────────────────────────────
  describe("Transport controls", () => {
    it("toggles play on play/pause button", () => {
      render(<Timeline />);
      // isPlaying defaults to true, so the button is titled "Pause"
      const playBtn = screen.getByTitle("Pause");
      fireEvent.click(playBtn);
      expect(useAppStore.getState().isPlaying).toBe(false);
    });

    it("goes to start on skip_previous", () => {
      useAppStore.getState().setCurrentTime(5);
      render(<Timeline />);
      fireEvent.click(screen.getByTitle("Go to in point"));
      expect(useAppStore.getState().currentTime).toBe(0);
    });

    it("goes to end on skip_next", () => {
      render(<Timeline />);
      fireEvent.click(screen.getByTitle("Go to out point"));
      expect(useAppStore.getState().currentTime).toBe(10);
    });

    it("steps forward one frame on next frame", () => {
      useAppStore.getState().setCurrentTime(2);
      render(<Timeline />);
      fireEvent.click(screen.getByTitle("Next frame"));
      expect(useAppStore.getState().currentTime).toBeCloseTo(2 + 1 / 30, 5);
    });

    it("steps backward one frame on previous frame", () => {
      useAppStore.getState().setCurrentTime(2);
      render(<Timeline />);
      fireEvent.click(screen.getByTitle("Previous frame"));
      expect(useAppStore.getState().currentTime).toBeCloseTo(2 - 1 / 30, 5);
    });

    it("cycles loop mode on repeat button", () => {
      render(<Timeline />);
      const loopBtn = screen.getByTitle(/Loop: off/);
      fireEvent.click(loopBtn);
      expect(useAppStore.getState().loopMode).toBe("loop");
      const loopBtn2 = screen.getByTitle(/Loop: loop/);
      fireEvent.click(loopBtn2);
      expect(useAppStore.getState().loopMode).toBe("pingpong");
      const loopBtn3 = screen.getByTitle(/Loop: pingpong/);
      fireEvent.click(loopBtn3);
      expect(useAppStore.getState().loopMode).toBe("off");
    });
  });

  // ── Speed selector ─────────────────────────────────────────
  describe("Speed selector", () => {
    it("renders speed dropdown", () => {
      render(<Timeline />);
      expect(screen.getByLabelText("Playback speed")).toBeInTheDocument();
    });

    it("changes playback speed on select", () => {
      render(<Timeline />);
      const select = screen.getByLabelText("Playback speed");
      fireEvent.change(select, { target: { value: "2" } });
      expect(useAppStore.getState().playbackSpeed).toBe(2);
    });
  });

  // ── BPM display ────────────────────────────────────────────
  describe("BPM display", () => {
    it("shows BPM when audioBpm is set", () => {
      useAppStore.getState().setAudioBpm(128);
      render(<Timeline />);
      expect(screen.getByText("128 BPM")).toBeInTheDocument();
    });

    it("does not show BPM when null", () => {
      render(<Timeline />);
      expect(screen.queryByText(/BPM/)).not.toBeInTheDocument();
    });
  });

  // ── Audio file name ────────────────────────────────────────
  describe("Audio file name", () => {
    it("shows audio file name when set", () => {
      useAppStore.getState().setAudioFilePath("song.mp3");
      render(<Timeline />);
      expect(screen.getByText("song.mp3")).toBeInTheDocument();
    });

    it("shows only the file name, not the full path", () => {
      useAppStore.getState().setAudioFilePath("C:\\Users\\richk\\Music\\song.mp3");
      render(<Timeline />);
      expect(screen.getByText("song.mp3")).toBeInTheDocument();
      expect(
        screen.queryByText("C:\\Users\\richk\\Music\\song.mp3")
      ).not.toBeInTheDocument();
      expect(screen.getByTitle("C:\\Users\\richk\\Music\\song.mp3")).toBeInTheDocument();
    });

    it("does not show audio file name when null", () => {
      render(<Timeline />);
      expect(screen.queryByText("song.mp3")).not.toBeInTheDocument();
    });
  });
});
