// The indent (ward stock request) state machine. Pure.
//   DRAFT --submit--> SUBMITTED --approve--> APPROVED --issue--> ISSUED
//                                  \--reject--> REJECTED     \--issue (short)--> PARTIAL --issue--> ISSUED
//                                                                                PARTIAL --close--> ISSUED

export type IndentStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "PARTIAL" | "ISSUED" | "REJECTED";
export type IndentAction = "submit" | "approve" | "reject" | "issue" | "close";

const FROM: Record<IndentAction, readonly IndentStatus[]> = {
  submit: ["DRAFT"],
  approve: ["SUBMITTED"],
  reject: ["SUBMITTED"],
  issue: ["APPROVED", "PARTIAL"],
  close: ["PARTIAL"],
};

export const INDENT_STATUS_LABEL: Record<IndentStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Waiting for the store",
  APPROVED: "Approved",
  PARTIAL: "Partly issued",
  ISSUED: "Issued",
  REJECTED: "Rejected",
};

export const statusesFor = (action: IndentAction): readonly IndentStatus[] => FROM[action];
export const canDo = (action: IndentAction, status: IndentStatus): boolean => FROM[action].includes(status);

/** Still to be issued on a line. Zero before approval. */
export function outstanding(l: { qtyApproved: number | null; qtyIssued: number }): number {
  return Math.max(0, (l.qtyApproved ?? 0) - l.qtyIssued);
}

export function statusAfterIssue(lines: { qtyApproved: number | null; qtyIssued: number }[]): "ISSUED" | "PARTIAL" {
  return lines.some((l) => outstanding(l) > 0) ? "PARTIAL" : "ISSUED";
}

export type ApprovalCheck = { ok: true; approved: Map<string, number> } | { ok: false; message: string };

/**
 * Works out the approved quantity for every line. With no quantities given, everything is approved as
 * requested. A line can be approved for less (down to 0) but never more than requested.
 */
export function checkApprovals(
  lines: { id: string; qtyRequested: number }[],
  approvals: { lineId: string; qtyApproved: number }[] | undefined,
): ApprovalCheck {
  const approved = new Map(lines.map((l) => [l.id, l.qtyRequested]));
  for (const a of approvals ?? []) {
    const line = lines.find((l) => l.id === a.lineId);
    if (!line) return { ok: false, message: "One of the lines does not belong to this indent" };
    if (!Number.isInteger(a.qtyApproved) || a.qtyApproved < 0) return { ok: false, message: "Approved quantities must be whole numbers, 0 or more" };
    if (a.qtyApproved > line.qtyRequested) return { ok: false, message: `You cannot approve more than was requested (${line.qtyRequested})` };
    approved.set(line.id, a.qtyApproved);
  }
  if (![...approved.values()].some((q) => q > 0)) return { ok: false, message: "Nothing is approved. Reject the indent instead." };
  return { ok: true, approved };
}
