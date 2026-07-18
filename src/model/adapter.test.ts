// Adapter: one day of the rich Tournament graph <-> the flattened solver Problem/Sol.
// Expected values hand-derived from domain-model.md (§Entities/§Invariants) + the flattened
// shapes in src/domain/types.ts.

import { describe, test, expect } from "vitest";
import { toProblem, applySol, refIndexMap } from "./adapter.ts";
import { solve } from "../domain/solver.ts";
import { validate } from "../domain/validate.ts";
import { emptyCarry } from "../domain/types.ts";
import type { Tournament, Day } from "./tournament.ts";

// Three refs (r1 part-time: round 0 only). One available court c0 + one EXCLUDED court c1.
// round 0: m0 on c0 (W, needs assistant) + m1 on c1 (excluded). round 1: m2 on c0 (M, head-only).
function mappingTournament(): Tournament {
  const day: Day = {
    index: 0,
    status: "draft",
    availableCourtIds: ["c0"], // c1 excluded -> its matches drop out of the Problem
    availability: { r0: null, r1: [0], r2: null }, // r1 available round 0 only
    rounds: [
      {
        index: 0,
        matches: [
          { id: "m0", courtId: "c0", gender: "W", requiresAssistant: true },
          { id: "m1", courtId: "c1", gender: "M", requiresAssistant: true }, // excluded court
        ],
      },
      {
        index: 1,
        matches: [{ id: "m2", courtId: "c0", gender: "M", requiresAssistant: false }],
      },
    ],
    assignments: [
      {
        matchId: "m0",
        head: { refId: "r0", pinned: true }, // pinned head
        assistant: { refId: "r2", pinned: false },
      },
      // m2 left unsolved (no assignment) -> head slot empty in the Sol
    ],
  };
  return {
    referees: [
      { id: "r0", name: "Alice" },
      { id: "r1", name: "Bob" },
      { id: "r2", name: "Cara" },
    ],
    courts: [
      { id: "c0", name: "Center" },
      { id: "c1", name: "Side" },
    ],
    days: [day],
  };
}

describe("toProblem — mapping", () => {
  const { problem, sol, map } = toProblem(mappingTournament(), 0);

  test("N = full roster, R = day rounds", () => {
    expect(problem.N).toBe(3);
    expect(problem.R).toBe(2);
  });

  test("excludes matches on courts not in availableCourtIds (sparse grid)", () => {
    expect(problem.matches.length).toBe(2); // m0 + m2; m1 on excluded c1 dropped
    expect(problem.roundMatches).toEqual([[0], [1]]);
  });

  test("maps gender, requiresAssistant, round index, court index", () => {
    expect(problem.matches[0]).toMatchObject({ court: 0, round: 0, gender: 0, needA: true });
    expect(problem.matches[1]).toMatchObject({ court: 0, round: 1, gender: 1, needA: false });
  });

  test("availability -> avail Uint8Array per ref (part-time ref restricted)", () => {
    expect(Array.from(problem.avail[0])).toEqual([1, 1]); // r0 all rounds
    expect(Array.from(problem.avail[1])).toEqual([1, 0]); // r1 round 0 only
    expect(Array.from(problem.avail[2])).toEqual([1, 1]); // r2 all rounds
  });

  test("stable refId<->index map (roster order)", () => {
    expect(map.toId).toEqual(["r0", "r1", "r2"]);
    expect(map.toIndex.get("r1")).toBe(1);
  });

  test("pins + existing assignments -> Sol (indices + pin flags)", () => {
    expect(sol.head[0]).toBe(0); // r0
    expect(sol.headPin[0]).toBe(1); // pinned
    expect(sol.asst[0]).toBe(2); // r2
    expect(sol.asstPin[0]).toBe(0);
    expect(sol.head[1]).toBe(-1); // m2 unsolved
  });

  test("refIndexMap standalone matches toProblem's map", () => {
    const m = refIndexMap(mappingTournament());
    expect(m.toId).toEqual(map.toId);
  });
});

// Round-trip: 4 refs, 1 court, 4 rounds (one match/round), fresh (empty) day.
function roundTripTournament(): Tournament {
  const rounds = [0, 1, 2, 3].map((i) => ({
    index: i,
    matches: [
      {
        id: `m${i}`,
        courtId: "c0",
        gender: (i % 2 === 0 ? "W" : "M") as "W" | "M",
        requiresAssistant: i !== 3, // last match head-only, rest need assistant
      },
    ],
  }));
  const day: Day = {
    index: 0,
    status: "draft",
    availableCourtIds: ["c0"],
    availability: { r0: null, r1: null, r2: null, r3: null },
    rounds,
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
    days: [day],
  };
}

describe("round-trip: Tournament -> Problem -> solve -> applySol -> Tournament", () => {
  test("solved day is hard-valid and reads back identically", () => {
    const t = roundTripTournament();
    const { problem, sol, map } = toProblem(t, 0);
    const res = solve(problem, emptyCarry(problem.N), { budgetMs: 40, seed: 1, pins: sol });

    expect(validate(problem, res.sol)).toEqual([]);

    applySol(t.days[0], res.sol, map);

    // Every match now has a head refId drawn from the roster.
    for (const asg of t.days[0].assignments) {
      expect(asg.head.refId).not.toBeNull();
      expect(t.referees.some((r) => r.id === asg.head.refId)).toBe(true);
    }

    // Re-deriving the Problem from the written-back day reproduces the solved Sol.
    const again = toProblem(t, 0);
    expect(Array.from(again.sol.head)).toEqual(Array.from(res.sol.head));
    expect(Array.from(again.sol.asst)).toEqual(Array.from(res.sol.asst));
  });

  test("applySol preserves a pinned slot's ref and pinned flag", () => {
    const t = roundTripTournament();
    // Pre-pin m0's head to r2.
    t.days[0].assignments.push({
      matchId: "m0",
      head: { refId: "r2", pinned: true },
      assistant: { refId: null, pinned: false },
    });
    const { problem, sol, map } = toProblem(t, 0);
    expect(sol.head[0]).toBe(2);
    expect(sol.headPin[0]).toBe(1);

    const res = solve(problem, emptyCarry(problem.N), { budgetMs: 40, seed: 2, pins: sol });
    applySol(t.days[0], res.sol, map);

    const m0 = t.days[0].assignments.find((a) => a.matchId === "m0")!;
    expect(m0.head.refId).toBe("r2");
    expect(m0.head.pinned).toBe(true);
    expect(validate(problem, res.sol)).toEqual([]);
  });
});
