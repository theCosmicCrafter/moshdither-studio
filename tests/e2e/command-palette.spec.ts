import { test, expect } from "@playwright/test";
import { tauriMockScript } from "./mocks/tauri-mock";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(tauriMockScript);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("header, [data-testid='toolbar']", { timeout: 15000 });
  await page.locator("text=Discard").click({ timeout: 2000 }).catch(() => {});
  await page.locator("text=Skip").click({ timeout: 2000 }).catch(() => {});
  await page.locator("text=Get Started").click({ timeout: 2000 }).catch(() => {});
});

// Ctrl/Cmd+Shift+P toggles the palette (CommandPalette.tsx:46). It exposes
// proper ARIA -- role=dialog, role=listbox, role=option with aria-selected,
// and a role=status empty state -- so every assertion below can target real
// accessible structure rather than guessing at class names.
const OPEN = "Control+Shift+P";

// Scoped to the palette's own listbox: native <option> elements carry an
// implicit role="option", so an unscoped getByRole("option") also matches the
// Timeline's playback-speed <select> and resolves to 23 elements.
const options = (page: import("@playwright/test").Page) =>
  page.getByRole("listbox", { name: "Available commands" }).getByRole("option");

test("command palette opens with the keyboard shortcut and closes on Escape", async ({ page }) => {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeHidden();

  await page.keyboard.press(OPEN);
  await expect(dialog).toBeVisible();
  await expect(page.getByPlaceholder("Type a command...")).toBeFocused();
  await expect(options(page).first()).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("command palette search filters commands", async ({ page }) => {
  await page.keyboard.press(OPEN);
  const search = page.getByPlaceholder("Type a command...");
  await expect(search).toBeVisible();

  const opts = options(page);
  const unfiltered = await opts.count();
  expect(unfiltered).toBeGreaterThan(1);

  // The old version asserted `count >= 0`, which is true of every count that
  // has ever existed and so could not fail.
  // Commands are app actions (Timeline / Edit / View / Window), not effects --
  // an earlier draft filtered on "dither" and got zero hits for that reason.
  await search.fill("undo");
  await expect.poll(async () => opts.count()).toBeLessThan(unfiltered);
  expect(await opts.count()).toBeGreaterThan(0);
  for (const name of await opts.allTextContents()) {
    expect(name.toLowerCase()).toContain("undo");
  }

  await search.fill("zzznotacommand");
  await expect(opts).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("No commands found");

  await search.fill("");
  await expect.poll(async () => opts.count()).toBe(unfiltered);
});

test("command palette arrow keys move the selected option", async ({ page }) => {
  await page.keyboard.press(OPEN);
  const opts = options(page);
  await expect(opts.first()).toBeVisible();

  await expect(opts.nth(0)).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ArrowDown");
  await expect(opts.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(opts.nth(0)).toHaveAttribute("aria-selected", "false");

  await page.keyboard.press("ArrowDown");
  await expect(opts.nth(2)).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ArrowUp");
  await expect(opts.nth(1)).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});
