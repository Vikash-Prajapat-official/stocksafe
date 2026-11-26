import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// The admin uploads the 2,000-row messy file on the Import screen and gets a clear report, not a crash.
const expected = JSON.parse(readFileSync("tests/fixtures/messy-items.expected.json", "utf8")) as { totalRows: number; valid: number; blank: number; errors: Record<string, string[]> };
const problems = Object.keys(expected.errors).length;

test("the admin checks a messy 2,000-row file and sees a row-by-row report", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/items/import");
  await page.getByLabel("CSV or Excel file").setInputFiles("tests/fixtures/messy-items.csv");
  await page.getByRole("button", { name: "Check file" }).click();

  const summary = page.getByText(/Check only:/);
  await expect(summary).toContainText(`${expected.valid} of ${expected.totalRows} rows are ready to import`);
  await expect(summary).toContainText(`${expected.blank} blank row(s) skipped`);
  await expect(summary).toContainText(`${problems} problem(s)`);

  // the report lists the row number, the column and the problem
  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader", { name: "Row" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Column" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Problem" })).toBeVisible();
  const firstBadRow = Object.keys(expected.errors).map(Number).sort((a, b) => a - b)[0]!;
  await expect(table.getByRole("row").nth(1)).toContainText(String(firstBadRow));

  // checking imported nothing
  await page.goto("/items?q=Paracetamol");
  await expect(page.getByText(/Paracetamol \d+ /)).toHaveCount(0);
});
