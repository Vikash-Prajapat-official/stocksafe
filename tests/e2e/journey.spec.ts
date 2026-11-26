import { expect, test } from "@playwright/test";
import { inDays, login, logout, pickItem, prisma } from "./helpers";

// SPEC section 10: "End to end: GRN, indent, issue, dispense, expiry alert, write-off, ledger matches."
// One story, told in order, by the people who do each step. The test item is brand new, so every number is known:
//   received 100 (far batch) + 50 (near batch, 20 days) = 150
//   indent: 30 to the ward (FEFO takes them from the near batch)
//   transfer: 40 to the pharmacy (20 near + 20 far)
//   dispense: 5 (near batch first)
//   write-off: the near batch once it has expired (15 in the pharmacy, 30 in the ward)
const NAME = `ZZ E2E Tonic ${Date.now().toString(36)}`;
const NEAR = "E2E-NEAR";
const FAR = "E2E-FAR";

test.describe.configure({ mode: "serial" });

test("1. admin adds the item with reorder levels", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/items/new");
  await page.getByLabel("Name", { exact: true }).fill(NAME);
  await page.getByLabel("Form").selectOption("SYRUP");
  await page.getByLabel("Unit").fill("bottle");
  await page.getByLabel("Minimum").fill("10");
  await page.getByLabel("Reorder level").fill("40");
  await page.getByLabel("Maximum").fill("200");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page).toHaveURL(/\/items$/);
  await page.getByLabel("Search items").fill(NAME);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("link", { name: NAME })).toBeVisible();
});

test("2. store keeper receives two batches (GRN)", async ({ page }) => {
  await login(page, "keeper");
  await page.goto("/grn");
  await page.getByLabel("Invoice number").fill("E2E-INV-1");
  await pickItem(page, NAME);
  await pickItem(page, NAME); // a second line for the second batch
  const row = (i: number) => ({
    batch: page.getByLabel(`Batch number for ${NAME}`).nth(i),
    expiry: page.getByLabel(`Expiry date for ${NAME}`).nth(i),
    qty: page.getByLabel(`Quantity for ${NAME}`).nth(i),
    mrp: page.getByLabel(`MRP for ${NAME}`).nth(i),
    cost: page.getByLabel(`Purchase price for ${NAME}`).nth(i),
  });
  for (const [i, b] of [[0, { n: FAR, d: 400, q: "100" }], [1, { n: NEAR, d: 20, q: "50" }]] as const) {
    await row(i).batch.fill(b.n);
    await row(i).expiry.fill(inDays(b.d));
    await row(i).qty.fill(b.q);
    await row(i).mrp.fill("60");
    await row(i).cost.fill("45");
  }
  await expect(page.getByText("Short expiry: 20 days")).toBeVisible(); // the form already warns about the short-dated batch
  await page.getByRole("button", { name: "Receive stock" }).click();
  const done = page.getByRole("status").filter({ hasText: "Received 2 line(s)" });
  await expect(done).toBeVisible();
  await expect(done).toContainText("₹6,750.00"); // 150 x Rs 45
});

test("3. ward nurse raises an indent, the store keeper approves and issues it", async ({ page }) => {
  await login(page, "nurse");
  await page.goto("/indents/new");
  await pickItem(page, NAME);
  await page.getByLabel(`Quantity of ${NAME}`).fill("30");
  await page.getByRole("button", { name: "Send to store" }).click();
  await expect(page).toHaveURL(/\/indents\/[^/]+$/);
  await expect(page.getByText("Waiting for the store").first()).toBeVisible();
  const indentUrl = page.url();
  await logout(page);

  await login(page, "keeper");
  await page.goto(indentUrl);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("button", { name: "Issue now" })).toBeVisible();
  await page.getByRole("button", { name: "Issue now" }).click();
  await expect(page.getByText("Issued in full.")).toBeVisible();
});

