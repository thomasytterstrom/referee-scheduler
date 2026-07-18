/// <reference lib="webworker" />
// Web Worker entry — the ONLY worker-aware file in the app. Thin glue: it wires the domain
// solver's progress/cancel hooks (domain/solver.ts) to the message protocol (protocol.ts) and
// keeps a cooperative-cancel flag. All scheduling logic lives in domain/ (pure, tested); nothing
// here needs the DOM, so the algorithm stays plain-callable in Vitest without a worker harness.
//
// Instantiate from the UI with Vite's worker-URL form:
//   new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" })

import { solve, pinsOnly, type SolveOpts } from "../domain/solver.ts";
import { scoreDay } from "../domain/score.ts";
import type { InMsg, OutMsg } from "./protocol.ts";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// Flag polled by the SA loop between iteration batches; a cancel arriving mid-solve flips it and
// the current solve() returns best-so-far with reason:"cancelled".
let cancelled = false;

function post(msg: OutMsg): void {
  ctx.postMessage(msg);
}

ctx.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;

  if (msg.type === "cancel") {
    cancelled = true;
    return;
  }

  // type === "solve"
  cancelled = false;
  const { problem, carry, sol, opts } = msg;

  const domainOpts: SolveOpts = {
    budgetMs: opts.budgetMs,
    seed: opts.seed,
    onProgress: (p) => post({ type: "progress", ...p }),
    shouldCancel: () => cancelled,
    // Generate = anneal from the current schedule; Reshuffle = fresh, but keep locked slots.
    ...(opts.warmStart ? { warmStart: sol } : { pins: pinsOnly(sol) }),
  };

  const res = solve(problem, carry, domainOpts);
  post({
    type: "done",
    sol: res.sol,
    score: res.score,
    breakdown: scoreDay(problem, res.sol, carry),
    reason: res.reason,
  });
};
