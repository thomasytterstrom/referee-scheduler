// cumulativeRows folds every day through the selected one into per-ref Head/Assistant totals with
// availability-proportional targets (same math as the solver's hbal/abal). Counts hand-computed.

import { describe, test, expect } from "vitest";
import { cumulativeRows } from "./cumulative.ts";
import type { Tournament, Day } from "../../model/tournament.ts";

// 4 refs, all available both days (2 rounds each). r0 heads three times across the two days —
// the cross-day pile-up a single-day view would hide.
function twoDay(): Tournament {
  const mk = (id: string, gender: "W" | "M") => ({ id, courtId: "c0", gender, requiresAssistant: true });
  const day0: Day = {
    index: 0,
    availableCourtIds: ["c0"],
    availability: { r0: null, r1: null, r2: null, r3: null },
    rounds: [
      { index: 0, matches: [mk("mA", "W")] },
      { index: 1, matches: [mk("mB", "M")] },
    ],
    assignments: [
      { matchId: "mA", head: { refId: "r0", pinned: false }, assistant: { refId: "r1", pinned: false } },
      { matchId: "mB", head: { refId: "r0", pinned: false }, assistant: { refId: "r2", pinned: false } },
    ],
  };
  const day1: Day = {
    index: 1,
    availableCourtIds: ["c0"],
    availability: { r0: null, r1: null, r2: null, r3: null },
    rounds: [
      { index: 0, matches: [mk("mC", "W")] },
      { index: 1, matches: [mk("mD", "M")] },
    ],
    assignments: [
      { matchId: "mC", head: { refId: "r0", pinned: false }, assistant: { refId: "r3", pinned: false } },
      { matchId: "mD", head: { refId: "r1", pinned: false }, assistant: { refId: "r2", pinned: false } },
    ],
  };
  return {
    referees: [
      { id: "r0", name: "A" },
      { id: "r1", name: "B" },
      { id: "r2", name: "C" },
      { id: "r3", name: "D" },
    ],
    courts: [{ id: "c0", name: "Center" }],
    days: [day0, day1],
  };
}

describe("cumulativeRows — through the selected day inclusive", () => {
  test("day 1 folds both days; r0's head pile-up shows over its fair target", () => {
    const rows = cumulativeRows(twoDay(), 1);
    expect(rows.map((r) => r.name)).toEqual(["A", "B", "C", "D"]); // roster order, all participated

    // Head totals: r0=3 (mA,mB,mC), r1=1 (mD), r2=r3=0.
    expect(rows.map((r) => r.head)).toEqual([3, 1, 0, 0]);
    // Assistant totals: r1=1 (mA), r2=2 (mB,mD), r3=1 (mC), r0=0.
    expect(rows.map((r) => r.asst)).toEqual([0, 1, 2, 1]);

    // Equal availability (4 rounds each of 16) -> every target is an even share: 4 duties / 4 refs = 1.
    for (const r of rows) {
      expect(r.targetHead).toBeCloseTo(1);
      expect(r.targetAsst).toBeCloseTo(1);
    }
    // r0 is 3x its fair Head share -> the imbalance the view is meant to surface.
    expect(rows[0].head).toBeGreaterThan(rows[0].targetHead);
  });

  test("day 0 folds only day 0", () => {
    const rows = cumulativeRows(twoDay(), 0);
    expect(rows.map((r) => r.head)).toEqual([2, 0, 0, 0]); // only mA, mB
    expect(rows.map((r) => r.asst)).toEqual([0, 1, 1, 0]);
  });
});
