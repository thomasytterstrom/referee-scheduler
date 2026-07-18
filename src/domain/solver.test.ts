// Solver property tests. The strong contracts (constraint-spec.md §Hard constraints + solver-spec):
//   - output is ALWAYS hard-valid (moves preserve feasibility by construction)
//   - SA never returns worse than its greedy seed (best-so-far tracked)
//   - pinned slots are never moved
//   - greedy is deterministic per seed; different seeds give variety (Reshuffle)
// solve() is wall-clock budgeted, so exact per-seed solve output is intentionally NOT asserted.

import { describe, test, expect } from "vitest";
import { greedy, solve } from "./solver.ts";
import { scoreDay } from "./score.ts";
import { validate, feasibility } from "./validate.ts";
import { emptyCarry, cloneSol } from "./types.ts";
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
