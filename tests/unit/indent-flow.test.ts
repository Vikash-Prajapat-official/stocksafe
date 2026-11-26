import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canDo, checkApprovals, outstanding, statusAfterIssue, type IndentAction, type IndentStatus } from "@/lib/indent-flow";

const STATUSES: IndentStatus[] = ["DRAFT", "SUBMITTED", "APPROVED", "PARTIAL", "ISSUED", "REJECTED"];

describe("canDo (the indent state machine)", () => {
  const allowed: Record<IndentAction, IndentStatus[]> = {
    submit: ["DRAFT"],
    approve: ["SUBMITTED"],
    reject: ["SUBMITTED"],
    issue: ["APPROVED", "PARTIAL"],
    close: ["PARTIAL"],
  };
  for (const [action, from] of Object.entries(allowed) as [IndentAction, IndentStatus[]][]) {
    it(`${action} is allowed only from ${from.join(" or ")}`, () => {
      for (const s of STATUSES) expect(canDo(action, s)).toBe(from.includes(s));
    });
  }
  it("nothing can be done to a finished indent", () => {
    for (const a of Object.keys(allowed) as IndentAction[]) {
      expect(canDo(a, "ISSUED")).toBe(false);
      expect(canDo(a, "REJECTED")).toBe(false);
    }
  });
});

describe("outstanding", () => {
  it("is approved minus issued, never negative, and 0 before approval", () => {
    expect(outstanding({ qtyApproved: 10, qtyIssued: 4 })).toBe(6);
    expect(outstanding({ qtyApproved: 10, qtyIssued: 10 })).toBe(0);
    expect(outstanding({ qtyApproved: 3, qtyIssued: 9 })).toBe(0);
    expect(outstanding({ qtyApproved: null, qtyIssued: 0 })).toBe(0);
  });
});

describe("statusAfterIssue", () => {
  it("is ISSUED when nothing is outstanding, otherwise PARTIAL", () => {
    expect(statusAfterIssue([{ qtyApproved: 5, qtyIssued: 5 }, { qtyApproved: 2, qtyIssued: 2 }])).toBe("ISSUED");
    expect(statusAfterIssue([{ qtyApproved: 5, qtyIssued: 5 }, { qtyApproved: 2, qtyIssued: 1 }])).toBe("PARTIAL");
  });
  it("ignores lines approved at 0", () => {
    expect(statusAfterIssue([{ qtyApproved: 0, qtyIssued: 0 }, { qtyApproved: 4, qtyIssued: 4 }])).toBe("ISSUED");
  });
  it("matches 'any outstanding' for any lines (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.record({ qtyApproved: fc.integer({ min: 0, max: 20 }), qtyIssued: fc.integer({ min: 0, max: 20 }) }), { minLength: 1, maxLength: 6 }), (lines) => {
        const any = lines.some((l) => l.qtyApproved > l.qtyIssued);
        expect(statusAfterIssue(lines)).toBe(any ? "PARTIAL" : "ISSUED");
      }),
    );
  });
});

describe("checkApprovals", () => {
  const lines = [
    { id: "l1", qtyRequested: 10 },
    { id: "l2", qtyRequested: 4 },
  ];

  it("approves everything as requested when no quantities are given", () => {
    const r = checkApprovals(lines, undefined);
    expect(r).toEqual({ ok: true, approved: new Map([["l1", 10], ["l2", 4]]) });
  });

  it("allows approving less, including 0 for a line", () => {
    const r = checkApprovals(lines, [{ lineId: "l1", qtyApproved: 6 }, { lineId: "l2", qtyApproved: 0 }]);
    expect(r).toEqual({ ok: true, approved: new Map([["l1", 6], ["l2", 0]]) });
  });

  it("lines that are not mentioned keep the requested quantity", () => {
    const r = checkApprovals(lines, [{ lineId: "l2", qtyApproved: 1 }]);
    expect(r).toEqual({ ok: true, approved: new Map([["l1", 10], ["l2", 1]]) });
  });

  it("refuses more than requested, negative or fractional numbers, and unknown lines", () => {
    expect(checkApprovals(lines, [{ lineId: "l1", qtyApproved: 11 }]).ok).toBe(false);
    expect(checkApprovals(lines, [{ lineId: "l1", qtyApproved: -1 }]).ok).toBe(false);
    expect(checkApprovals(lines, [{ lineId: "l1", qtyApproved: 1.5 }]).ok).toBe(false);
    expect(checkApprovals(lines, [{ lineId: "nope", qtyApproved: 1 }]).ok).toBe(false);
  });

  it("refuses to approve nothing at all (reject it instead)", () => {
    const r = checkApprovals(lines, [{ lineId: "l1", qtyApproved: 0 }, { lineId: "l2", qtyApproved: 0 }]);
    expect(r).toMatchObject({ ok: false });
    expect((r as { message: string }).message).toMatch(/reject/i);
  });
});
