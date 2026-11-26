import { describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();
vi.mock("@/lib/db", () => ({ db: { $queryRaw: (...a: unknown[]) => queryRaw(...a) } }));

import { checkHealth } from "@/lib/health";

describe("checkHealth", () => {
  it("reports ok when the database answers", async () => {
    queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    const s = await checkHealth();
    expect(s).toMatchObject({ ok: true, app: "ok", database: "ok" });
  });

  it("reports down, without throwing, when the database fails", async () => {
    queryRaw.mockRejectedValueOnce(new Error("connection refused"));
    const s = await checkHealth();
    expect(s).toMatchObject({ ok: false, app: "ok", database: "down" });
  });
});
