import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Load the app shell and clear the overlays that would otherwise sit in
 * front of whatever a test is about to click: onboarding ("Get Started" /
 * "Skip") and unsaved-changes ("Discard"). Each dismissal is best-effort --
 * a spec that never triggers the modal must not fail for its absence.
 *
 * `readySelector` waits for the element that proves the shell rendered.
 * The default matches the toolbar used by almost every spec; pages that
 * key off a different shell element can pass their own.
 */
export async function openApp(
  page: Page,
  readySelector = "header, [data-testid='toolbar']"
): Promise<void> {
  // The first spec to run pays Vite's cold module compile inside its own
  // timeout -- the dev server answers the URL probe long before the full
  // import graph resolves, so a 30s first navigation is a normal cold start,
  // not a broken app.
  test.setTimeout(60000);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(readySelector, { timeout: 15000 });
  await dismissModalOverlays(page);
}

/** Click through the app's known modal-dismiss buttons, best-effort. */
export async function dismissModalOverlays(page: Page): Promise<void> {
  for (const label of ["Discard", "Skip", "Get Started"]) {
    await page
      .locator(`text=${label}`)
      .click({ timeout: 2000 })
      .catch(() => {});
  }
}

/**
 * Open the Presets docked panel and return it. Presets is not in the default
 * layout -- it is added from the panel rail, whose buttons are labelled
 * "Add {panel} to {zone}" from PANEL_REGISTRY.
 */
export async function openPresetPanel(page: Page): Promise<Locator> {
  const existing = page.getByRole("tab", { name: "Presets" });
  if (!(await existing.count())) {
    await page.getByTitle("Add Presets to right").click();
  }
  await page.getByRole("tab", { name: "Presets" }).click();
  const panel = page.locator(".flexlayout__tab").filter({ has: page.getByLabel("Preset name") });
  await expect(panel.getByLabel("Preset name")).toBeVisible();
  return panel;
}
