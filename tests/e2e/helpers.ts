import { PrismaClient } from "@prisma/client";
import { expect, type Page } from "@playwright/test";

export const PASSWORD = "ChangeMe@123";
export const PHONE = { admin: "9000000001", keeper: "9000000002", pharmacist: "9000000003", nurse: "9000000004", auditor: "9000000005" } as const;

/** The e2e database, for the few things a person cannot do on screen (making a batch "age"). */
export const prisma = new PrismaClient({
  datasources: { db: { url: process.env.E2E_DATABASE_URL ?? "postgresql://stocksafe:change-me@localhost:5434/stocksafe_e2e" } },
});

/** Today's date in India, as the app sees it. */
export const todayIST = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
export const inDays = (n: number) => new Date(Date.parse(`${todayIST()}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function login(page: Page, role: keyof typeof PHONE) {
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill(PHONE[role]);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  // the very first sign-in after the server starts is slow (it warms up the password hashing and the database connection)
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 });
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Type in an item picker and choose the first match. */
export async function pickItem(page: Page, search: string, label = "Add item") {
  await page.getByLabel(label, { exact: true }).fill(search);
  await page.getByRole("listbox").getByRole("button", { name: new RegExp(search, "i") }).first().click();
}
