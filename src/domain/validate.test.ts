// Hard-constraint checker + feasibility precheck. Rules from constraint-spec.md §Hard constraints
// and §Validation preconditions.

import { describe, test, expect } from "vitest";
import { validate, feasibility } from "./validate.ts";
import { emptySol } from "./types.ts";
import type { Problem, Match, Sol } from "./types.ts";

function makeProblem(N: number, R: number, matches: Match[], avail?: Uint8Array[]): Problem {
  const roundMatches: number[][] = Array.from({ length: R }, () => []);
  matches.forEach((m, i) => roundMatches[m.round].push(i));
  const av = avail ?? Array.from({ length: N }, () => new Uint8Array(R).fill(1));
  return { N, R, matches, avail: av, roundMatches };
}

// N=4, R=2: match0 = Head+Asst round0 (0/1), match1 = Head-only round1 (2).
function validSetup(): { p: Problem; s: Sol } {
  const matches: Match[] = [
    { court: 0, round: 0, gender: 0, needA: true },
    { court: 0, round: 1, gender: 1, needA: false },
  ];
  const p = makeProblem(4, 2, matches);
  const s = emptySol(2);
  s.head[0] = 0;
  s.asst[0] = 1;
  s.head[1] = 2;
  return { p, s };
}

describe("validate — a hard-valid solution has no problems", () => {
  test("returns empty array", () => {
    const { p, s } = validSetup();
    expect(validate(p, s)).toEqual([]);
  });
});

describe("validate — detects each hard violation", () => {
  test("unassigned head", () => {
    const { p, s } = validSetup();
    s.head[0] = -1;
    expect(validate(p, s)).toContain("match 0: head unassigned");
  });

  test("unassigned assistant on a needA match", () => {
    const { p, s } = validSetup();
    s.asst[0] = -1;
    expect(validate(p, s)).toContain("match 0: assistant unassigned");
  });

  test("head === assistant on the same match", () => {
    const { p, s } = validSetup();
    s.asst[0] = 0;
    expect(validate(p, s)).toContain("match 0: head === assistant (0)");
  });

  test("ref assigned to a round it is unavailable for", () => {
    const matches: Match[] = [{ court: 0, round: 0, gender: 0, needA: false }];
    const avail = [new Uint8Array([0]), new Uint8Array([1]), new Uint8Array([1]), new Uint8Array([1])];
    const p = makeProblem(4, 1, matches, avail);
    const s = emptySol(1);
    s.head[0] = 0;
    expect(validate(p, s)).toContain("match 0: head 0 unavailable round 0");
  });

  test("one ref given two duties in the same round (across courts)", () => {
    const matches: Match[] = [
      { court: 0, round: 0, gender: 0, needA: false },
      { court: 1, round: 0, gender: 0, needA: false },
    ];
    const p = makeProblem(4, 1, matches);
    const s = emptySol(2);
    s.head[0] = 0;
    s.head[1] = 0; // same ref, same round, different court
    expect(validate(p, s)).toContain("round 0: ref 0 double-booked");
  });
});

describe("feasibility — demand vs available refs per round", () => {
  test("demand exceeding available refs is a hard fail naming the round", () => {
    // N=1, one Head+Asst match → demand 2 > 1 available.
    const p = makeProblem(1, 1, [{ court: 0, round: 0, gender: 0, needA: true }]);
    const f = feasibility(p);
    expect(f.ok).toBe(false);
    expect(f.failures).toContain("round 0: demand 2 > available refs 1");
  });

  test("enough refs → ok, no failures", () => {
    const p = makeProblem(4, 1, [{ court: 0, round: 0, gender: 0, needA: true }]);
    const f = feasibility(p);
    expect(f.ok).toBe(true);
    expect(f.failures).toEqual([]);
  });

  test("zero rest slack across ≥3 consecutive rounds → warn but still ok", () => {
    // N=2, 3 rounds each with a Head+Asst match → demand 2 == avail 2 → slack 0 throughout.
    const matches: Match[] = [
      { court: 0, round: 0, gender: 0, needA: true },
      { court: 0, round: 1, gender: 0, needA: true },
      { court: 0, round: 2, gender: 0, needA: true },
    ];
    const p = makeProblem(2, 3, matches);
    const f = feasibility(p);
    expect(f.ok).toBe(true);
    expect(f.warnings).toContain("rounds 0..2: zero rest slack (rest rule may bend)");
  });
});
