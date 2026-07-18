// Hand-computed penalty checks for scoreDay. Every expected value is derived from
// constraint-spec.md (§Weights + §Constraint details), NOT read back from the implementation.
// Assertions target individual Score fields (pre-weight) so each constraint is isolated.

import { describe, test, expect } from "vitest";
import { scoreDay } from "./score.ts";
import { emptyCarry, emptySol } from "./types.ts";
import type { Problem, Match, Sol, Carry } from "./types.ts";

function makeProblem(N: number, R: number, matches: Match[], avail?: Uint8Array[]): Problem {
  const roundMatches: number[][] = Array.from({ length: R }, () => []);
  matches.forEach((m, i) => roundMatches[m.round].push(i));
  const av = avail ?? Array.from({ length: N }, () => new Uint8Array(R).fill(1));
  return { N, R, matches, avail: av, roundMatches };
}

function solFrom(count: number, heads: number[], assts?: number[]): Sol {
  const s = emptySol(count);
  heads.forEach((h, i) => (s.head[i] = h));
  if (assts) assts.forEach((a, i) => (s.asst[i] = a));
  return s;
}

// Head-only match on court 0, gender M (1) unless noted.
const H = (round: number, gender: 0 | 1 = 1): Match => ({ court: 0, round, gender, needA: false });
const HA = (round: number, gender: 0 | 1 = 1): Match => ({ court: 0, round, gender, needA: true });

describe("scoreDay — rest rule (w=5000, (streak-2)^2)", () => {
  test("active streak of 3 in one day → rest = 1, and Head→Head twice → ha = 2", () => {
    // ref0 heads rounds 0,1,2 (streak 3); refs 1-3 idle. N=4 so plenty of slack.
    const p = makeProblem(4, 3, [H(0), H(1), H(2)]);
    const s = solFrom(3, [0, 0, 0]);
    const sc = scoreDay(p, s, emptyCarry(4));
    expect(sc.rest).toBe(1); // (3-2)^2
    expect(sc.ha).toBe(2); // rounds 0-1 and 1-2 are Head-then-Head
    expect(sc.sit).toBe(0); // idle refs sit only 3 rounds; penalty needs >3
  });

  test("streak of 2 is free", () => {
    const p = makeProblem(4, 2, [H(0), H(1)]);
    const s = solFrom(2, [0, 0]);
    expect(scoreDay(p, s, emptyCarry(4)).rest).toBe(0);
  });
});

describe("scoreDay — consecutive sits (w=30, (streak-3)^2)", () => {
  test("ref available 5 rounds, never assigned → sit = 4; the busy ref → rest 9, ha 4", () => {
    // N=2, R=5, one head-only match/round all given to ref1. ref0 sits all 5 rounds.
    const p = makeProblem(2, 5, [H(0), H(1), H(2), H(3), H(4)]);
    const s = solFrom(5, [1, 1, 1, 1, 1]);
    const sc = scoreDay(p, s, emptyCarry(2));
    expect(sc.sit).toBe(4); // ref0: (5-3)^2
    expect(sc.rest).toBe(9); // ref1: (5-2)^2
    expect(sc.ha).toBe(4); // ref1 Head every round → 4 adjacent pairs
  });

  test("unavailable round breaks a sit run (leave-and-return ≠ sitting through)", () => {
    // N=2, R=5. ref0 never assigned but UNAVAILABLE in round 2 → two runs of 2 sits, no penalty.
    const av = [new Uint8Array([1, 1, 0, 1, 1]), new Uint8Array(5).fill(1)];
    const p = makeProblem(2, 5, [H(0), H(1), H(2), H(3), H(4)], av);
    const s = solFrom(5, [1, 1, 1, 1, 1]);
    expect(scoreDay(p, s, emptyCarry(2)).sit).toBe(0);
  });
});

describe("scoreDay — Head/Assistant balance (w=1000) + fine gender (w=200)", () => {
  test("2 heads both on ref0, 2-ref roster → hbal 2, gender 2, total weighted 2410", () => {
    const p = makeProblem(2, 2, [H(0), H(1)]);
    const s = solFrom(2, [0, 0]);
    const sc = scoreDay(p, s, emptyCarry(2));
    // target = totalHead(2) * availShare(0.5) = 1 each; (2-1)^2 + (0-1)^2 = 2
    expect(sc.hbal).toBe(2);
    expect(sc.abal).toBe(0);
    // both matches gender M: totHM=2, target 1 each → (2-1)^2 + (0-1)^2 = 2
    expect(sc.gender).toBe(2);
    // 1000*2 + 200*2 + 10*1(ha: Head r0→r1) = 2000 + 400 + 10
    expect(sc.total).toBe(2410);
  });

  test("targets are availability-PROPORTIONAL, not flat (the core rescale hazard)", () => {
    // ref0 available both rounds, ref1 available only round 0. Both heads → ref0.
    // Proportional target: ref0 = 2*(2/3) = 4/3, ref1 = 2*(1/3) = 2/3.
    //   hbal = (2 - 4/3)^2 + (0 - 2/3)^2 = 4/9 + 4/9 = 8/9.
    // A flat target (totalHead/N = 1 each) would instead give (2-1)^2+(0-1)^2 = 2 — this test
    // fails loudly if the proportional formula is ever replaced by a flat/hardcoded divisor.
    const av = [new Uint8Array([1, 1]), new Uint8Array([1, 0])];
    const p = makeProblem(2, 2, [H(0), H(1)], av);
    const s = solFrom(2, [0, 0]);
    const sc = scoreDay(p, s, emptyCarry(2));
    expect(sc.hbal).toBeCloseTo(8 / 9, 10);
    expect(sc.gender).toBeCloseTo(8 / 9, 10); // same shape, both matches gender M
  });

  test("carry folds into actuals, availability, and totals (proportional targets)", () => {
    // ref1 carried 2 prior heads; both refs carried 2 available rounds.
    const carry: Carry = emptyCarry(2);
    carry.H[1] = 2;
    carry.totalHead = 2;
    carry.avail[0] = 2;
    carry.avail[1] = 2;
    // Day: 1 round, 1 head-only match → ref0.
    const p = makeProblem(2, 1, [H(0)]);
    const s = solFrom(1, [0]);
    const sc = scoreDay(p, s, carry);
    // totHeadCum = 3; availCum = 3 each; target 1.5 each.
    // actual: ref0 = 0+1 = 1, ref1 = 2+0 = 2 → (1-1.5)^2 + (2-1.5)^2 = 0.5
    expect(sc.hbal).toBeCloseTo(0.5, 10);
  });
});

describe("scoreDay — pair variety (w=50, caps as ceil formulas)", () => {
  test("same ordered pair used twice over cap 1 → pair = 2", () => {
    // N=3, two Head+Asst matches, both ref0(head)/ref1(asst). P=2.
    // capU = ceil(2 / (3*2/2)) = 1 ; capO = ceil(2 / (3*2)) = 1.
    const p = makeProblem(3, 2, [HA(0), HA(1)]);
    const s = solFrom(2, [0, 0], [1, 1]);
    const sc = scoreDay(p, s, emptyCarry(3));
    // unordered (0,1)=2 over cap 1 → 1 ; ordered (0,1)=2 over cap 1 → 1
    expect(sc.pair).toBe(2);
  });

  test("pairing within cap is free", () => {
    // N=4, one HA match → P=1, caps 1, count 1 → no penalty.
    const p = makeProblem(4, 1, [HA(0)]);
    const s = solFrom(1, [0], [1]);
    expect(scoreDay(p, s, emptyCarry(4)).pair).toBe(0);
  });
});
