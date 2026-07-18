// PROTOTYPE — throwaway. Synthetic multi-day tournament generator (no sheet / file I/O).
// Analogous to VBA mod_Tests.MakeSyntheticMatches, generalized to N/M/R/days with availability.

import type { Problem, Match } from "./types.ts";
import { makeRng } from "./rng.ts";

export interface FixtureCfg {
  N: number; // roster size
  M: number; // courts per round
  R: number; // rounds per day
  days: number;
  needARate?: number; // fraction of matches needing an assistant (default 0.75)
  dropRefPerDay?: boolean; // make ref (dayIdx % N) absent that day -> tests differing rosters
  seed?: number;
}

export function makeTournament(cfg: FixtureCfg): Problem[] {
  const { N, M, R, days } = cfg;
  const needARate = cfg.needARate ?? 0.75;
  const rng = makeRng(cfg.seed ?? 1);
  const out: Problem[] = [];

  for (let d = 0; d < days; d++) {
    const matches: Match[] = [];
    for (let rd = 0; rd < R; rd++) {
      for (let ct = 0; ct < M; ct++) {
        matches.push({
          court: ct,
          round: rd,
          gender: rng() < 0.5 ? 0 : 1,
          needA: rng() < needARate,
          matchNo: `${d + 1}-${rd + 1}-${ct + 1}`,
        });
      }
    }

    // Availability: everyone all rounds, minus one absent ref per day if requested, minus a
    // couple of part-time refs (contiguous block) to exercise proportional targets.
    const avail: Uint8Array[] = [];
    const absent = cfg.dropRefPerDay ? d % N : -1;
    for (let r = 0; r < N; r++) {
      const a = new Uint8Array(R).fill(1);
      if (r === absent) a.fill(0);
      else if (r % 5 === 3 && R > 4) {
        // part-time: unavailable for the last ~third of the day
        for (let rd = Math.floor((R * 2) / 3); rd < R; rd++) a[rd] = 0;
      }
      avail.push(a);
    }

    const roundMatches: number[][] = Array.from({ length: R }, () => []);
    matches.forEach((m, i) => roundMatches[m.round].push(i));

    const p: Problem = { N, R, matches, avail, roundMatches };
    ensureFeasible(p);
    out.push(p);
  }
  return out;
}

// Guarantee every round's duty demand <= available refs by demoting some needA->false.
function ensureFeasible(p: Problem): void {
  for (let rd = 0; rd < p.R; rd++) {
    let avail = 0;
    for (let r = 0; r < p.N; r++) if (p.avail[r][rd]) avail++;
    const ms = p.roundMatches[rd];
    let demand = 0;
    for (const m of ms) demand += p.matches[m].needA ? 2 : 1;
    // Demote assistants until it fits (heads alone = ms.length, assumed <= avail by sizing).
    for (const m of ms) {
      if (demand <= avail) break;
      if (p.matches[m].needA) {
        p.matches[m].needA = false;
        demand--;
      }
    }
  }
}
