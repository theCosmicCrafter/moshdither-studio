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

// jsdom does not implement PointerEvent. Without one, fireEvent.pointerDown
// dispatches a bare Event and clientX never reaches the handler.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventShim extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (window as unknown as { PointerEvent: typeof PointerEventShim }).PointerEvent = PointerEventShim;
}

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
    isVideo: false,
    mediaFps: 30,
    animateFps: 30,
    keyframes: {},
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
      const durationInput = screen.getByTitle("Animation length (seconds)");
      fireEvent.change(durationInput, { target: { value: "5" } });
      expect(useAppStore.getState().duration).toBe(5);
    });

    it("clamps duration to 0.1 when input is too small", () => {
      render(<Timeline />);
      const durationInput = screen.getByTitle("Animation length (seconds)");
      fireEvent.change(durationInput, { target: { value: "0.05" } });
      expect(useAppStore.getState().duration).toBe(0.1);
    });

    it("defaults to 1 when input is NaN", () => {
      render(<Timeline />);
      const durationInput = screen.getByTitle("Animation length (seconds)");
      fireEvent.change(durationInput, { target: { value: "abc" } });
      expect(useAppStore.getState().duration).toBe(1);
    });

    it("clamps negative duration to 0.1", () => {
      render(<Timeline />);
      const durationInput = screen.getByTitle("Animation length (seconds)");
      fireEvent.change(durationInput, { target: { value: "-5" } });
      expect(useAppStore.getState().duration).toBe(0.1);
    });

    it("accepts large duration values", () => {
      render(<Timeline />);
      const durationInput = screen.getByTitle("Animation length (seconds)");
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

    // These used to assert rounding to whole seconds, which pinned the bug:
    // a trim at 1.5 s was impossible in a video tool.
    it("keeps a fractional in point (frame-accurate)", () => {
      useAppStore.getState().setCurrentTime(3.7);
      render(<Timeline />);
      fireEvent.click(screen.getByText("IN"));
      expect(useAppStore.getState().inPoint).toBeCloseTo(3.7, 6);
    });

    it("keeps a fractional out point (frame-accurate)", () => {
      useAppStore.getState().setCurrentTime(5.3);
      render(<Timeline />);
      fireEvent.click(screen.getByText("OUT"));
      expect(useAppStore.getState().outPoint).toBeCloseTo(5.3, 6);
    });
  });

  // ── Frame rate ─────────────────────────────────────────────
  describe("Frame rate", () => {
    it("numbers and steps frames at the clip's own fps for video", () => {
      useAppStore.setState({ isVideo: true, mediaFps: 24, currentTime: 2 });
      render(<Timeline />);
      expect(screen.getByText(/F:00048/)).toBeInTheDocument();
      fireEvent.click(screen.getByTitle("Next frame"));
      expect(useAppStore.getState().currentTime).toBeCloseTo(2 + 1 / 24, 6);
    });

    it("hides the animation-length box for video -- the clip's length is the clip's", () => {
      useAppStore.setState({ isVideo: true });
      render(<Timeline />);
      expect(screen.queryByTitle("Animation length (seconds)")).not.toBeInTheDocument();
    });
  });

  // ── Scrubbing ──────────────────────────────────────────────
  describe("Scrubbing", () => {
    function scrubber() {
      const el = screen.getByTestId("timeline-scrubber");
      el.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 100, height: 16, right: 100, bottom: 16, x: 0, y: 0, toJSON() {} }) as DOMRect;
      return el;
    }

    it("a press sets the playhead where the pointer is", () => {
      render(<Timeline />);
      fireEvent.pointerDown(scrubber(), { clientX: 50, pointerId: 1 });
      expect(useAppStore.getState().currentTime).toBeCloseTo(5, 6);
    });

    it("keeps scrubbing while dragging, and stops after release", () => {
      render(<Timeline />);
      const el = scrubber();
      fireEvent.pointerDown(el, { clientX: 20, pointerId: 1 });
      fireEvent.pointerMove(el, { clientX: 80, pointerId: 1 });
      expect(useAppStore.getState().currentTime).toBeCloseTo(8, 6);
      fireEvent.pointerUp(el, { clientX: 80, pointerId: 1 });
      fireEvent.pointerMove(el, { clientX: 20, pointerId: 1 });
      expect(useAppStore.getState().currentTime).toBeCloseTo(8, 6);
    });
  });

  // ── Keyframes on the bar ───────────────────────────────────
  describe("Keyframes", () => {
    const kf = (id: string, time: number) => ({ id, time, value: 1, easing: "linear" as const });

    it("draws one diamond per distinct time across every parameter", () => {
      useAppStore.setState({
        keyframes: {
          s1: { amount: [kf("a", 2), kf("b", 5)], mix: [kf("c", 2)] },
          s2: { size: [kf("d", 7.5)] },
        },
      });
      render(<Timeline />);
      expect(screen.getAllByRole("button", { name: /^Keyframe at/ })).toHaveLength(3);
      expect(screen.getByText("◆ 3")).toBeInTheDocument();
    });

    it("clicking a diamond jumps the playhead to it", () => {
      useAppStore.setState({ keyframes: { s1: { amount: [kf("a", 5)] } } });
      render(<Timeline />);
      fireEvent.click(screen.getByRole("button", { name: "Keyframe at 00:05.00" }));
      expect(useAppStore.getState().currentTime).toBe(5);
    });

    it("right-click opens a menu; Delete removes every keyframe at that time", () => {
      useAppStore.setState({
        keyframes: { s1: { amount: [kf("a", 2), kf("b", 5)], mix: [kf("c", 2)] } },
      });
      render(<Timeline />);
      fireEvent.contextMenu(screen.getByRole("button", { name: "Keyframe at 00:02.00" }));
      const menu = screen.getByRole("menu", { name: "Keyframe at 00:02.00" });
      expect(menu).toBeInTheDocument();
      fireEvent.click(screen.getByRole("menuitem", { name: /Delete keyframes/ }));
      const left = useAppStore.getState().keyframes;
      expect(left.s1.amount.map((k) => k.id)).toEqual(["b"]);
      expect(left.s1.mix).toBeUndefined();
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("the menu sets an easing on every keyframe at that time and shows the current one", () => {
      useAppStore.setState({
        keyframes: { s1: { amount: [kf("a", 2)], mix: [kf("c", 2)] } },
      });
      render(<Timeline />);
      fireEvent.contextMenu(screen.getByRole("button", { name: "Keyframe at 00:02.00" }));
      expect(screen.getByRole("menuitemradio", { name: /Linear/ })).toHaveAttribute("aria-checked", "true");
      fireEvent.click(screen.getByRole("menuitemradio", { name: /Hold/ }));
      const kfs = useAppStore.getState().keyframes.s1;
      expect(kfs.amount[0].easing).toBe("hold");
      expect(kfs.mix[0].easing).toBe("hold");
      fireEvent.contextMenu(screen.getByRole("button", { name: "Keyframe at 00:02.00" }));
      expect(screen.getByRole("menuitemradio", { name: /Hold/ })).toHaveAttribute("aria-checked", "true");
    });

    it("Escape closes the menu", () => {
      useAppStore.setState({ keyframes: { s1: { amount: [kf("a", 2)] } } });
      render(<Timeline />);
      fireEvent.contextMenu(screen.getByRole("button", { name: "Keyframe at 00:02.00" }));
      expect(screen.getByRole("menu")).toBeInTheDocument();
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("shows no keyframe readout when there are none", () => {
      render(<Timeline />);
      expect(screen.queryByText(/◆/)).not.toBeInTheDocument();
    });
  });

  // ── In/out handles ─────────────────────────────────────────
  describe("In/out handles", () => {
    function scrubber() {
      const el = screen.getByTestId("timeline-scrubber");
      el.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 100, height: 16, right: 100, bottom: 16, x: 0, y: 0, toJSON() {} }) as DOMRect;
      return el;
    }

    it("dragging the in handle moves the in point without touching the playhead", () => {
      useAppStore.setState({ inPoint: 2, outPoint: 8, currentTime: 5 });
      render(<Timeline />);
      const bar = scrubber();
      fireEvent.pointerDown(screen.getByTestId("timeline-in-handle"), { clientX: 20, pointerId: 1 });
      fireEvent.pointerMove(bar, { clientX: 40, pointerId: 1 });
      expect(useAppStore.getState().inPoint).toBeCloseTo(4, 6);
      expect(useAppStore.getState().currentTime).toBe(5);
    });

    it("the in handle cannot be dragged past the out point", () => {
      useAppStore.setState({ inPoint: 2, outPoint: 8, currentTime: 5 });
      render(<Timeline />);
      const bar = scrubber();
      fireEvent.pointerDown(screen.getByTestId("timeline-in-handle"), { clientX: 20, pointerId: 1 });
      fireEvent.pointerMove(bar, { clientX: 95, pointerId: 1 });
      const { inPoint, outPoint } = useAppStore.getState();
      expect(outPoint).toBe(8);
      expect(inPoint).not.toBeNull();
      expect(inPoint!).toBeLessThan(8);
    });

    it("dragging the out handle moves the out point", () => {
      useAppStore.setState({ inPoint: 2, outPoint: 8, currentTime: 5 });
      render(<Timeline />);
      const bar = scrubber();
      fireEvent.pointerDown(screen.getByTestId("timeline-out-handle"), { clientX: 80, pointerId: 1 });
      fireEvent.pointerMove(bar, { clientX: 60, pointerId: 1 });
      fireEvent.pointerUp(bar, { clientX: 60, pointerId: 1 });
      expect(useAppStore.getState().outPoint).toBeCloseTo(6, 6);
      expect(useAppStore.getState().inPoint).toBe(2);
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
