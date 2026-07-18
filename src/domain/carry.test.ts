// accumulate() folds one finalized day into cumulative carryover. Expected values hand-derived
// from constraint-spec.md §Carryover + domain-model.md (assignments are the source of truth).

import { describe, test, expect } from "vitest";
import { accumulate } from "./carry.ts";
import { emptyCarry, emptySol } from "./types.ts";
import type { Problem, Match, Sol } from "./types.ts";

function makeProblem(N: number, R: number, matches: Match[]): Problem {
  const roundMatches: number[][] = Array.from({ length: R }, () => []);
  matches.forEach((m, i) => roundMatches[m.round].push(i));
  const avail = Array.from({ length: N }, () => new Uint8Array(R).fill(1));
  return { N, R, matches, avail, roundMatches };
}

// Day: match0 = W Head+Asst (head0/asst1), match1 = M Head-only (head2). N=3, R=2.
function sampleDay(): { p: Problem; s: Sol } {
  const matches: Match[] = [
    { court: 0, round: 0, gender: 0, needA: true },
    { court: 0, round: 1, gender: 1, needA: false },
  ];
  const p = makeProblem(3, 2, matches);
  const s = emptySol(2);
  s.head[0] = 0;
  s.asst[0] = 1;
  s.head[1] = 2;
  return { p, s };
}

describe("accumulate — one finalized day into empty carry", () => {
  const { p, s } = sampleDay();
  const c = accumulate(emptyCarry(3), p, s);

  test("head/assistant counts and totals", () => {
    expect(Array.from(c.H)).toEqual([1, 0, 1]);
    expect(Array.from(c.A)).toEqual([0, 1, 0]);
    expect(c.totalHead).toBe(2);
    expect(c.totalAsst).toBe(1);
  });

  test("four gender buckets and their totals", () => {
    expect(Array.from(c.HW)).toEqual([1, 0, 0]); // W head = ref0
    expect(Array.from(c.HM)).toEqual([0, 0, 1]); // M head = ref2
    expect(Array.from(c.AW)).toEqual([0, 1, 0]); // W asst = ref1
    expect(Array.from(c.AM)).toEqual([0, 0, 0]);
    expect([c.totalHW, c.totalHM, c.totalAW, c.totalAM]).toEqual([1, 1, 1, 0]);
  });

  test("pair matrices — only the Head+Asst match forms a pair", () => {
    expect(c.P).toBe(1);
    expect(c.po[0 * 3 + 1]).toBe(1); // ordered head0→asst1
    expect(c.po[1 * 3 + 0]).toBe(0); // reverse direction not counted
    expect(c.pu[0 * 3 + 1]).toBe(1); // unordered {0,1} keyed lo*N+hi
  });

  test("cumulative available rounds per ref", () => {
    expect(Array.from(c.avail)).toEqual([2, 2, 2]); // all available both rounds
  });
});

describe("accumulate — immutability + chaining", () => {
  test("base carry is not mutated", () => {
    const { p, s } = sampleDay();
    const base = emptyCarry(3);
    accumulate(base, p, s);
    expect(Array.from(base.H)).toEqual([0, 0, 0]);
    expect(base.totalHead).toBe(0);
    expect(base.P).toBe(0);
  });

  test("accumulating the same day twice doubles the counts", () => {
    const { p, s } = sampleDay();
    const c2 = accumulate(accumulate(emptyCarry(3), p, s), p, s);
    expect(Array.from(c2.H)).toEqual([2, 0, 2]);
    expect(c2.totalHead).toBe(4);
    expect(c2.P).toBe(2);
    expect(c2.po[0 * 3 + 1]).toBe(2);
    expect(Array.from(c2.avail)).toEqual([4, 4, 4]);
  });
});
