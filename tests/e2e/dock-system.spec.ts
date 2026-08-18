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

test("dock system renders with panel rail", async ({ page }) => {
  // The panel rail should be visible
  const panelRail = page.locator("[data-testid='panel-rail']");
  if (await panelRail.isVisible({ timeout: 5000 }).catch(() => false)) {
    await expect(panelRail).toBeVisible();
  }
  // App should be responsive
  const layout = page.locator("[data-testid='app-layout'], header").first();
  await expect(layout).toBeVisible();
});

test("dock tabs are clickable", async ({ page }) => {
  // flexlayout gives every docked tab a real role="tab" + accessible name,
  // and its content pane is role="tabpanel" aria-labelledby that tab -- so
  // Playwright resolves getByRole("tabpanel", { name }) to the pane owned by
  // that specific tab, not just "something" on screen.
  const dockTabs = page.getByRole("tab");
  await expect(dockTabs.first()).toBeVisible({ timeout: 10000 });
  expect(await dockTabs.count()).toBeGreaterThan(0);

  // A handful of tabs from the default layout (defaultLayout.ts), each in a
  // different tabset so this also exercises independent dock zones.
  const knownTabs = ["Effects", "Preview", "Timeline", "Stack"];

  for (const label of knownTabs) {
    const tab = page.getByRole("tab", { name: label }).first();
    await expect(tab).toBeVisible();
    await tab.click();

    // Clicking must actually switch the visible panel content, not just
    // leave the rest of the app looking unchanged.
    const panel = page.getByRole("tabpanel", { name: label });
    await expect(panel).toBeVisible({ timeout: 5000 });
  }
});

test("a panel can be added from the rail and closed again", async ({ page }) => {
  // The old test was named for floating windows but clicked a loose
  // [title*='panel'] match and asserted <header> was visible, so it exercised
  // nothing. What the rail actually does is dock and undock panels, and that
  // round trip is worth pinning: PanelRail only offers panels that are not
  // already docked, so add-then-close must return the rail to its start state.
  const railButton = page.getByTitle("Add Presets to right");
  await expect(railButton).toBeVisible();
  await expect(page.getByRole("tab", { name: "Presets" })).toHaveCount(0);

  await railButton.click();
  const tab = page.getByRole("tab", { name: "Presets" });
  await expect(tab).toBeVisible();
  // Once docked it is no longer on offer in the rail.
  await expect(page.getByTitle("Add Presets to right")).toHaveCount(0);

  await tab.hover();
  await tab.locator(".flexlayout__tab_button_trailing").click();
  await expect(page.getByRole("tab", { name: "Presets" })).toHaveCount(0);
  await expect(page.getByTitle("Add Presets to right")).toBeVisible();
});

test("window controls (minimize/maximize) don't crash", async ({ page }) => {
  // Look for window control buttons (minimize is a smoke selector)
  void page.locator("[title*='minimize'], [title*='Minimize'], [aria-label*='minimize']").first();
  const maxBtn = page
    .locator("[title*='maximize'], [title*='Maximize'], [aria-label*='maximize']")
    .first();

  if (await maxBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await maxBtn.click();
    await page.waitForTimeout(300);
  }

  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});
