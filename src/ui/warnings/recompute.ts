// Main-thread per-instance recomputation for the warnings panel. The worker returns only the total
// + per-constraint Score breakdown; the actionable unit ("Anna, 14:00–15:00") is derived here from
// the day's solved schedule. Mirrors src/domain/score.ts term-for-term, but DAY-LOCAL: streak terms
// (rest/sits/H→A) are within-day by definition and match the scorer exactly; balance/gender/pair use
// day-local availability-proportional targets (exact for single-day tournaments, an approximation of
// the cumulative cross-day target otherwise — the Score breakdown stays the source of truth for
// whether a constraint surfaces).

import type { Tournament } from "../../model/tournament.ts";
import { t } from "../../i18n/t.ts";

export interface RestInstance {
  ref: string; // display name
  s: number; // streak length (rounds in a row on duty)
  t1: string; // first round label of the streak
  t2: string; // last round label
  forced: boolean; // every round in the window is saturated (demand == available)
}

export interface BalanceInstance {
  ref: string;
  k: number; // |rounded delta from target|
  over: boolean; // true = over target, false = under
}

export interface GenderInstance {
  ref: string;
  role: "head" | "assistant";
}

export interface PairInstance {
  refA: string; // head
  refB: string; // assistant
  count: number;
  cap: number;
}

export interface SitInstance {
  ref: string;
  k: number; // rounds resting in a row
  t1: string;
  t2: string;
}

export interface HaInstance {
  ref: string;
  t1: string;
  t2: string;
}

export interface DayDetail {
  rest: RestInstance[];
  head: BalanceInstance[];
  asst: BalanceInstance[];
  gender: GenderInstance[];
  pair: PairInstance[];
  sits: SitInstance[];
  ha: HaInstance[];
}

interface Stat {
  head: number;
  asst: number;
  HW: number;
  HM: number;
  AW: number;
  AM: number;
}

const ZERO: Stat = { head: 0, asst: 0, HW: 0, HM: 0, AW: 0, AM: 0 };

