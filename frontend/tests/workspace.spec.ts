import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("Workspace password").fill("e2e-private-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your financial overview" })).toBeVisible();
  await page.getByLabel("Reporting month").fill("2026-10");
}

async function navigate(page: Page, name: string) {
  await page.getByRole("navigation").getByRole("button", { name, exact: true }).click();
}

async function saveDialog(page: Page) {
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("uploads, deduplication, properties, loans, income, and budgets", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await login(page);
  await expect(page.locator(".property-card")).toHaveCount(4);
  await navigate(page, "Imports");
  const upload = page.getByLabel("Upload transaction file");
  await upload.setInputFiles(path.resolve("../fields.txt"));
  await expect(page.getByRole("heading", { name: "Review your import" })).toBeVisible();
  await expect(page.locator(".import-counts")).toContainText("5");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByRole("status")).toContainText("5 saved");

  await upload.setInputFiles(path.resolve("../fields.txt"));
  await expect(page.getByRole("heading", { name: "Review your import" })).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByRole("status")).toContainText("0 saved, 5 duplicates skipped");

  const incomeRows = [
    ["e2e-salary", "PAYROLL TEST", "", "5000", "AUD", "2026-10-12", "", "xxx-xxx xxxx9363", "Everyday Offset", "credit", "", "CommBank", "Employer", "income", "Salary", "", "", "TRUE"],
    ["e2e-rental", "RENT RECEIPT TEST", "", "2000", "AUD", "2026-10-12", "", "xxx-xxx xxxx9363", "Everyday Offset", "credit", "", "CommBank", "Agent", "income", "Rent", "", "", "TRUE"],
  ].map(row => row.join("\t")).join("\n");
  await upload.setInputFiles({ name: "income.tsv", mimeType: "text/tab-separated-values", buffer: Buffer.from(incomeRows) });
  await expect(page.getByRole("heading", { name: "Review your import" })).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByRole("status")).toContainText("2 saved");

  await navigate(page, "Properties & loans 4");
  await page.locator(".property-card").first().click();
  await page.getByLabel("Property name").fill("North house");
  await page.getByLabel("Address", { exact: true }).fill("Example property address");
  await saveDialog(page);
  await page.getByRole("button", { name: "Link a loan", exact: true }).click();
  await page.getByLabel("Loan name").fill("North home loan");
  await page.getByLabel("Loan account", { exact: true }).selectOption({ label: "ING / ING Australia Residential Mortgage / **** 2324" });
  await page.getByLabel("Outstanding balance").fill("600000.50");
  await page.getByLabel("Balance as of").fill("2026-10-12");
  await page.getByLabel("Annual interest rate (%)").fill("5.89");
  await saveDialog(page);
  await expect(page.getByRole("heading", { name: "North home loan" })).toBeVisible();

  await navigate(page, "Income");
  await page.getByRole("button", { name: "Add income source", exact: true }).click();
  await page.getByLabel("Source name").fill("Example employer");
  await page.getByLabel("Expected monthly amount").fill("5000");
  await saveDialog(page);
  await page.getByRole("button", { name: "Add income source", exact: true }).click();
  await page.getByLabel("Source name").fill("North house rent");
  await page.getByLabel("Income type").selectOption("rental");
  await page.getByLabel("Property (required)").selectOption({ label: "North house" });
  await saveDialog(page);

  await navigate(page, "Transactions");
  await page.getByRole("button", { name: "PAYROLL TEST", exact: true }).click();
  await page.getByLabel("Classification", { exact: true }).selectOption("salary");
  await page.getByLabel("Income source", { exact: true }).selectOption({ label: "Example employer" });
  await saveDialog(page);
  await page.getByRole("button", { name: "RENT RECEIPT TEST", exact: true }).click();
  await page.getByLabel("Classification", { exact: true }).selectOption("rental");
  await page.getByLabel("Income source", { exact: true }).selectOption({ label: "North house rent" });
  await saveDialog(page);
  await page.getByRole("button", { name: /DIRECT DEBIT I TALER/ }).click();
  await page.getByLabel("Classification", { exact: true }).selectOption("loan_repayment");
  await page.getByLabel("Property", { exact: true }).selectOption({ label: "North house" });
  await saveDialog(page);
  await page.getByLabel("Search transactions").fill("PAYROLL");
  await expect(page.locator(".transaction-table tbody tr")).toHaveCount(1);
  await page.getByLabel("Search transactions").fill("");

  await navigate(page, "Budgets");
  await page.getByRole("button", { name: "Set a budget", exact: true }).click();
  await page.getByLabel("Category", { exact: true }).fill("Takeaway & Snacks");
  await page.getByLabel("Monthly limit (AUD)").fill("100");
  await saveDialog(page);
  await expect(page.locator(".budget-row")).toContainText("$99.50");

  await navigate(page, "Overview");
  await expect(page.locator(".metric").filter({ hasText: "Income received" })).toContainText("$7,000.00");
  await expect(page.locator(".metric").filter({ hasText: "Recorded cash flow" })).toContainText("$2,864.17");
  await expect(page.locator(".property-card").first()).toContainText("$600,000.50");
  await page.screenshot({ path: testInfo.outputPath("overview-desktop.png"), fullPage: true });
  await page.reload();
  await expect(page.locator(".property-card").first()).toContainText("North house");
  await expect(page.locator(".metric").filter({ hasText: "Income received" })).toContainText("$7,000.00");
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page.screenshot({ path: testInfo.outputPath("overview-dark.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("mobile navigation and layout", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.locator(".property-card")).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("overview-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await navigate(page, "Income");
  await expect(page.getByRole("heading", { name: "Income", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
