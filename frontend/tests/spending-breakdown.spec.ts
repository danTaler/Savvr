import { expect, test } from "@playwright/test";

test("Sankey shows categories and changes month independently", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/dashboard?**", async route => {
    const response = await route.fetch();
    const report = await response.json();
    const month = new URL(route.request().url()).searchParams.get("month");
    report.spending_breakdown = month === "2026-09" ? {
      income_categories: [], expense_categories: [{ name: "Groceries", amount: "120" }],
      earning: "0", spending: "120", difference: "-120", savings_rate: null,
    } : month === "2026-08" ? {
      income_categories: [{ name: "Salary", amount: "100" }],
      expense_categories: [{ name: "Groceries", amount: "150" }],
      earning: "100", spending: "150", difference: "-50", savings_rate: "-50.0",
    } : month === "2026-07" ? {
      income_categories: [{ name: "Salary", amount: "100" }], expense_categories: [],
      earning: "100", spending: "0", difference: "100", savings_rate: "100.0",
    } : month === "2026-06" ? {
      income_categories: [], expense_categories: [],
      earning: "0", spending: "0", difference: "0", savings_rate: null,
    } : {
      income_categories: [{ name: "Salary", amount: "4000" }, { name: "Rent", amount: "2000" }],
      expense_categories: [{ name: "Groceries", amount: "500" }, { name: "Property loan repayments", amount: "1500" }],
      earning: "6000", spending: "2000", difference: "4000", savings_rate: "66.7", provisional_income_count: 2,
    };
    await route.fulfill({ response, json: report });
  });
  await page.goto("/");
  await page.getByLabel("Workspace password").fill("e2e-private-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Reporting month").fill("2026-10");
  const section = page.getByRole("region", { name: "Spending breakdown" });
  await expect(section.getByRole("img", { name: /Income and spending by category/ })).toBeVisible();
  await expect(section.locator("dl")).toContainText("$6,000.00");
  await expect(section.locator("dl")).toContainText("66.7%");
  await expect(section.locator(".sankey-label").filter({ hasText: "Salary" })).toBeVisible();
  await expect(section.getByRole("status")).toContainText("Includes 2 income transactions");
  await expect(section.locator("text.sankey-label").filter({ hasText: /^Income$/ })).toBeVisible();
  await expect(section.locator("text.sankey-label").filter({ hasText: /^Expenses$/ })).toBeVisible();
  await expect(section.locator(".sankey-label").filter({ hasText: "Unspent income" })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("sankey-desktop.png"), fullPage: true });
  await section.getByLabel("Month", { exact: true }).fill("2026-09");
  await expect(section.locator("dl")).toContainText("N/A");
  await expect(section.locator("dl")).toContainText("-$120.00");
  await expect(section.locator(".sankey-label").filter({ hasText: "Cash-flow shortfall" })).toHaveCount(0);
  await expect(section.locator(".sankey-label").filter({ hasText: "Groceries" })).toBeVisible();
  await expect(page.getByLabel("Reporting month")).toHaveValue("2026-10");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("sankey-mobile.png"), fullPage: true });
  await section.getByLabel("Month", { exact: true }).fill("2026-08");
  await expect(section.locator("dl")).toContainText("-50.0%");
  await expect(section.locator(".sankey-label").filter({ hasText: "Salary" })).toBeVisible();
  await expect(section.locator(".sankey-label").filter({ hasText: "Cash-flow shortfall" })).toHaveCount(0);
  await section.getByLabel("Month", { exact: true }).fill("2026-07");
  await expect(section.locator("dl")).toContainText("100.0%");
  await expect(section.locator(".sankey-label").filter({ hasText: "Groceries" })).toHaveCount(0);
  await section.getByLabel("Month", { exact: true }).fill("2026-06");
  await expect(section.getByText("No cash flow for this month")).toBeVisible();
  expect(errors).toEqual([]);
});
