import { test, expect, type Locator, type Page } from "@playwright/test";
import { startFreshSessionWithoutTour } from "./helpers";

async function pickOption(page: Page, selectLabel: string, option: string) {
  await page.getByRole("combobox", { name: selectLabel }).click();
  await page.getByRole("option", { name: new RegExp(`^${option}\\b`) }).click();
}

async function upload(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }, name: string) {
  await page.goto("/");
  if ((await page.getByTestId("file-upload-input").count()) === 0) {
    await page.getByTestId("sidebar-nav-upload").click();
  }
  await page.getByTestId("file-upload-input").setInputFiles(file);
  await page.getByText(name).first().waitFor();
  await expect(page.getByTestId("sidebar-nav-charts")).toBeVisible();
  // uploadDataset switches to Overview after a short delay; navigate once it has.
  await page.waitForTimeout(1500);
  await page.getByTestId("sidebar-nav-charts").click();
}

const X_TICKS = "g[transform^='translate(0,'] > .tick text";

/** Screen boxes of the tick labels a reader can see (thinned ones are display:none). */
async function visibleTickBoxes(svg: Locator) {
  return svg.evaluate((el, selector) =>
    // X axis only: the one axis group moved to the bottom of the plot.
    Array.from(el.querySelectorAll(selector))
      .filter((t) => t.getAttribute("display") !== "none")
      .map((t) => {
        const r = t.getBoundingClientRect();
        // The label's own text, without a <title> child's full text.
        return { text: t.firstChild?.textContent || "", left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      })
      .filter((r) => r.right > r.left),
    X_TICKS
  );
}

function overlaps(boxes: Awaited<ReturnType<typeof visibleTickBoxes>>) {
  const hits: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) hits.push(`${a.text} × ${b.text}`);
    }
  }
  return hits;
}

test.beforeEach(async ({ page }) => {
  await startFreshSessionWithoutTour(page);
});

test("date X axis bucketed by year: Count of a year column per year, labelled with the bucket", async ({ page }) => {
  await upload(page, "tests/fixtures/messy/netflix.csv", "netflix");
  await page.getByLabel("Chart Title").fill("Titles added per year");
  await pickOption(page, "X axis column", "date_added");
  await pickOption(page, "Y axis column", "release_year");
  // release_year is year-like, so the aggregation starts as Count, with no warning.
  await expect(page.getByRole("combobox", { name: "Aggregation" })).toHaveText("Count");
  await expect(page.getByTestId("aggregation-note")).toHaveCount(0);
  await pickOption(page, "Group dates by", "Year");
  await page.getByRole("button", { name: "Create Chart" }).click();

  const svg = page.getByTestId("chart-card").locator("svg[role='img']");
  await expect(svg.locator("rect.bar").first()).toBeVisible();
  await expect(svg.locator("text", { hasText: /^date_added \(Year\)$/ })).toHaveCount(1);
  await expect(svg.locator("text", { hasText: /^Count of release_year$/ })).toHaveCount(1);
  // tests/fixtures/messy/messy.golden.json dateStats.date_added.yearCounts; 2008 = the full
  // file's only two 2008 rows (s5958, s6612).
  const ticks = await svg.locator(".tick text").allTextContents();
  expect(ticks.filter((t) => /^\d{4}$/.test(t))).toEqual(["2008", "2014", "2016", "2017", "2018", "2019", "2020", "2021"]);
  const titles = await svg.locator("rect.bar title").allTextContents();
  expect(titles.find((t) => t.startsWith("date_added (Year): 2008\n"))).toContain("Count of release_year: 2");
  expect(titles.find((t) => t.startsWith("date_added (Year): 2014\n"))).toContain("Count of release_year: 1");
  expect(titles.find((t) => t.startsWith("date_added (Year): 2021\n"))).toContain("Count of release_year: 26");
  // A year column's count gets no outlier badge.
  await expect(page.getByTestId("chart-card").getByText(/Outliers?$/)).toHaveCount(0);
});

test("choosing Sum on a year column shows the note, and doesn't block creating the chart", async ({ page }) => {
  await upload(page, "tests/fixtures/messy/netflix.csv", "netflix");
  await page.getByLabel("Chart Title").fill("Sum of years");
  await pickOption(page, "X axis column", "type");
  await pickOption(page, "Y axis column", "release_year");
  await pickOption(page, "Aggregation", "Sum");
  await expect(page.getByTestId("aggregation-note")).toHaveText(
    "Adding up years is rarely meaningful — try Count, or use it as a date"
  );
  await page.getByRole("button", { name: "Create Chart" }).click();
  await expect(page.getByTestId("chart-card").locator("svg text", { hasText: /^Sum of release_year$/ })).toHaveCount(1);
});

test("many categories: tick labels never overlap (inline, expanded, dark mode), with a Top 20 hint", async ({ page }) => {
  const rows = Array.from({ length: 300 }, (_, i) => `Product category number ${String(i).padStart(3, "0")},${(i % 17) + 1}`);
  const csv = ["Category,Amount", ...rows].join("\n");
  await upload(page, { name: "many.csv", mimeType: "text/csv", buffer: Buffer.from(csv) }, "many");
  await page.evaluate(() => document.documentElement.classList.add("dark"));

  await page.getByLabel("Chart Title").fill("Amount by category");
  await pickOption(page, "X axis column", "Category");
  await pickOption(page, "Y axis column", "Amount");
  await page.getByRole("button", { name: "Create Chart" }).click();

  const card = page.getByTestId("chart-card");
  const hint = card.getByTestId("chart-density-hint");
  await expect(hint).toContainText("300 bars is too many to read.");

  for (const root of [card, page.getByTestId("chart-expand-dialog")]) {
    if (root !== card) await card.getByTestId("chart-expand-button").click();
    const svg = root.locator("svg[role='img']");
    await expect(svg.locator("rect.bar").first()).toBeVisible();
    const boxes = await visibleTickBoxes(svg);
    expect(boxes.length).toBeGreaterThan(1);
    expect(boxes.length).toBeLessThan(300);
    expect(overlaps(boxes)).toEqual([]);
    // Long labels are cut; the full text is in the label's <title>.
    expect(boxes[0].text.startsWith("Product categor…")).toBe(true);
    await expect(svg.locator(".tick text title").first()).toHaveText("Product category number 000");
    // Dark mode: muted label colour, not the body's near-white text.
    const fill = await svg.locator(".tick text").first().evaluate((t) => getComputedStyle(t).fill);
    expect(fill).not.toBe("rgb(244, 244, 245)");
    expect(fill).not.toBe("rgb(255, 255, 255)");
  }
  await page.keyboard.press("Escape");

  await hint.getByRole("button", { name: "Show Top 20 + Other" }).click();
  const svg = card.locator("svg[role='img']");
  await expect(svg.locator("rect.bar")).toHaveCount(21);
  await expect(svg.locator(X_TICKS).last()).toHaveText("Other");
  await expect(hint).toContainText("Top 20 + Other");
  expect(overlaps(await visibleTickBoxes(svg))).toEqual([]);
});
