// Shared main↔worker message contract (solver-spec.md §Web Worker protocol, ticket 07 shapes).
// Imported by both the worker and the UI so the two sides never drift.

import type { Problem, Carry, Sol } from "../domain/types.ts";
import type { Score } from "../domain/score.ts";

// --- main → worker ---

export interface SolveReq {
  type: "solve";
  problem: Problem;
  carry: Carry;
  // Current schedule incl. pin flags. warmStart:true anneals from it (Generate/incremental);
  // warmStart:false reshuffles but keeps its locked slots (Reshuffle).
  sol: Sol;
  opts: { budgetMs: number; seed: number; warmStart: boolean };
}

export interface CancelReq {
  type: "cancel";
}

export type InMsg = SolveReq | CancelReq;

// --- worker → main ---

export interface ProgressMsg {
  type: "progress";
  elapsedMs: number;
  bestScore: number;
  iters: number;
}

export interface DoneMsg {
  type: "done";
  sol: Sol;
  score: number;
  breakdown: Score; // per-constraint penalties → warn banner + Warnings panel (ticket 09)
  reason: "budget" | "cancelled" | "converged";
}

export type OutMsg = ProgressMsg | DoneMsg;