test("4. store keeper transfers to the pharmacy and sees the FEFO split first", async ({ page }) => {
  await login(page, "keeper");
  await page.goto("/issue");
  await page.getByLabel("To store").selectOption({ label: "Pharmacy" });
  await pickItem(page, NAME);
  await page.getByLabel(`Quantity of ${NAME}`).fill("40");
  await page.getByRole("button", { name: "Review FEFO split" }).click();
  await expect(page.getByText(/20 from batch E2E-NEAR/)).toBeVisible(); // what is left of the near batch goes first
  await expect(page.getByText(/20 from batch E2E-FAR/)).toBeVisible();
  await page.getByRole("button", { name: "Confirm transfer" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Transferred" })).toBeVisible();
});

test("5. pharmacist dispenses, earliest expiry first, and gets a slip", async ({ page }) => {
  await login(page, "pharmacist");
  await page.goto("/dispense");
  await page.getByLabel("Patient name or OPD token (optional)").fill("OPD 77");
  await pickItem(page, NAME);
  await page.getByLabel(`Quantity of ${NAME}`).fill("5");
  await page.getByRole("button", { name: "Review batches" }).click();
  await expect(page.getByText(/5 from batch E2E-NEAR/)).toBeVisible(); // FEFO: the batch that expires first
  await page.getByRole("button", { name: "Confirm and dispense" }).click();
  const slip = page.getByRole("region", { name: "Dispensing slip" });
  await expect(slip).toBeVisible();
  await expect(slip).toContainText("OPD 77");
  await expect(slip).toContainText("E2E-NEAR");
});

test("6. the expiry centre shows the near-expiry batch", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/expiry?tab=d30");
  const row = page.getByRole("row").filter({ hasText: NAME }).filter({ hasText: NEAR }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("20 days");
});

test("7. an expired batch is written off by the admin", async ({ page }) => {
  // Time passes: the near batch's expiry date moves into the past. (A batch cannot be received already expired, so a
  // person cannot do this on screen; the batch row, unlike the ledger, may be changed.)
  const batch = await prisma.batch.findFirstOrThrow({ where: { batchNo: NEAR, item: { name: NAME } } });
  await prisma.batch.update({ where: { id: batch.id }, data: { expiryDate: new Date(`${inDays(-2)}T00:00:00Z`) } });

  await login(page, "admin");
  await page.goto("/expiry?tab=expired");
  for (const store of ["Pharmacy", "Ward A"]) {
    const row = page.getByRole("row").filter({ hasText: NAME }).filter({ hasText: NEAR }).filter({ hasText: store });
    await expect(row).toContainText("Expired");
    await row.getByRole("button", { name: "Write off" }).click();
    await row.getByRole("button", { name: "Confirm" }).click();
    await expect(row).toHaveCount(0);
  }
});

test("8. the ledger matches: every balance equals its movements, and the bin card shows the whole story", async ({ page }) => {
  const item = await prisma.item.findFirstOrThrow({ where: { name: NAME } });
  const moves = await prisma.stockMovement.findMany({ where: { batch: { itemId: item.id } }, orderBy: { seq: "asc" } });
  const balances = await prisma.stockBalance.findMany({ where: { batch: { itemId: item.id } } });

  // balances are exactly the sum of the ledger, per store and batch
  const sums = new Map<string, number>();
  for (const m of moves) sums.set(`${m.storeId}|${m.batchId}`, (sums.get(`${m.storeId}|${m.batchId}`) ?? 0) + m.quantity);
  for (const b of balances) expect(sums.get(`${b.storeId}|${b.batchId}`) ?? 0, `balance of ${b.batchId}`).toBe(b.quantity);
  for (const [k, v] of sums) expect(balances.find((b) => `${b.storeId}|${b.batchId}` === k)?.quantity ?? 0).toBe(v);

  // the story in numbers: 150 received, 5 dispensed, 45 written off (15 in the pharmacy, 30 in the ward), 100 left
  const sum = (type: string) => moves.filter((m) => m.type === type).reduce((s, m) => s + m.quantity, 0);
  expect(sum("RECEIPT")).toBe(150);
  expect(sum("DISPENSE")).toBe(-5);
  expect(sum("EXPIRY_WRITEOFF")).toBe(-45);
  expect(sum("TRANSFER_OUT") + sum("TRANSFER_IN")).toBe(0);
  expect(balances.reduce((s, b) => s + b.quantity, 0)).toBe(100);

  // and what a person reads on screen is the same ledger
  await login(page, "auditor");
  await page.goto(`/items/${item.id}/ledger`);
  await expect(page.getByRole("heading", { name: new RegExp(NAME) })).toBeVisible();
  for (const label of ["Received", "Transfer out", "Transfer in", "Dispensed", "Expiry write-off"]) {
    await expect(page.getByRole("cell", { name: label, exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText(`${moves.length} movements`)).toBeVisible();
  // the auditor can look but not change anything
  await page.goto("/grn");
  await expect(page).toHaveURL(/\/dashboard/);
});
