// PROTOTYPE — throwaway shell, PORTABLE core. Greedy seed + simulated annealing.
// The recommended approach from the solver survey (research/02-solver-approaches.md):
//   greedy round-by-round least-loaded seed  ->  SA over feasibility-preserving neighborhoods.
// Hard constraints (1 duty/ref/round, availability, head!=asst, pins) are preserved BY
// CONSTRUCTION — every move generator only emits feasible neighbors — so the search never
// leaves the feasible region and never needs penalty juggling for hard rules.

import type { Problem, Sol, Carry } from "./types.ts";
import { emptySol, cloneSol } from "./types.ts";
import { scoreDay } from "./score.ts";
import { makeRng, randInt, type Rng } from "./rng.ts";

// ---- Greedy seed -----------------------------------------------------------

// Round-by-round least-loaded. Heads picked before assistants. Pins respected. Idle refs pooled.
export function greedy(p: Problem, carry: Carry, rng: Rng, pins?: Sol): Sol {
  const s = pins ? cloneSol(pins) : emptySol(p.matches.length);
  const load = new Float64Array(p.N);
  for (let r = 0; r < p.N; r++) load[r] = carry.H[r] + carry.A[r];

  // Count pinned assignments into load up front for fair least-loaded picks.
  for (let m = 0; m < p.matches.length; m++) {
    if (s.headPin[m] && s.head[m] >= 0) load[s.head[m]]++;
    if (s.asstPin[m] && s.asst[m] >= 0) load[s.asst[m]]++;
  }

  for (let rd = 0; rd < p.R; rd++) {
    const used = new Set<number>();
    for (const m of p.roundMatches[rd]) {
      if (s.headPin[m] && s.head[m] >= 0) used.add(s.head[m]);
      if (s.asstPin[m] && s.asst[m] >= 0) used.add(s.asst[m]);
    }
    // Heads first, then assistants — heads are the scarce/priority slot.
    for (const wantAsst of [false, true]) {
      for (const m of p.roundMatches[rd]) {
        const mt = p.matches[m];
        if (!wantAsst) {
          if (s.headPin[m] || s.head[m] >= 0) continue;
          const pick = leastLoaded(p, rng, load, used, rd, -1);
          if (pick >= 0) {
            s.head[m] = pick;
            used.add(pick);
            load[pick]++;
          }
        } else {
          if (!mt.needA || s.asstPin[m] || s.asst[m] >= 0) continue;
          const pick = leastLoaded(p, rng, load, used, rd, s.head[m]);
          if (pick >= 0) {
            s.asst[m] = pick;
            used.add(pick);
            load[pick]++;
          }
        }
      }
    }
  }
  return s;
}

// Extract only the locked slots as a fresh seed. For Reshuffle: greedy keeps these and re-fills
// every other slot from scratch. (Passing the full schedule would freeze it — greedy skips any
// slot already filled, so unpinned slots must be cleared to -1 to be reassigned.)
export function pinsOnly(s: Sol): Sol {
  const out = emptySol(s.head.length);
  for (let m = 0; m < s.head.length; m++) {
    if (s.headPin[m]) {
      out.head[m] = s.head[m];
      out.headPin[m] = 1;
    }
    if (s.asstPin[m]) {
      out.asst[m] = s.asst[m];
      out.asstPin[m] = 1;
    }
  }
  return out;
}

function leastLoaded(p: Problem, rng: Rng, load: Float64Array, used: Set<number>, rd: number, ban: number): number {
  let best = -1;
  let bestLoad = Infinity;
  let ties = 0;
  for (let r = 0; r < p.N; r++) {
    if (r === ban || used.has(r) || !p.avail[r][rd]) continue;
    const l = load[r];
    if (l < bestLoad) {
      bestLoad = l;
      best = r;
      ties = 1;
    } else if (l === bestLoad) {
      ties++;
      if (rng() < 1 / ties) best = r; // reservoir tiebreak -> Reshuffle variety
    }
  }
  return best;
}

// ---- Simulated annealing ---------------------------------------------------

export interface Progress {
  elapsedMs: number;
  bestScore: number;
  iters: number;
}

