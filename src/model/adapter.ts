// Connective tissue between the rich Tournament graph and the flattened solver core. The domain
// speaks index arrays (Problem/Sol, src/domain/types.ts); the app speaks stable ids. Ref indices are
// TOURNAMENT-WIDE and stable (position in tournament.referees) so carryover accumulators line up
// across days.

import type { Tournament, Day, Match as TMatch } from "./tournament.ts";
import type { Problem, Sol, Match } from "../domain/types.ts";
import { emptySol } from "../domain/types.ts";

// refId <-> integer index, keyed on roster order (stable for the whole tournament).
export interface RefIndexMap {
  toIndex: Map<string, number>;
  toId: string[]; // toId[index] = refId
}

export interface DayProblem {
  problem: Problem;
  sol: Sol; // current day state mirrored into a Sol: assigned refIds -> indices + pin flags
  map: RefIndexMap;
}

export function refIndexMap(t: Tournament): RefIndexMap {
  const toId = t.referees.map((r) => r.id);
  const toIndex = new Map<string, number>();
  toId.forEach((id, i) => toIndex.set(id, i));
  return { toIndex, toId };
}

// Deterministic match order shared by toProblem/applySol so Sol arrays stay aligned: rounds in
// order, each round's matches in order, filtered to available courts (drops idle/excluded cells).
function orderedMatches(day: Day): Array<{ match: TMatch; round: number }> {
  const courts = new Set(day.availableCourtIds);
  const out: Array<{ match: TMatch; round: number }> = [];
  for (const round of day.rounds) {
    for (const match of round.matches) {
      if (courts.has(match.courtId)) out.push({ match, round: round.index });
    }
  }
  return out;
}

export function toProblem(t: Tournament, dayIndex: number): DayProblem {
  const day = t.days[dayIndex];
  const map = refIndexMap(t);
  const N = t.referees.length;
  const R = day.rounds.length;

  // Court index within the day = position in availableCourtIds.
  const courtIndex = new Map<string, number>();
  day.availableCourtIds.forEach((id, i) => courtIndex.set(id, i));

  const ordered = orderedMatches(day);
  const matches: Match[] = ordered.map(({ match, round }) => ({
    court: courtIndex.get(match.courtId)!,
    round,
    gender: match.gender === "W" ? 0 : 1,
    needA: match.requiresAssistant,
    matchNo: match.matchNo,
  }));

  const roundMatches: number[][] = Array.from({ length: R }, () => []);
  ordered.forEach((_, m) => roundMatches[matches[m].round].push(m));

  // availability -> avail Uint8Array per ref over the day's rounds.
  const avail: Uint8Array[] = t.referees.map((ref) => {
    const a = new Uint8Array(R);
    const spec = day.availability[ref.id];
    if (spec === undefined) return a; // absent -> unavailable this day
    if (spec === null) return a.fill(1); // present, unrestricted -> all rounds
    for (const rd of spec) if (rd >= 0 && rd < R) a[rd] = 1;
    return a;
  });

  const problem: Problem = { N, R, matches, avail, roundMatches };

  // Mirror the day's current assignments (incl. pins) into a Sol aligned with `matches`.
  const sol = emptySol(matches.length);
  ordered.forEach(({ match }, m) => {
    const asg = day.assignments.find((a) => a.matchId === match.id);
    if (!asg) return; // unsolved match -> slots stay empty (-1)
    const h = asg.head.refId;
    if (h !== null) sol.head[m] = map.toIndex.get(h) ?? -1;
    if (asg.head.pinned) sol.headPin[m] = 1;
    if (match.requiresAssistant && asg.assistant) {
      const a = asg.assistant.refId;
      if (a !== null) sol.asst[m] = map.toIndex.get(a) ?? -1;
      if (asg.assistant.pinned) sol.asstPin[m] = 1;
    }
  });

  return { problem, sol, map };
}

// Write a solved Sol back into the day's Assignments/Slots. Pinned flags are preserved (the solver
// never moved pinned slots, so writing their refId back is a no-op); assignments are created for any
// match that lacked one.
export function applySol(day: Day, sol: Sol, map: RefIndexMap): void {
  orderedMatches(day).forEach(({ match }, m) => {
    const asg = ensureAssignment(day, match);
    asg.head.refId = sol.head[m] >= 0 ? map.toId[sol.head[m]] : null;
    if (match.requiresAssistant) {
      if (!asg.assistant) asg.assistant = { refId: null, pinned: false };
      asg.assistant.refId = sol.asst[m] >= 0 ? map.toId[sol.asst[m]] : null;
    }
  });
}

function ensureAssignment(day: Day, match: TMatch): Day["assignments"][number] {
  let asg = day.assignments.find((a) => a.matchId === match.id);
  if (!asg) {
    asg = {
      matchId: match.id,
      head: { refId: null, pinned: false },
      assistant: match.requiresAssistant ? { refId: null, pinned: false } : null,
    };
    day.assignments.push(asg);
  }
  return asg;
}
