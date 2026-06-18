import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  removeBackground,
  listBackgroundRemovalModels,
  downloadModel,
  isModelDownloading,
  unloadAllModels,
} from "../backgroundRemoval";
import { installMockIpc, uninstallMockIpc } from "../../test/ipcMock";

describe("backgroundRemoval", () => {
  beforeEach(() => {
    installMockIpc();
  });

  afterEach(() => {
    uninstallMockIpc();
  });

  it("removeBackground throws when IPC returns failure", async () => {
    const mockIpc = installMockIpc();
    mockIpc.invoke.mockResolvedValue({
      ok: false,
      error: "Python backend not available",
    });

    await expect(
      removeBackground("media://test.jpg", { model: "birefnet-lite" }),
    ).rejects.toThrow("Python backend not available");
  });

  it("removeBackground returns mask data on success", async () => {
    const mockIpc = installMockIpc();
    mockIpc.invoke.mockResolvedValue({
      ok: true,
      maskBase64: "iVBORw0KGgo=",
      width: 256,
      height: 256,
    });

    const result = await removeBackground("media://test.jpg", {
      model: "birefnet-lite",
      alphaMatting: true,
    });

    expect(result.maskBase64).toBe("iVBORw0KGgo=");
    expect(result.width).toBe(256);
    expect(result.height).toBe(256);
    expect(mockIpc.invoke).toHaveBeenCalledWith(
      "sam3:remove-background",
      expect.objectContaining({
        imagePath: "media://test.jpg",
        model: "birefnet-lite",
        alphaMatting: true,
      }),
    );
  });

  it("listBackgroundRemovalModels returns models from IPC", async () => {
    const mockIpc = installMockIpc();
    mockIpc.invoke.mockResolvedValue({
      background_removal: {
        "birefnet-lite": true,
        birefnet: false,
      },
    });

    const models = await listBackgroundRemovalModels();
    expect(models).toEqual({
      "birefnet-lite": true,
      birefnet: false,
    });
  });

  it("downloadModel invokes IPC and calls progress callback", async () => {
    const mockIpc = installMockIpc();
    mockIpc.invoke.mockResolvedValue({ ok: true });

    const onProgress = () => {
      /* no-op for test */
    };
    await downloadModel("birefnet-lite", onProgress);

    expect(mockIpc.invoke).toHaveBeenCalledWith("sam3:download-model", {
      model: "birefnet-lite",
    });
  });

  it("downloadModel throws on IPC failure", async () => {
    const mockIpc = installMockIpc();
    mockIpc.invoke.mockResolvedValue({
      ok: false,
      error: "Network error",
    });

    await expect(downloadModel("birefnet-lite")).rejects.toThrow(
      "Network error",
    );
  });

  it("isModelDownloading returns false when IPC unavailable", async () => {
    uninstallMockIpc();
    const result = await isModelDownloading("birefnet-lite");
    expect(result).toBe(false);
  });

  it("isModelDownloading returns status from IPC", async () => {
    const mockIpc = installMockIpc();
    mockIpc.invoke.mockResolvedValue({
      active_downloads: ["birefnet-lite"],
    });

    const result = await isModelDownloading("birefnet-lite");
    expect(result).toBe(true);
  });

  it("unloadAllModels invokes IPC without error", async () => {
    const mockIpc = installMockIpc();
    mockIpc.invoke.mockResolvedValue(undefined);

    await expect(unloadAllModels()).resolves.toBeUndefined();
    expect(mockIpc.invoke).toHaveBeenCalledWith("sam3:unload-model");
  });

  it("throws when IPC is not available", async () => {
    uninstallMockIpc();
    await expect(removeBackground("test.jpg")).rejects.toThrow(
      "IPC not available",
    );
    await expect(listBackgroundRemovalModels()).rejects.toThrow(
      "IPC not available",
    );
    await expect(downloadModel("x")).rejects.toThrow("IPC not available");
    await expect(unloadAllModels()).rejects.toThrow("IPC not available");
  });
});
