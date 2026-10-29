import { test, expect, devices, type Locator, type Page } from "@playwright/test";
import { startFreshSessionWithoutTour, loadSampleData } from "./helpers";

/**
 * Icon-only controls (wrapped in Hint) must accept pointer input over at least 24x24px
 * (WCAG 2.5.8), 44x44px on touch screens, without growing the visible control. The extra
 * area is an invisible ::before (src/index.css `.hit-area`), which getBoundingClientRect /
 * Playwright's boundingBox() don't include — so the target box is measured as the element
 * box united with its ::before box, and verified by hit-testing that box's corners.
 */
async function measureTarget(control: Locator) {
  return control.evaluate((el: Element) => {
    const rect = el.getBoundingClientRect();
    const before = getComputedStyle(el, "::before");
    const pseudoW = before.content === "none" ? 0 : parseFloat(before.width) || 0;
    const pseudoH = before.content === "none" ? 0 : parseFloat(before.height) || 0;
    const width = Math.max(rect.width, pseudoW);
    const height = Math.max(rect.height, pseudoH);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // 1px inside each edge of the target box, every corner must land on the control.
    const corners = [
      [cx - width / 2 + 1, cy - height / 2 + 1],
      [cx + width / 2 - 1, cy - height / 2 + 1],
      [cx - width / 2 + 1, cy + height / 2 - 1],
      [cx + width / 2 - 1, cy + height / 2 - 1],
    ];
    const cornersHit = corners.every(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === el || el.contains(hit));
    });
    return { visibleWidth: rect.width, visibleHeight: rect.height, width, height, cornersHit };
  });
}

async function expectTargetAtLeast(control: Locator, min: number) {
  await control.scrollIntoViewIfNeeded();
  const t = await measureTarget(control);
  expect(t.width, "target width").toBeGreaterThanOrEqual(min);
  expect(t.height, "target height").toBeGreaterThanOrEqual(min);
  expect(t.cornersHit, `corners of the ${t.width}x${t.height} target hit the control`).toBe(true);
  return t;
}

async function pickOption(page: Page, selectLabel: string, option: string) {
  await page.getByRole("combobox", { name: selectLabel }).click();
  await page.getByRole("option", { name: new RegExp(`^${option}\\b`) }).click();
}

async function openPivotWithTwoRowDimensions(page: Page) {
  await page.getByTestId("sidebar-nav-pivot").click();
  // The sample data's default pivot already has Product as a row; add Category below it.
  await expect(page.getByRole("button", { name: "Move Product up" })).toBeVisible();
  await page
    .locator("div")
    .filter({ has: page.getByTitle("Category", { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Row", exact: true }) })
    .last()
    .getByRole("button", { name: "Row", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Move Category up" })).toBeVisible();
}

async function addDrillDepth(page: Page) {
  await page.getByTestId("sidebar-nav-charts").click();
  await pickOption(page, "X axis column", "Product");
  await page.getByRole("combobox").filter({ hasText: "+ Add drill depth" }).click();
  await page.getByRole("option", { name: "Category", exact: true }).click();
}

test.describe("Icon control hit areas (fine pointer)", () => {
  test.beforeEach(async ({ page }) => {
    await startFreshSessionWithoutTour(page);
    await page.goto("/");
    await loadSampleData(page);
  });

  test("drill-path remove is at least 24x24 and still visually small", async ({ page }) => {
    await addDrillDepth(page);
    const remove = page.getByRole("button", { name: "Remove Category from the drill-down path" });
    const t = await expectTargetAtLeast(remove, 24);
    expect(t.visibleWidth).toBeLessThan(24); // the visible control did not grow
    await remove.click({ position: { x: t.visibleWidth / 2, y: -5 } }); // edge of the target, outside the visible button
    await expect(remove).toHaveCount(0);
  });

  test("pivot move up / down / remove are at least 24x24 each", async ({ page }) => {
    await openPivotWithTwoRowDimensions(page);
    for (const name of ["Move Product up", "Move Product down", "Remove Product from rows", "Move Category up"]) {
      await expectTargetAtLeast(page.getByRole("button", { name }), 24);
    }
  });
});

test.describe("Disabled icon controls explain themselves", () => {
  test.beforeEach(async ({ page }) => {
    await startFreshSessionWithoutTour(page);
    await page.goto("/");
    await loadSampleData(page);
  });

  test("Undo with empty history shows why it is unavailable, and does nothing", async ({ page }) => {
    const undo = page.getByRole("button", { name: "Undo last change" });
    await expect(undo).toHaveAttribute("aria-disabled", "true");
    await undo.hover();
    await expect(page.getByRole("tooltip")).toContainText("Undo last change — nothing to undo yet");
    // force: Playwright treats aria-disabled as not actionable; the point is that a real
    // click reaches the button and is swallowed.
    await undo.click({ force: true });
    await expect(undo).toHaveAttribute("aria-disabled", "true");

    // Keyboard users reach it too. The click left the button focused, so focus() alone
    // would fire no focus event and only the closing hover tooltip could satisfy the
    // check (it failed whenever that one closed first). Blur, wait for no tooltip, refocus.
    await page.mouse.move(0, 0);
    await undo.blur();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await undo.focus();
    await expect(page.getByRole("tooltip")).toContainText("nothing to undo yet");
  });

  test("first pivot row cannot move up; the tooltip says so and the order is unchanged", async ({ page }) => {
    await openPivotWithTwoRowDimensions(page);
    const up = page.getByRole("button", { name: "Move Product up" });
    await expect(up).toHaveAttribute("aria-disabled", "true");
    await up.hover();
    await expect(page.getByRole("tooltip")).toContainText("Move Product up — already first");
    await up.click({ force: true });
    await expect(page.getByRole("button", { name: "Move Product up" })).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("button", { name: "Move Category up" })).not.toHaveAttribute("aria-disabled", "true");
  });
});

test.describe("Icon control hit areas (coarse pointer)", () => {
  // Pixel 7 viewport/touch/mobile flags, minus defaultBrowserType (not allowed per-group).
  const { defaultBrowserType: _browser, ...pixel7 } = devices["Pixel 7"];
  test.use(pixel7);

  test("pivot controls get 44x44 targets that do not overlap their neighbours", async ({ page }) => {
    await startFreshSessionWithoutTour(page);
    await page.goto("/");
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await loadSampleData(page);
    await page.getByTestId("mobile-menu-toggle").click();
    await openPivotWithTwoRowDimensions(page);
    // Every corner of each 44px target hits its own control, so neighbours don't overlap.
    for (const name of ["Move Product up", "Move Product down", "Remove Product from rows"]) {
      await expectTargetAtLeast(page.getByRole("button", { name }), 44);
    }
  });
});
