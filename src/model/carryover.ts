// Live carryover for a target day: fold every FINALIZED day before it into a cumulative domain
// Carry (domain-model.md §Carryover — assignments are the single source of truth, carryover is never
// stored). Accumulation is commutative summation over each finalized day's (Problem, Sol); refs
// absent from a day contribute nothing (zero avail, no assignments).

import type { Carry } from "../domain/types.ts";
import { emptyCarry } from "../domain/types.ts";
import { accumulate } from "../domain/carry.ts";
import type { Tournament } from "./tournament.ts";
import { toProblem } from "./adapter.ts";

export function carryoverFor(t: Tournament, dayIndex: number): Carry {
  let carry = emptyCarry(t.referees.length);
  t.days.forEach((day, i) => {
    if (day.status !== "finalized" || day.index >= dayIndex) return;
    const { problem, sol } = toProblem(t, i);
    carry = accumulate(carry, problem, sol);
  });
  return carry;
}
