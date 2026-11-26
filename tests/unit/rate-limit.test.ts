import { describe, expect, it } from "vitest";
import { createLimiter } from "@/lib/rate-limit";

describe("createLimiter", () => {
  it("blocks after max failures and unblocks when the window passes", () => {
    let t = 0;
    const l = createLimiter({ max: 3, windowMs: 1000, now: () => t });
    for (let i = 0; i < 3; i++) {
      expect(l.isBlocked("a")).toBe(false);
      l.recordFailure("a");
    }
    expect(l.isBlocked("a")).toBe(true);
    expect(l.isBlocked("b")).toBe(false); // keys are independent
    t = 1001;
    expect(l.isBlocked("a")).toBe(false);
  });

  it("reset clears the failures", () => {
    const l = createLimiter({ max: 1, windowMs: 1000, now: () => 0 });
    l.recordFailure("a");
    expect(l.isBlocked("a")).toBe(true);
    l.reset("a");
    expect(l.isBlocked("a")).toBe(false);
  });
});
