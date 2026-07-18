// carryoverFor folds every FINALIZED day before the target into a domain Carry (constraint-spec.md
// §Carryover + domain-model.md §Carryover). Expected totals hand-computed from day 0's assignments.

import { describe, test, expect } from "vitest";
import { carryoverFor } from "./carryover.ts";
import type { Tournament, Day } from "./tournament.ts";

// 4 refs; r3 appears only on day 1. Day 0 (finalized), 1 court, 2 rounds:
//   round 0: mA (W, pair) -> head r0, asst r1
//   round 1: mB (M, pair) -> head r1, asst r2
function twoDayFixture(): Tournament {
  const day0: Day = {
    index: 0,
    status: "finalized",
    availableCourtIds: ["c0"],
    availability: { r0: null, r1: null, r2: null }, // r3 not available day 0
    rounds: [
      { index: 0, matches: [{ id: "mA", courtId: "c0", gender: "W", requiresAssistant: true }] },
      { index: 1, matches: [{ id: "mB", courtId: "c0", gender: "M", requiresAssistant: true }] },
    ],
    assignments: [
      { matchId: "mA", head: { refId: "r0", pinned: false }, assistant: { refId: "r1", pinned: false } },
      { matchId: "mB", head: { refId: "r1", pinned: false }, assistant: { refId: "r2", pinned: false } },
    ],
  };
  const day1: Day = {
    index: 1,
    status: "draft",
    availableCourtIds: ["c0"],
    availability: { r0: null, r1: null, r2: null, r3: null },
    rounds: [{ index: 0, matches: [] }],
    assignments: [],
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

describe("carryoverFor — target day 1 folds finalized day 0", () => {
  const c = carryoverFor(twoDayFixture(), 1);
  const N = 4;

  test("head/assistant counts + totals", () => {
    expect(Array.from(c.H)).toEqual([1, 1, 0, 0]); // r0 head mA, r1 head mB
    expect(Array.from(c.A)).toEqual([0, 1, 1, 0]); // r1 asst mA, r2 asst mB
    expect(c.totalHead).toBe(2);
    expect(c.totalAsst).toBe(2);
  });

  test("four gender buckets", () => {
    expect(Array.from(c.HW)).toEqual([1, 0, 0, 0]); // mA W head r0
    expect(Array.from(c.AW)).toEqual([0, 1, 0, 0]); // mA W asst r1
    expect(Array.from(c.HM)).toEqual([0, 1, 0, 0]); // mB M head r1
    expect(Array.from(c.AM)).toEqual([0, 0, 1, 0]); // mB M asst r2
  });

  test("pair matrices (ordered + unordered), both pairs seeded", () => {
    expect(c.P).toBe(2);
    expect(c.po[0 * N + 1]).toBe(1); // r0 -> r1 (mA)
    expect(c.po[1 * N + 2]).toBe(1); // r1 -> r2 (mB)
    expect(c.pu[0 * N + 1]).toBe(1); // {r0,r1}
    expect(c.pu[1 * N + 2]).toBe(1); // {r1,r2}
  });

  test("cumulative available rounds; ref present both days accrues, day-1-only ref stays zero", () => {
    expect(Array.from(c.avail)).toEqual([2, 2, 2, 0]);
    // r3 only appears on day 1 -> zero carryover across the board.
    expect(c.H[3]).toBe(0);
    expect(c.A[3]).toBe(0);
    expect(c.avail[3]).toBe(0);
  });
});

describe("carryoverFor — no finalized day before target", () => {
  test("target day 0 yields an empty carry", () => {
    const c = carryoverFor(twoDayFixture(), 0);
    expect(c.totalHead).toBe(0);
    expect(c.totalAsst).toBe(0);
    expect(c.P).toBe(0);
    expect(Array.from(c.H)).toEqual([0, 0, 0, 0]);
    expect(Array.from(c.avail)).toEqual([0, 0, 0, 0]);
  });

  test("a draft earlier day is NOT folded", () => {
    const t = twoDayFixture();
    t.days[0].status = "draft"; // un-finalize day 0
    const c = carryoverFor(t, 1);
    expect(c.totalHead).toBe(0);
    expect(Array.from(c.H)).toEqual([0, 0, 0, 0]);
  });
});
