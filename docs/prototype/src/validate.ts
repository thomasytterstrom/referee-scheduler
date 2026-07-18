// PROTOTYPE — throwaway shell, PORTABLE core. Hard-constraint checker + feasibility precheck.
// Hard rules (constraint-spec.md): 1 duty/ref/round, availability, head!=asst, all slots filled.

import type { Problem, Sol } from "./types.ts";

export function validate(p: Problem, s: Sol): string[] {
  const problems: string[] = [];

  // All required slots filled.
  for (let m = 0; m < p.matches.length; m++) {
    if (s.head[m] < 0) problems.push(`match ${m}: head unassigned`);
    if (p.matches[m].needA && s.asst[m] < 0) problems.push(`match ${m}: assistant unassigned`);
    if (p.matches[m].needA && s.head[m] >= 0 && s.head[m] === s.asst[m])
      problems.push(`match ${m}: head === assistant (${s.head[m]})`);
  }

  // Availability.
  for (let m = 0; m < p.matches.length; m++) {
    const rd = p.matches[m].round;
    const h = s.head[m];
    const a = s.asst[m];
    if (h >= 0 && !p.avail[h][rd]) problems.push(`match ${m}: head ${h} unavailable round ${rd}`);
    if (a >= 0 && !p.avail[a][rd]) problems.push(`match ${m}: asst ${a} unavailable round ${rd}`);
  }

  // One duty per ref per round (across all courts).
  for (let rd = 0; rd < p.R; rd++) {
    const seen = new Map<number, number>();
    for (const m of p.roundMatches[rd]) {
      for (const ref of [s.head[m], s.asst[m]]) {
        if (ref < 0) continue;
        if (seen.has(ref)) problems.push(`round ${rd}: ref ${ref} double-booked`);
        seen.set(ref, m);
      }
    }
  }

  return problems;
}

// Feasibility precheck: a round whose duty demand exceeds available refs is a HARD FAIL.
export function feasibility(p: Problem): { ok: boolean; failures: string[]; warnings: string[] } {
  const failures: string[] = [];
  const warnings: string[] = [];
  const slack: number[] = [];
  for (let rd = 0; rd < p.R; rd++) {
    let demand = 0;
    for (const m of p.roundMatches[rd]) demand += p.matches[m].needA ? 2 : 1;
    let avail = 0;
    for (let r = 0; r < p.N; r++) if (p.avail[r][rd]) avail++;
    if (demand > avail) failures.push(`round ${rd}: demand ${demand} > available refs ${avail}`);
    slack.push(avail - demand);
  }
  // Warn: no rest slack across >=3 consecutive rounds (rest rule likely forced to bend).
  let run = 0;
  for (let rd = 0; rd < p.R; rd++) {
    if (slack[rd] <= 0) {
      run++;
      if (run >= 3) {
        warnings.push(`rounds ${rd - run + 1}..${rd}: zero rest slack (rest rule may bend)`);
      }
    } else run = 0;
  }
  return { ok: failures.length === 0, failures, warnings };
}
