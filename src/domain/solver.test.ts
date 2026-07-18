// Solver property tests. The strong contracts (constraint-spec.md §Hard constraints + solver-spec):
//   - output is ALWAYS hard-valid (moves preserve feasibility by construction)
//   - SA never returns worse than its greedy seed (best-so-far tracked)
//   - pinned slots are never moved
//   - greedy is deterministic per seed; different seeds give variety (Reshuffle)
// solve() is wall-clock budgeted, so exact per-seed solve output is intentionally NOT asserted.

import { describe, test, expect } from "vitest";
import { greedy, solve, pinsOnly } from "./solver.ts";
import { scoreDay } from "./score.ts";
import { validate, feasibility } from "./validate.ts";
import { emptyCarry, cloneSol, emptySol } from "./types.ts";
import { makeRng } from "./rng.ts";
import type { Problem, Match } from "./types.ts";

// Feasible-by-construction generator: N >= 2*M so even all-needA rounds fit; everyone available.
function genProblem(N: number, M: number, R: number, seed: number, needARate = 0.75): Problem {
  const rng = makeRng(seed);
  const matches: Match[] = [];
  for (let rd = 0; rd < R; rd++) {
    for (let ct = 0; ct < M; ct++) {
      matches.push({ court: ct, round: rd, gender: rng() < 0.5 ? 0 : 1, needA: rng() < needARate });
    }
  }
  const avail = Array.from({ length: N }, () => new Uint8Array(R).fill(1));
  const roundMatches: number[][] = Array.from({ length: R }, () => []);
  matches.forEach((m, i) => roundMatches[m.round].push(i));
  return { N, R, matches, avail, roundMatches };
}

const SIZES = [
  { N: 4, M: 1, R: 4 }, // the Excel-equivalent shape
  { N: 8, M: 3, R: 6 },
  { N: 12, M: 5, R: 8 },
];

describe("greedy seed", () => {
  test("produces a hard-valid schedule at every size", () => {
    for (const { N, M, R } of SIZES) {
      const p = genProblem(N, M, R, 1);
      expect(feasibility(p).ok).toBe(true);
      const s = greedy(p, emptyCarry(N), makeRng(1));
      expect(validate(p, s)).toEqual([]);
    }
  });

  test("is deterministic for a fixed seed", () => {
    const p = genProblem(8, 3, 6, 99);
    const a = greedy(p, emptyCarry(8), makeRng(5));
    const b = greedy(p, emptyCarry(8), makeRng(5));
    expect(Array.from(a.head)).toEqual(Array.from(b.head));
    expect(Array.from(a.asst)).toEqual(Array.from(b.asst));
  });

  test("different seeds give a different schedule (Reshuffle variety)", () => {
    const p = genProblem(8, 3, 6, 99);
    const a = greedy(p, emptyCarry(8), makeRng(1));
    const b = greedy(p, emptyCarry(8), makeRng(2));
    expect(Array.from(a.head)).not.toEqual(Array.from(b.head));
  });
});

describe("solve (greedy seed → simulated annealing)", () => {
  test("returns a hard-valid schedule at every size", () => {
    for (const { N, M, R } of SIZES) {
      const p = genProblem(N, M, R, 7);
      const res = solve(p, emptyCarry(N), { budgetMs: 40, seed: 7 });
      expect(validate(p, res.sol)).toEqual([]);
    }
  });

  test("never returns worse than its own greedy seed", () => {
    const p = genProblem(8, 3, 6, 11);
    const seedScore = scoreDay(p, greedy(p, emptyCarry(8), makeRng(11)), emptyCarry(8)).total;
    const res = solve(p, emptyCarry(8), { budgetMs: 60, seed: 11 });
    expect(res.score).toBeLessThanOrEqual(seedScore);
    expect(res.score).toBe(scoreDay(p, res.sol, emptyCarry(8)).total); // reported score matches the schedule
  });

  test("never moves a pinned slot", () => {
    const p = genProblem(8, 3, 6, 13);
    const carry = emptyCarry(8);
    // Warm-start from a valid greedy schedule, pin match 0's head at its current ref.
    const warm = cloneSol(greedy(p, carry, makeRng(13)));
    const pinnedRef = warm.head[0];
    warm.headPin[0] = 1;
    const res = solve(p, carry, { budgetMs: 60, seed: 13, warmStart: warm });
    expect(res.sol.head[0]).toBe(pinnedRef);
    expect(validate(p, res.sol)).toEqual([]);
  });
});

describe("solve — Web Worker hooks (progress / cancel / reason / pin seed)", () => {
  test("emits progress ticks on a cadence, and reports reason 'budget' on normal finish", () => {
    const p = genProblem(12, 5, 8, 3);
    const ticks: Array<{ elapsedMs: number; bestScore: number; iters: number }> = [];
    const res = solve(p, emptyCarry(12), {
      budgetMs: 220,
      seed: 3,
      progressMs: 40,
      onProgress: (t) => ticks.push(t),
    });
    expect(ticks.length).toBeGreaterThan(0);
    const last = ticks[ticks.length - 1];
    expect(last.iters).toBeGreaterThan(0);
    expect(Number.isFinite(last.bestScore)).toBe(true);
    expect(res.reason).toBe("budget");
  });

  test("cooperative cancel returns best-so-far immediately with reason 'cancelled'", () => {
    const p = genProblem(12, 5, 8, 4);
    // Cancel requested from the first between-batch check; a 5 s budget must be short-circuited.
    const res = solve(p, emptyCarry(12), { budgetMs: 5000, seed: 4, shouldCancel: () => true });
    expect(res.reason).toBe("cancelled");
    expect(res.ms).toBeLessThan(1000); // did not run the full budget
    expect(validate(p, res.sol)).toEqual([]);
  });

  test("pinsOnly keeps only locked slots and clears the rest", () => {
    const s = emptySol(3);
    s.head[0] = 4;
    s.headPin[0] = 1; // locked head
    s.head[1] = 7; // assigned but NOT locked → must be cleared
    s.asst[2] = 2;
    s.asstPin[2] = 1; // locked assistant
    const po = pinsOnly(s);
    expect(po.head[0]).toBe(4);
    expect(po.headPin[0]).toBe(1);
    expect(po.head[1]).toBe(-1); // unpinned assignment dropped
    expect(po.asst[2]).toBe(2);
    expect(po.asstPin[2]).toBe(1);
  });

  test("fresh solve honors pins passed via opts.pins (Reshuffle keeps locks)", () => {
    const p = genProblem(8, 3, 6, 5);
    const carry = emptyCarry(8);
    const seedSol = greedy(p, carry, makeRng(5));
    // Pin only match 0's head; leave everything else free to be reshuffled.
    const pins = emptySol(p.matches.length);
    pins.head[0] = seedSol.head[0];
    pins.headPin[0] = 1;
    const res = solve(p, carry, { budgetMs: 60, seed: 999, pins });
    expect(res.sol.head[0]).toBe(seedSol.head[0]);
    expect(validate(p, res.sol)).toEqual([]);
  });
});
