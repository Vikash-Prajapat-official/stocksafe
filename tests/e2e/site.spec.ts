import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("landing page and language", () => {
  test("the landing page follows the spec and switches to Hindi, and the choice sticks", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Stop throwing away expired medicines.");
    await expect(page.getByText("Free, open-source stock and expiry tracker for hospital stores and pharmacies.").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Try the demo" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Install free" })).toHaveAttribute("href", "#install");
    await expect(page.getByText("Rs 42,300")).toBeVisible();
    await expect(page.getByText("Demo data")).toBeVisible(); // the figure is labelled as demo data
    // the three install commands and the FAQ
    await expect(page.locator("#install code")).toHaveText(["cp .env.example .env", "docker compose up -d", "docker compose exec app npx prisma db seed"]);
    await expect(page.getByText("Does it replace DVDMS?")).toBeVisible();
    // evidence cards carry source links
    await expect(page.getByRole("link", { name: "PMC8654139" })).toHaveAttribute("href", /ncbi\.nlm\.nih\.gov/);

    await page.getByRole("button", { name: "हिन्दी" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("एक्सपायर दवाएँ फेंकना बंद करें।");
    await expect(page.locator("html")).toHaveAttribute("lang", "hi");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("एक्सपायर दवाएँ फेंकना बंद करें।"); // remembered
  });

  test("the app speaks Hindi after sign-in, including the navigation", async ({ page, context }) => {
    await context.addCookies([{ name: "NEXT_LOCALE", value: "hi", url: "http://localhost:3100" }]);
    await page.goto("/login");
    await page.getByLabel("मोबाइल नंबर").fill("9000000001");
    await page.getByLabel("पासवर्ड").fill("ChangeMe@123");
    await page.getByRole("button", { name: "साइन इन" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "डैशबोर्ड" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "मुख्य" })).toContainText("एक्सपायरी");
  });

  test("an error from the server comes back in Hindi", async ({ request }) => {
    const res = await request.get("/api/admin/users", { headers: { cookie: "NEXT_LOCALE=hi" } });
    expect(res.status()).toBe(401);
    expect((await res.json()).error.message).toBe("कृपया साइन इन करें।");
    const en = await request.get("/api/admin/users");
    expect((await en.json()).error.message).toBe("Please sign in.");
  });
});

test.describe("who can open what", () => {
  test("a signed-out visitor is sent to sign in", async ({ page }) => {
    await page.goto("/items");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a ward nurse cannot open the admin pages", async ({ page }) => {
    await login(page, "nurse");
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/dashboard/);
    const res = await page.request.get("/api/admin/users");
    expect(res.status()).toBe(403);
  });
});

test.describe("installable app", () => {
  test("the manifest and icons are served", async ({ request }) => {
    const m = await (await request.get("/manifest.webmanifest")).json();
    expect(m).toMatchObject({ name: "StockSafe", display: "standalone", theme_color: "#15803d", start_url: "/dashboard" });
    for (const icon of m.icons) {
      const r = await request.get(icon.src);
      expect(r.status()).toBe(200);
      expect(r.headers()["content-type"]).toContain("image/png");
    }
  });

  test("the service worker shows the offline page, never stale data", async ({ page, context }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload(); // now controlled by the worker
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await context.setOffline(true);
    await page.goto("/dashboard").catch(() => undefined);
    await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "आप ऑफ़लाइन हैं" })).toBeVisible();
    await context.setOffline(false);
    // nothing with data was stored in the browser cache
    const cached = await page.evaluate(async () => {
      const out: string[] = [];
      for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname);
      return out;
    });
    expect(cached.filter((p) => p.startsWith("/api/") || p.startsWith("/dashboard") || p.startsWith("/items"))).toEqual([]);
  });
});
