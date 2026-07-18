// Cumulative Head/Assistant duties + availability-proportional targets through a given day inclusive
// (carryoverFor folds days 0..dayIndex). Same target math as the solver's hbal/abal (score.ts):
// target = cumulative demand x (ref's cumulative available rounds / total cumulative available rounds).
// Pure model math — no presentation (colour is applied by the component). Only refs that have
// participated so far (avail > 0) appear, in roster order.

import type { Tournament } from "../../model/tournament.ts";
import { carryoverFor } from "../../model/carryover.ts";

export interface CumulativeRow {
  id: string;
  name: string;
  head: number; // cumulative Head duties through the day
  asst: number; // cumulative Assistant duties through the day
  targetHead: number;
  targetAsst: number;
}

export function cumulativeRows(tournament: Tournament, dayIndex: number): CumulativeRow[] {
  const carry = carryoverFor(tournament, dayIndex + 1);
  let sumAvail = 0;
  for (let r = 0; r < carry.N; r++) sumAvail += carry.avail[r];
  const rows: CumulativeRow[] = [];
  tournament.referees.forEach((ref, i) => {
    if (carry.avail[i] <= 0) return;
    const share = sumAvail > 0 ? carry.avail[i] / sumAvail : 0;
    rows.push({
      id: ref.id,
      name: ref.name,
      head: carry.H[i],
      asst: carry.A[i],
      targetHead: carry.totalHead * share,
      targetAsst: carry.totalAsst * share,
    });
  });
  return rows;
}