export interface SolveOpts {
  budgetMs: number;
  seed: number;
  warmStart?: Sol; // incremental re-solve: anneal from here (low T0) instead of a fresh greedy seed
  pins?: Sol; // fresh (Reshuffle) seed with locked slots pre-filled; frozen through the anneal
  t0?: number;
  tEnd?: number;
  onProgress?: (p: Progress) => void; // periodic tick (worker → main); cadence = progressMs
  progressMs?: number; // min ms between onProgress ticks (default 120)
  shouldCancel?: () => boolean; // checked between iteration batches; true → stop, keep best-so-far
}

export interface SolveResult {
  sol: Sol;
  score: number;
  iters: number;
  accepts: number;
  ms: number;
  reason: "budget" | "cancelled"; // why the loop ended (worker's Done.reason)
}

export function solve(p: Problem, carry: Carry, opts: SolveOpts): SolveResult {
  const rng = makeRng(opts.seed);
  const warm = opts.warmStart !== undefined;
  const cur = warm ? cloneSol(opts.warmStart!) : greedy(p, carry, rng, opts.pins);
  let curScore = scoreDay(p, cur, carry).total;
  let best = cloneSol(cur);
  let bestScore = curScore;

  const t0 = opts.t0 ?? (warm ? 400 : 4000);
  const tEnd = opts.tEnd ?? 0.5;
  const progressMs = opts.progressMs ?? 120;
  const start = Date.now();
  let iters = 0;
  let accepts = 0;
  let lastProgress = 0;
  let reason: "budget" | "cancelled" = "budget";

  // Geometric cool re-derived from elapsed fraction so it tracks the wall-clock budget.
  while (true) {
    const elapsed = Date.now() - start;
    if (elapsed >= opts.budgetMs) break;
    // Cooperative cancel — checked between batches, returns best-so-far (never "no solution").
    if (opts.shouldCancel && opts.shouldCancel()) {
      reason = "cancelled";
      break;
    }
    // Progress tick on a time gate, not per-iteration (keeps the UI from thrashing).
    if (opts.onProgress && elapsed - lastProgress >= progressMs) {
      opts.onProgress({ elapsedMs: elapsed, bestScore, iters });
      lastProgress = elapsed;
    }
    const frac = elapsed / opts.budgetMs;
    const T = t0 * Math.pow(tEnd / t0, frac);

    for (let batch = 0; batch < 400; batch++) {
      const undo = proposeMove(p, cur, rng);
      if (!undo) continue;
      iters++;
      const newScore = scoreDay(p, cur, carry).total;
      const delta = newScore - curScore;
      if (delta <= 0 || rng() < Math.exp(-delta / T)) {
        curScore = newScore;
        accepts++;
        if (curScore < bestScore) {
          bestScore = curScore;
          best = cloneSol(cur);
        }
      } else {
        undo();
      }
    }
  }

  return { sol: best, score: bestScore, iters, accepts, ms: Date.now() - start, reason };
}

// ---- Neighborhood moves (each preserves all hard constraints) --------------

type Undo = () => void;

function proposeMove(p: Problem, s: Sol, rng: Rng): Undo | null {
  const roll = rng();
  if (roll < 0.45) return reassign(p, s, rng);
  if (roll < 0.7) return swapInRound(p, s, rng);
  if (roll < 0.85) return swapHeadAsst(p, s, rng);
  return swapCrossRound(p, s, rng);
}

// helper: is ref used anywhere in this round (optionally excluding one slot)?
function usedInRound(p: Problem, s: Sol, rd: number, ref: number, exceptM: number, exceptAsst: boolean): boolean {
  for (const m of p.roundMatches[rd]) {
    if (s.head[m] === ref && !(m === exceptM && !exceptAsst)) return true;
    if (s.asst[m] === ref && !(m === exceptM && exceptAsst)) return true;
  }
  return false;
}

// A) Reassign one non-pinned slot to another available ref not used in its round.
function reassign(p: Problem, s: Sol, rng: Rng): Undo | null {
  const m = randInt(rng, p.matches.length);
  const mt = p.matches[m];
  const asst = mt.needA && rng() < 0.5;
  if (asst ? s.asstPin[m] : s.headPin[m]) return null;
  const rd = mt.round;
  const partner = asst ? s.head[m] : mt.needA ? s.asst[m] : -1;
  // pick a candidate
  const cand: number[] = [];
  for (let r = 0; r < p.N; r++) {
    if (!p.avail[r][rd]) continue;
    if (r === partner) continue;
    if (usedInRound(p, s, rd, r, m, asst)) continue;
    cand.push(r);
  }
  if (cand.length === 0) return null;
  const nr = cand[randInt(rng, cand.length)];
  if (asst) {
    const old = s.asst[m];
    if (old === nr) return null;
    s.asst[m] = nr;
    return () => (s.asst[m] = old);
  } else {
    const old = s.head[m];
    if (old === nr) return null;
    s.head[m] = nr;
    return () => (s.head[m] = old);
  }
}

