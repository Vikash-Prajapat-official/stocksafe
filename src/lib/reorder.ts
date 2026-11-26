// Reorder maths. Pure. Levels of 0 mean "not set" (see DECISIONS.md).

export type ReorderStatus = "OK" | "LOW" | "OUT";
export type ReorderAssessment = {
  /** False when the item has no minimum or reorder level, so it is never listed. */
  tracked: boolean;
  status: ReorderStatus;
  /** On-hand is below the minimum level (more urgent than just low). */
  belowMin: boolean;
  /** The quantity to order up to: the maximum, or twice the reorder level when no maximum is set. */
  target: number;
  /** Quantity to order: target minus on-hand when low, otherwise 0. */
  suggested: number;
};

/**
 * `onHand` is the usable (non-expired) quantity. An item is low when on-hand is strictly below its
 * reorder level (or its minimum when no reorder level is set). Suggested quantity = maximum - on-hand.
 */
export function assessReorder(i: { onHand: number; minLevel: number; reorderLevel: number; maxLevel: number }): ReorderAssessment {
  const trigger = i.reorderLevel > 0 ? i.reorderLevel : i.minLevel;
  if (trigger <= 0) return { tracked: false, status: "OK", belowMin: false, target: 0, suggested: 0 };

  const target = i.maxLevel > 0 ? i.maxLevel : trigger * 2;
  const belowMin = i.minLevel > 0 && i.onHand < i.minLevel;
  if (i.onHand >= trigger) return { tracked: true, status: "OK", belowMin, target, suggested: 0 };
  return {
    tracked: true,
    status: i.onHand <= 0 ? "OUT" : "LOW",
    belowMin,
    target,
    suggested: Math.max(0, target - i.onHand),
  };
}
