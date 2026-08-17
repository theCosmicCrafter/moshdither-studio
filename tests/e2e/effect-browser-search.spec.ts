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

test("effect browser search filters results", async ({ page }) => {
  // Click on a category first
  const ditheringTab = page.locator("text=Dither").first();
  await ditheringTab.click();
  await page.waitForTimeout(500);

  const searchInput = page.getByPlaceholder("Search effects...");
  await expect(searchInput).toBeVisible();

  // Every effect row is labelled with its parameter count, which gives a
  // stable way to count what the filter is actually showing. The old version
  // typed into a maybe-present input and then asserted the header was visible,
  // so it held even if the filter did nothing at all.
  const effectRows = page.getByRole("button", { name: /parameters?/ });
  const unfiltered = await effectRows.count();
  expect(unfiltered).toBeGreaterThan(10);

  await searchInput.fill("bayer");
  await expect(page.getByRole("button", { name: /Bayer Dither/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Atkinson/ })).toHaveCount(0);
  expect(await effectRows.count()).toBeLessThan(unfiltered);

  await searchInput.fill("zzznonexistent");
  await expect(effectRows).toHaveCount(0);

  await searchInput.fill("");
  await expect.poll(async () => effectRows.count()).toBe(unfiltered);
});

test("category accordions collapse and re-expand their effects", async ({ page }) => {
  // These are accordions, not tabs -- the old test's name and its
  // `text=Dither` click both assumed a tab strip that does not exist.
  const dither = page.locator("button[aria-expanded]").filter({ hasText: "Dither" }).first();
  await expect(dither).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /Bayer Dither/ })).toBeVisible();

  await dither.click();
  await expect(dither).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: /Bayer Dither/ })).toHaveCount(0);

  await dither.click();
  await expect(dither).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /Bayer Dither/ })).toBeVisible();
});

test("every category accordion reports a non-zero effect count", async ({ page }) => {
  // Replaces "effect browser shows effect details", which clicked a
  // `text=Bayer, text=Floyd` selector (not valid Playwright comma-OR for text
  // engines) inside a visibility guard and asserted nothing about the effects.
  for (const category of ["Dither", "Analog", "Color", "Pixel", "Glitch", "Noise"]) {
    const header = page.locator("button[aria-expanded]").filter({ hasText: category }).first();
    await expect(header).toBeVisible();
    const label = (await header.textContent()) ?? "";
    const count = Number(label.match(/(\d+)/)?.[1] ?? 0);
    expect(count, `${category} should list at least one effect`).toBeGreaterThan(0);
  }
});
