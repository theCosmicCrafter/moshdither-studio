/**
 * Tests for AnimateAsVideoModal: the duration/frame-rate prompt that replaced
 * the hard-coded 5s/30fps constants. Covers validation bounds, the derived
 * frame count, and that confirmed values are both handed to the caller and
 * remembered for next time.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import AnimateAsVideoModal from "../AnimateAsVideoModal";
import { useAppStore } from "../../store";

function openDialog() {
  useAppStore.getState().setAnimateDialogOpen(true);
}

function fieldFor(label: RegExp) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

describe("AnimateAsVideoModal", () => {
  beforeEach(() => {
    useAppStore.getState().setAnimateDurationSecs(5);
    useAppStore.getState().setAnimateFps(30);
    useAppStore.getState().setAnimateDialogOpen(false);
  });

  afterEach(cleanup);

  it("renders nothing while closed", () => {
    const { container } = render(<AnimateAsVideoModal onConfirm={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("seeds the fields from the remembered values", () => {
    useAppStore.getState().setAnimateDurationSecs(8);
    useAppStore.getState().setAnimateFps(24);
    openDialog();
    render(<AnimateAsVideoModal onConfirm={vi.fn()} />);

    expect(fieldFor(/duration/i).value).toBe("8");
    expect(fieldFor(/frame rate/i).value).toBe("24");
  });

  it("reports the resulting frame count, which is the point of the control", () => {
    openDialog();
    render(<AnimateAsVideoModal onConfirm={vi.fn()} />);

    fireEvent.change(fieldFor(/duration/i), { target: { value: "4" } });
    fireEvent.change(fieldFor(/frame rate/i), { target: { value: "25" } });

    expect(screen.getByText(/100 frames/)).toBeTruthy();
  });

  it("passes the entered values to the caller and remembers them", () => {
    const onConfirm = vi.fn();
    openDialog();
    render(<AnimateAsVideoModal onConfirm={onConfirm} />);

    fireEvent.change(fieldFor(/duration/i), { target: { value: "2.5" } });
    fireEvent.change(fieldFor(/frame rate/i), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: /^animate$/i }));

    expect(onConfirm).toHaveBeenCalledWith(2.5, 60);
    expect(useAppStore.getState().animateDurationSecs).toBe(2.5);
    expect(useAppStore.getState().animateFps).toBe(60);
    expect(useAppStore.getState().animateDialogOpen).toBe(false);
  });

  it.each([
    ["duration above the ceiling", /duration/i, "500"],
    ["duration at zero", /duration/i, "0"],
    ["a non-numeric duration", /duration/i, ""],
    ["frame rate above the ceiling", /frame rate/i, "999"],
    ["frame rate at zero", /frame rate/i, "0"],
  ])("refuses to confirm with %s", (_label, field, value) => {
    const onConfirm = vi.fn();
    openDialog();
    render(<AnimateAsVideoModal onConfirm={onConfirm} />);

    fireEvent.change(fieldFor(field), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: /^animate$/i }));

    expect(onConfirm).not.toHaveBeenCalled();
    // Still open, so the mistake is correctable rather than silently dropped.
    expect(useAppStore.getState().animateDialogOpen).toBe(true);
  });

  it("cancels without converting or changing the remembered values", () => {
    const onConfirm = vi.fn();
    openDialog();
    render(<AnimateAsVideoModal onConfirm={onConfirm} />);

    fireEvent.change(fieldFor(/duration/i), { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(useAppStore.getState().animateDurationSecs).toBe(5);
    expect(useAppStore.getState().animateDialogOpen).toBe(false);
  });
});