export function computeDetail(tournament: Tournament, dayIndex: number): DayDetail {
  const day = tournament.days[dayIndex];
  const empty: DayDetail = { rest: [], head: [], asst: [], gender: [], pair: [], sits: [], ha: [] };
  if (!day) return empty;

  const refs = tournament.referees;
  const nameOf = new Map(refs.map((r) => [r.id, r.name]));
  const R = day.rounds.length;
  const courts = new Set(day.availableCourtIds);

  // round index -> start time, for labels.
  const startAt = new Array<string | undefined>(R);
  for (const rd of day.rounds) startAt[rd.index] = rd.startTime;
  const label = (idx: number): string => startAt[idx] ?? t("common.round", { round: idx + 1 });

  const availSpec = (refId: string, rd: number): boolean => {
    const spec = day.availability[refId];
    if (spec === undefined) return false; // absent this day
    if (spec === null) return true; // unrestricted
    return spec.includes(rd);
  };

  const asgByMatch = new Map(day.assignments.map((a) => [a.matchId, a]));

  // Per-ref duty grid (0 none / 1 head / 2 asst), stats, ordered pair counts, per-round demand.
  const duty = new Map<string, Int8Array>();
  const dutyOf = (id: string): Int8Array => {
    let d = duty.get(id);
    if (!d) {
      d = new Int8Array(R);
      duty.set(id, d);
    }
    return d;
  };
  const stats = new Map<string, Stat>();
  const statOf = (id: string): Stat => {
    let st = stats.get(id);
    if (!st) {
      st = { head: 0, asst: 0, HW: 0, HM: 0, AW: 0, AM: 0 };
      stats.set(id, st);
    }
    return st;
  };
  const po = new Map<string, number>(); // `${headId}|${asstId}` -> count
  const demand = new Int32Array(R);

  for (const round of day.rounds) {
    for (const match of round.matches) {
      if (!courts.has(match.courtId)) continue;
      demand[round.index] += 1 + (match.requiresAssistant ? 1 : 0);
      const asg = asgByMatch.get(match.id);
      if (!asg) continue;
      const h = asg.head.refId;
      const a = match.requiresAssistant ? (asg.assistant?.refId ?? null) : null;
      if (h) {
        dutyOf(h)[round.index] = 1;
        const st = statOf(h);
        st.head++;
        if (match.gender === "W") st.HW++;
        else st.HM++;
      }
      if (match.requiresAssistant && a) {
        dutyOf(a)[round.index] = 2;
        const st = statOf(a);
        st.asst++;
        if (match.gender === "W") st.AW++;
        else st.AM++;
      }
      if (a && h) {
        const key = `${h}|${a}`;
        po.set(key, (po.get(key) ?? 0) + 1);
      }
    }
  }

  // Availability totals (target denominators) and per-round available head-count.
  const availCount = new Int32Array(R);
  const availRef = new Map<string, number>();
  let sumAvail = 0;
  for (const ref of refs) {
    let c = 0;
    for (let rd = 0; rd < R; rd++)
      if (availSpec(ref.id, rd)) {
        c++;
        availCount[rd]++;
      }
    availRef.set(ref.id, c);
    sumAvail += c;
  }

  // --- Balance + fine gender (day-local proportional targets) ----------------
  let totalHead = 0;
  let totalAsst = 0;
  let totHW = 0;
  let totHM = 0;
  let totAW = 0;
  let totAM = 0;
  for (const st of stats.values()) {
    totalHead += st.head;
    totalAsst += st.asst;
    totHW += st.HW;
    totHM += st.HM;
    totAW += st.AW;
    totAM += st.AM;
  }

  const head: BalanceInstance[] = [];
  const asst: BalanceInstance[] = [];
  const gender: GenderInstance[] = [];
  for (const ref of refs) {
    const share = sumAvail > 0 ? (availRef.get(ref.id) ?? 0) / sumAvail : 0;
    const st = stats.get(ref.id) ?? ZERO;
    const name = nameOf.get(ref.id) ?? ref.id;

    const kH = Math.round(st.head - totalHead * share);
    if (kH !== 0) head.push({ ref: name, k: Math.abs(kH), over: kH > 0 });
    const kA = Math.round(st.asst - totalAsst * share);
    if (kA !== 0) asst.push({ ref: name, k: Math.abs(kA), over: kA > 0 });

    if (st.head > 0 && (Math.abs(st.HW - totHW * share) > 0.5 || Math.abs(st.HM - totHM * share) > 0.5))
      gender.push({ ref: name, role: "head" });
    if (st.asst > 0 && (Math.abs(st.AW - totAW * share) > 0.5 || Math.abs(st.AM - totAM * share) > 0.5))
      gender.push({ ref: name, role: "assistant" });
  }

  // --- Pair variety (ordered over cap) ---------------------------------------
  let Neff = 0;
  for (const c of availRef.values()) if (c > 0) Neff++;
  let Pcum = 0;
  for (const v of po.values()) Pcum += v;
  const capO = Neff > 1 ? Math.ceil(Pcum / (Neff * (Neff - 1))) : Infinity;
  const pair: PairInstance[] = [];
  for (const [key, count] of po) {
    if (count > capO) {
      const [hId, aId] = key.split("|");
      pair.push({ refA: nameOf.get(hId) ?? hId, refB: nameOf.get(aId) ?? aId, count, cap: capO });
    }
  }

  // --- Streak terms: rest, sits, H→A back-to-back (per ref, within day) ------
  const rest: RestInstance[] = [];
  const sits: SitInstance[] = [];
  const ha: HaInstance[] = [];
  const EMPTY = new Int8Array(R);
  const forcedWindow = (start: number, end: number): boolean => {
    for (let rd = start; rd <= end; rd++) if (demand[rd] < availCount[rd]) return false;
    return true;
  };
  for (const ref of refs) {
    const d = duty.get(ref.id) ?? EMPTY;
    const name = nameOf.get(ref.id) ?? ref.id;
    let act = 0;
    let actStart = 0;
    let sit = 0;
    let sitStart = 0;
    for (let rd = 0; rd < R; rd++) {
      if (d[rd] > 0) {
        if (sit > 3) sits.push({ ref: name, k: sit, t1: label(sitStart), t2: label(rd - 1) });
        sit = 0;
        if (act === 0) actStart = rd;
        act++;
      } else {
        if (act > 2)
          rest.push({ ref: name, s: act, t1: label(actStart), t2: label(rd - 1), forced: forcedWindow(actStart, rd - 1) });
        act = 0;
        if (availSpec(ref.id, rd)) {
          if (sit === 0) sitStart = rd;
          sit++;
        } else {
          if (sit > 3) sits.push({ ref: name, k: sit, t1: label(sitStart), t2: label(rd - 1) });
          sit = 0;
        }
      }
    }
    if (act > 2)
      rest.push({ ref: name, s: act, t1: label(actStart), t2: label(R - 1), forced: forcedWindow(actStart, R - 1) });
    if (sit > 3) sits.push({ ref: name, k: sit, t1: label(sitStart), t2: label(R - 1) });
    for (let rd = 0; rd < R - 1; rd++)
      if (d[rd] === 1 && d[rd + 1] === 1) ha.push({ ref: name, t1: label(rd), t2: label(rd + 1) });
  }

  return { rest, head, asst, gender, pair, sits, ha };
}
