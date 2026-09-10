/**
 * Tests for Sam3Setup: the first-run panel that installs the ~6 GB SAM3 add-on.
 *
 * The licence gate is the part worth pinning. The SAM License is accepted by
 * use, so the download must not start until the user has ticked the box — a
 * regression there would put Meta's weights on someone's disk without ever
 * showing them the terms.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import Sam3Setup from "../Sam3Setup";
import type { Sam3AddonStatus } from "../../lib/tauri";

const listeners: Array<(e: { payload: unknown }) => void> = [];

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((_name: string, cb: (e: { payload: unknown }) => void) => {
    listeners.push(cb);
    return Promise.resolve(() => {});
  }),
}));

const notInstalled: Sam3AddonStatus = {
  ready: false,
  sidecar_installed: false,
  sidecar_path: null,
  sidecar_bytes: null,
  checkpoint_installed: false,
  checkpoint_path: null,
  checkpoint_bytes: null,
  dev_override: null,
};

const sam3AddonStatus = vi.fn(() => Promise.resolve(notInstalled));
const sam3AddonInstall = vi.fn(() =>
  Promise.resolve({ ...notInstalled, ready: true, sidecar_installed: true })
);

vi.mock("../../lib/tauri", () => ({
  sam3AddonStatus: (...a: unknown[]) => sam3AddonStatus(...(a as [])),
  sam3AddonInstall: (...a: unknown[]) => sam3AddonInstall(...(a as [])),
}));

describe("Sam3Setup", () => {
  beforeEach(() => {
    listeners.length = 0;
    sam3AddonStatus.mockClear();
    sam3AddonInstall.mockClear();
    sam3AddonStatus.mockResolvedValue(notInstalled);
  });
  afterEach(cleanup);

  it("will not download until the SAM License is accepted", async () => {
    render(<Sam3Setup />);
    const button = await screen.findByRole("button", {
      name: /download and install sam3/i,
    });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(sam3AddonInstall).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(button).toBeEnabled();
  });

  it("names the licence and its substantive restrictions before downloading", async () => {
    render(<Sam3Setup />);
    // Not decoration: a user has to be able to see WHAT they are agreeing to,
    // not just that there is an agreement.
    expect(await screen.findByText(/SAM License/i)).toBeInTheDocument();
    expect(screen.getByText(/military, weapons, nuclear and espionage/i)).toBeInTheDocument();
  });

  it("installs once accepted and reports readiness upward", async () => {
    const onReady = vi.fn();
    render(<Sam3Setup onReady={onReady} />);
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /download and install sam3/i }));

    await waitFor(() => expect(sam3AddonInstall).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
  });

  it("surfaces a failure instead of leaving the button spinning", async () => {
    sam3AddonInstall.mockRejectedValueOnce(new Error("asset list unreachable"));
    render(<Sam3Setup />);
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /download and install sam3/i }));

    expect(await screen.findByText(/asset list unreachable/i)).toBeInTheDocument();
    // Back to an actionable state, so a transient network failure is retryable.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /download and install sam3/i })
      ).toBeEnabled()
    );
  });

  it("does not offer a 6 GB download to a developer who already has an interpreter", async () => {
    sam3AddonStatus.mockResolvedValue({
      ...notInstalled,
      dev_override: "C:\\dev\\sam3_env\\Scripts\\python.exe",
    });
    render(<Sam3Setup />);
    expect(await screen.findByText(/MOSHDITHER_SAM3_PYTHON/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /download and install sam3/i })
    ).not.toBeInTheDocument();
  });
});
