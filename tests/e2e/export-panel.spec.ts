import { expect, test } from "@playwright/test";
import { tauriMockScript } from "./mocks/tauri-mock";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(tauriMockScript);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("header, [data-testid='toolbar']", { timeout: 15000 });
  await page
    .locator("text=Discard")
    .click({ timeout: 2000 })
    .catch(() => {});
  await page
    .locator("text=Skip")
    .click({ timeout: 2000 })
    .catch(() => {});
  await page
    .locator("text=Get Started")
    .click({ timeout: 2000 })
    .catch(() => {});
});

// The Export panel shares the right-hand tabset with Mask/Audio/LUTs and Mask
// is active on load, so flexlayout has not mounted Export's contents yet.
// Every test here opens the tab first -- the versions these replaced skipped
// that step, found nothing, and fell back to asserting the header was visible.
async function openExportPanel(page: import("@playwright/test").Page) {
  await page.getByRole("tab", { name: "Export" }).click();
  const panel = page.locator(".flexlayout__tab").filter({ hasText: "Format" });
  await expect(panel.getByRole("button", { name: "MP4", exact: true })).toBeVisible();
  return panel;
}

test("export panel renders its format and quality controls", async ({ page }) => {
  const panel = await openExportPanel(page);

  for (const format of ["MP4", "WEBM", "GIF", "PNG-SEQ"]) {
    await expect(panel.getByRole("button", { name: format, exact: true })).toBeVisible();
  }
  for (const quality of ["draft", "good", "best"]) {
    await expect(panel.getByRole("button", { name: quality, exact: true })).toBeVisible();
  }
  await expect(panel.getByLabel("FPS")).toBeVisible();
});

test("export button warns instead of exporting when no media is loaded", async ({ page }) => {
  const panel = await openExportPanel(page);

  // ExportPanel short-circuits with this exact status before touching the
  // backend (index.tsx: setStatusMessage("Load media before exporting")).
  await panel.getByRole("button", { name: /Export Video/ }).click();
  await expect(page.getByText("Load media before exporting")).toBeVisible();
});

test("export panel shows the resolution presets", async ({ page }) => {
  const panel = await openExportPanel(page);

  // Buttons are labelled by their friendly name; the pixel dimensions live in
  // the title attribute, so both are worth pinning.
  for (const res of ["Source", "4K UHD", "1080p HD", "720p", "480p"]) {
    await expect(panel.getByRole("button", { name: res, exact: true })).toBeVisible();
  }
  await expect(panel.getByTitle("3840x2160")).toBeVisible();
  await expect(panel.getByTitle("1920x1080")).toBeVisible();
});

test("selecting a format marks it as the active choice", async ({ page }) => {
  const panel = await openExportPanel(page);

  // Format is a button group, not a <select> -- the old test grabbed the page's
  // first <select>, which is the Timeline's playback-speed dropdown, so it
  // exercised the wrong control entirely.
  //
  // Selection state is carried only in an inline style (accent background), so
  // that is what we assert. These are toggle buttons with no aria-pressed, so
  // there is no accessible state to check instead.
  const mp4 = panel.getByRole("button", { name: "MP4", exact: true });
  const webm = panel.getByRole("button", { name: "WEBM", exact: true });

  const mp4Selected = (await mp4.getAttribute("style")) ?? "";
  expect(mp4Selected).toContain("background");

  await webm.click();
  await expect.poll(async () => (await webm.getAttribute("style")) ?? "").toContain("background");
  expect((await mp4.getAttribute("style")) ?? "").not.toBe(mp4Selected);
});
