// End-to-end pipeline smoke (DOM-free). Drives the WHOLE chain the app runs at runtime, inside the
// Vitest harness, against the real federation export:
//
//   parseImport(sample.tsv)  ->  a roster is added (import never mints referees)  ->  for each day:
//     toProblem  ->  solve (greedy seed + SA, tiny budget)  ->  applySol back into the day  ->
//     finalize the day so the NEXT day's live carryover is real  ->  validate() === []  (hard-valid)
//   then  serialize -> JSON string round-trip -> deserialize  restores an identical Tournament.
//
// This is the integration proof for Task 11: import, model adapter, live carryover, the solver core,
// hard-constraint validation and persistence all interlock end to end. Component UI is validated
// visually (see docs/build/e2e-checklist.md), not here.

import { describe, test, expect } from "vitest";
import { parseImport } from "./import/fixtures.ts";
import { toProblem, applySol } from "./model/adapter.ts";
import { carryoverFor } from "./model/carryover.ts";
import { solve } from "./domain/solver.ts";
import { validate } from "./domain/validate.ts";
import { serialize, deserialize } from "./persistence/serialize.ts";
import type { Tournament } from "./model/tournament.ts";
// Real federation artifact as a raw string via Vite ?raw (same source the import tests use).
import SAMPLE from "../docs/reference/federation-export-sample.tsv?raw";

// The sample runs up to 3 courts/round (<=6 duties); 8 available referees clears every round with slack.
const ROSTER_SIZE = 8;

// Add a roster and make everyone available every round on every day (mirrors the store's
// ensureAvailability). Import deliberately yields no referees, so the schedule is unsolvable until now.
function withRoster(t: Tournament, n: number): Tournament {
  for (let i = 0; i < n; i++) t.referees.push({ id: `ref-${i}`, name: `Ref ${i + 1}` });
  for (const day of t.days) for (const ref of t.referees) day.availability[ref.id] = null;
  return t;
}

describe("end-to-end pipeline — import → solve → apply → validate → persist round-trip", () => {
  const { tournament, errors } = parseImport(SAMPLE);
  withRoster(tournament, ROSTER_SIZE);

  // Solve every day in order, applying each so day N+1 sees day N's assignments as carryover.
  const dayValidation: string[][] = [];
  tournament.days.forEach((day, i) => {
    const { problem, map } = toProblem(tournament, i);
    const carry = carryoverFor(tournament, i);
    const result = solve(problem, carry, { budgetMs: 150, seed: 12345 });
    applySol(day, result.sol, map);
    // Re-derive from the mutated day to prove the model round-trip itself is hard-valid.
    const check = toProblem(tournament, i);
    dayValidation.push(validate(check.problem, check.sol));
  });

  const restored = deserialize(JSON.parse(JSON.stringify(serialize(tournament))));

  test("import reads the real sample with no row errors and produces days", () => {
    expect(errors).toEqual([]);
    expect(tournament.days.length).toBeGreaterThan(0);
    expect(tournament.referees).toHaveLength(ROSTER_SIZE);
  });

  test("every day solves to a hard-valid schedule (validate() === [])", () => {
    expect(dayValidation).toHaveLength(tournament.days.length);
    for (const problems of dayValidation) expect(problems).toEqual([]);
  });

  test("every match on every day ends up fully assigned", () => {
    for (const day of tournament.days)
      for (const round of day.rounds)
        for (const match of round.matches) {
          const asg = day.assignments.find((a) => a.matchId === match.id);
          expect(asg?.head.refId).not.toBeNull();
          if (match.requiresAssistant) expect(asg?.assistant?.refId).not.toBeNull();
        }
  });

  test("serialize → JSON round-trip → deserialize restores an identical Tournament", () => {
    expect(restored).toEqual(tournament);
  });
});
