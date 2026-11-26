import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Test only: nothing imports it. Covers the nightly-job route that Vercel Cron calls and the public-demo switch.
const jobs = vi.hoisted(() => ({
  runRetentionJob: vi.fn(async () => ({ date: "2026-11-27", days: 90, anonymised: 3 })),
  runAlertJob: vi.fn(async () => ({ expiredCount: 2, lowStockCount: 5, digest: { status: "skipped" } })),
}));
vi.mock("@/worker/jobs", () => jobs);

import { GET } from "@/app/api/cron/nightly/route";
import { assertNotDemo, isDemoMode } from "@/lib/demo";

const call = (auth?: string) => GET(new Request("http://x/api/cron/nightly", { headers: auth ? { authorization: auth } : {} }));
const SECRET = "a-long-random-cron-secret";

describe("nightly cron route", () => {
  beforeEach(() => jobs.runRetentionJob.mockClear());
  afterEach(() => vi.unstubAllEnvs());

  it("is closed to everyone when no CRON_SECRET is set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
    expect((await call()).status).toBe(401);
    expect(jobs.runRetentionJob).not.toHaveBeenCalled();
  });

  it("is closed to a missing or wrong secret, and a too-short one never counts", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call(`Bearer ${SECRET}x`)).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "short");
    expect((await call("Bearer short")).status).toBe(401);
    expect(jobs.runRetentionJob).not.toHaveBeenCalled();
  });

  it("runs both jobs for the right secret", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ retention: { anonymised: 3, days: 90 }, alerts: { expired: 2, low: 5, digest: "skipped" } });
    expect(jobs.runRetentionJob).toHaveBeenCalledOnce();
  });
});

describe("public demo mode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off unless DEMO_MODE=1, and then blocks changes to who can sign in", () => {
    vi.stubEnv("DEMO_MODE", "");
    expect(isDemoMode()).toBe(false);
    expect(() => assertNotDemo()).not.toThrow();
    vi.stubEnv("DEMO_MODE", "1");
    expect(isDemoMode()).toBe(true);
    expect(() => assertNotDemo()).toThrow(/public demo/);
  });
});