// B) Swap the refs of two non-pinned slots in the SAME round.
function swapInRound(p: Problem, s: Sol, rng: Rng): Undo | null {
  const rd = randInt(rng, p.R);
  const slots: Array<[number, boolean]> = [];
  for (const m of p.roundMatches[rd]) {
    if (!s.headPin[m] && s.head[m] >= 0) slots.push([m, false]);
    if (p.matches[m].needA && !s.asstPin[m] && s.asst[m] >= 0) slots.push([m, true]);
  }
  if (slots.length < 2) return null;
  const i = randInt(rng, slots.length);
  const j = randInt(rng, slots.length);
  if (i === j) return null;
  const [m1, a1] = slots[i];
  const [m2, a2] = slots[j];
  if (m1 === m2) return null; // head<->asst of one match is move C
  const r1 = a1 ? s.asst[m1] : s.head[m1];
  const r2 = a2 ? s.asst[m2] : s.head[m2];
  if (r1 === r2) return null;
  // Same round, each ref appeared once -> no new double-book; only head!=asst can break.
  if (conflicts(p, s, m1, a1, r2) || conflicts(p, s, m2, a2, r1)) return null;
  setSlot(s, m1, a1, r2);
  setSlot(s, m2, a2, r1);
  return () => {
    setSlot(s, m1, a1, r1);
    setSlot(s, m2, a2, r2);
  };
}

// C) Swap Head<->Assistant on the same match.
function swapHeadAsst(p: Problem, s: Sol, rng: Rng): Undo | null {
  const m = randInt(rng, p.matches.length);
  if (!p.matches[m].needA) return null;
  if (s.headPin[m] || s.asstPin[m]) return null;
  const h = s.head[m];
  const a = s.asst[m];
  if (h < 0 || a < 0 || h === a) return null;
  s.head[m] = a;
  s.asst[m] = h;
  return () => {
    s.head[m] = h;
    s.asst[m] = a;
  };
}

// D) Swap refs between two non-pinned slots in DIFFERENT rounds (cross-round mobility).
function swapCrossRound(p: Problem, s: Sol, rng: Rng): Undo | null {
  const m1 = randInt(rng, p.matches.length);
  const m2 = randInt(rng, p.matches.length);
  const rd1 = p.matches[m1].round;
  const rd2 = p.matches[m2].round;
  if (rd1 === rd2) return null;
  const a1 = p.matches[m1].needA && rng() < 0.5;
  const a2 = p.matches[m2].needA && rng() < 0.5;
  if (a1 ? s.asstPin[m1] : s.headPin[m1]) return null;
  if (a2 ? s.asstPin[m2] : s.headPin[m2]) return null;
  const r1 = a1 ? s.asst[m1] : s.head[m1];
  const r2 = a2 ? s.asst[m2] : s.head[m2];
  if (r1 < 0 || r2 < 0 || r1 === r2) return null;
  // Availability in the destination rounds.
  if (!p.avail[r1][rd2] || !p.avail[r2][rd1]) return null;
  // No double-book in the destination rounds (excluding the slot each leaves).
  if (usedInRound(p, s, rd2, r1, m2, a2)) return null;
  if (usedInRound(p, s, rd1, r2, m1, a1)) return null;
  // head!=asst within each match after swap.
  if (conflicts(p, s, m1, a1, r2) || conflicts(p, s, m2, a2, r1)) return null;
  setSlot(s, m1, a1, r2);
  setSlot(s, m2, a2, r1);
  return () => {
    setSlot(s, m1, a1, r1);
    setSlot(s, m2, a2, r2);
  };
}

// Would placing `ref` in slot (m, asst) collide with the same match's other slot?
function conflicts(p: Problem, s: Sol, m: number, asst: boolean, ref: number): boolean {
  if (!p.matches[m].needA) return false;
  const other = asst ? s.head[m] : s.asst[m];
  return other === ref;
}
function setSlot(s: Sol, m: number, asst: boolean, ref: number): void {
  if (asst) s.asst[m] = ref;
  else s.head[m] = ref;
}
