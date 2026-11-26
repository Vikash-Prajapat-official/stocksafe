// Stock count variance maths. Pure. Money is integer paise; a negative variance is a shortage.

import { lineValuePaise } from "@/lib/money";

export type VarianceInput = { systemQty: number; countedQty: number | null; costPaise: number };

export function lineVariance(l: VarianceInput): { counted: boolean; units: number; valuePaise: number } {
  if (l.countedQty === null) return { counted: false, units: 0, valuePaise: 0 };
  const units = l.countedQty - l.systemQty;
  const value = lineValuePaise(Math.abs(units), l.costPaise);
  return { counted: true, units, valuePaise: units < 0 ? -value : value };
}

export function summarizeVariance(lines: VarianceInput[]) {
  const s = { total: lines.length, counted: 0, uncounted: 0, matching: 0, over: 0, short: 0, gainPaise: 0, lossPaise: 0, netPaise: 0, netUnits: 0 };
  for (const l of lines) {
    const v = lineVariance(l);
    if (!v.counted) { s.uncounted++; continue; }
    s.counted++;
    s.netUnits += v.units;
    if (v.units === 0) s.matching++;
    else if (v.units > 0) { s.over++; s.gainPaise += v.valuePaise; }
    else { s.short++; s.lossPaise += -v.valuePaise; }
  }
  s.netPaise = s.gainPaise - s.lossPaise;
  return s;
}
