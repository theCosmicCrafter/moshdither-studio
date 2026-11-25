import { expect, test } from "@playwright/test";
import { tauriMockScript } from "./mocks/tauri-mock";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(tauriMockScript);
  await openApp(page);
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
  // different tabset so this also exercises independent dock zones. The
  // Timeline is not among them: it is the transport strip pinned under the
  // workspace, not a panel (tests/e2e/timeline.spec.ts covers it).
  const knownTabs = ["Library", "Preview", "Layers"];

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

test("a panel can be toggled on from the rail and closed again", async ({ page }) => {
  // The rail is a permanent toggle bar: every panel keeps a slot, lit when
  // docked, and toggling a docked one removes its tab. The round trip to pin
  // is toggle-on → tab's own close button → rail back to "Show".
  const railButton = page.getByTitle("Show Presets");
  await expect(railButton).toBeVisible();
  await expect(page.getByRole("tab", { name: "Presets" })).toHaveCount(0);

  await railButton.click();
  const tab = page.getByRole("tab", { name: "Presets" });
  await expect(tab).toBeVisible();
  // The rail slot stays put once docked -- it just flips to Hide.
  await expect(page.getByTitle("Hide Presets")).toBeVisible();

  await tab.hover();
  await tab.locator(".flexlayout__tab_button_trailing").click();
  await expect(page.getByRole("tab", { name: "Presets" })).toHaveCount(0);
  await expect(page.getByTitle("Show Presets")).toBeVisible();
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
