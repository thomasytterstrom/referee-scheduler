// Task 9 — the solve state machine (issues/07-solve-progress-ui.md). Framework-light hook: it owns
// the worker lifecycle and drives the blocking Generate modal. Flow:
//   idle ─(start)→ precheck (main thread, synchronous)
//        ├─ fail → { phase:"error" } (no worker spawned)
//        └─ ok   → { phase:"solving" }, spawn worker, post SolveReq
//              ├─ progress → pushed to the modal's ticker (subscribeTicker, patched in place)
//              ├─ cancel   → postMessage({type:"cancel"}); still awaits the final Done
//              └─ done     → wait max(0, 600 − sinceOpened) ms, applySolution, close, warn-if-bent.
// The ticker is delivered through a tiny pub/sub (not React state) so a solve's progress ticks re-render
// only the modal, never the whole wizard/grid.

import { useCallback, useEffect, useRef, useState } from "react";
import { toProblem, type RefIndexMap } from "../../model/adapter.ts";
import { carryoverFor } from "../../model/carryover.ts";
import { feasibility } from "../../domain/validate.ts";
import type { Problem } from "../../domain/types.ts";
import type { Day } from "../../model/tournament.ts";
import type { CancelReq, DoneMsg, OutMsg, SolveReq } from "../../solver/protocol.ts";
import { useStore } from "../state/store.tsx";

export type SolveMode = "generate" | "reshuffle";

export interface Ticker {
  bestScore: number;
  iters: number;
  elapsedMs: number;
}

// A round whose duty demand exceeds available referees — the precheck hard-fail unit.
export interface PrecheckFailure {
  time?: string; // round start time; falls back to the round number label
  round: number; // 1-based round number
  demand: number;
  available: number;
}

export type SolveState =
  | { phase: "idle" }
  | { phase: "solving" }
  | { phase: "error"; failures: PrecheckFailure[] };

export interface LastRun {
  bent: boolean; // a soft fairness rule (rest / Head / Assistant balance) was forced off target
  reason: "budget" | "cancelled";
}

export interface SolveController {
  state: SolveState;
  lastRun: LastRun | null;
  start(mode: SolveMode): void;
  cancel(): void;
  dismiss(): void; // dismiss the precheck-error modal
  subscribeTicker(cb: (t: Ticker) => void): () => void;
}

const MIN_DISPLAY_MS = 600;
const BUDGET_MS = 2000;

// Per-round demand vs available refs, for the error banner. Mirrors validate.feasibility's counting
// but yields structured, labelled instances (feasibility itself only returns the boolean gate).
function roundBlockers(problem: Problem, day: Day): PrecheckFailure[] {
  const out: PrecheckFailure[] = [];
  for (let rd = 0; rd < problem.R; rd++) {
    let demand = 0;
    for (const m of problem.roundMatches[rd]) demand += problem.matches[m].needA ? 2 : 1;
    let available = 0;
    for (let r = 0; r < problem.N; r++) if (problem.avail[r][rd]) available++;
    if (demand > available) {
      const round = day.rounds.find((x) => x.index === rd);
      out.push({ time: round?.startTime, round: rd + 1, demand, available });
    }
  }
  return out;
}

export function useSolveController(): SolveController {
  const store = useStore();
  const storeRef = useRef(store);
  storeRef.current = store;

  const [state, setState] = useState<SolveState>({ phase: "idle" });
  const [lastRun, setLastRun] = useState<LastRun | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const openedAtRef = useRef(0);
  // Captured at start so applying the result is unaffected by later day-switches (the modal blocks them).
  const applyRef = useRef<{ dayIndex: number; map: RefIndexMap } | null>(null);
  const listeners = useRef(new Set<(t: Ticker) => void>());

  const teardown = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const finish = useCallback((msg: DoneMsg) => {
    const wait = Math.max(0, MIN_DISPLAY_MS - (Date.now() - openedAtRef.current));
    window.setTimeout(() => {
      const apply = applyRef.current;
      if (apply) storeRef.current.applySolution(apply.dayIndex, msg.sol, apply.map);
      const b = msg.breakdown;
      setLastRun({ bent: b.rest > 0 || b.hbal > 0 || b.abal > 0, reason: msg.reason });
      setState({ phase: "idle" });
      teardown();
    }, wait);
  }, [teardown]);

  const start = useCallback(
    (mode: SolveMode) => {
      const { tournament, dayIndex } = storeRef.current;
      const day = tournament.days[dayIndex];
      if (!day) return;

      const { problem, sol, map } = toProblem(tournament, dayIndex);

      // Synchronous precheck on the main thread — a round short of refs never reaches the worker.
      if (!feasibility(problem).ok) {
        setState({ phase: "error", failures: roundBlockers(problem, day) });
        return;
      }

      setLastRun(null); // clear any prior warn banner until this run resolves
      openedAtRef.current = Date.now();
      applyRef.current = { dayIndex, map };
      setState({ phase: "solving" });

      const worker = new Worker(new URL("../../solver/solver.worker.ts", import.meta.url), {
        type: "module",
      });
      workerRef.current = worker;
      worker.onmessage = (e: MessageEvent<OutMsg>) => {
        const msg = e.data;
        if (msg.type === "progress") {
          const tick: Ticker = { bestScore: msg.bestScore, iters: msg.iters, elapsedMs: msg.elapsedMs };
          listeners.current.forEach((l) => l(tick));
        } else {
          finish(msg);
        }
      };

      // Generate = anneal from the current schedule (pins held); Reshuffle = fresh seed, no warm start.
      const req: SolveReq = {
        type: "solve",
        problem,
        carry: carryoverFor(tournament, dayIndex),
        sol,
        opts: { budgetMs: BUDGET_MS, seed: Date.now() >>> 0, warmStart: mode === "generate" },
      };
      worker.postMessage(req);
    },
    [finish],
  );

  const cancel = useCallback(() => {
    const req: CancelReq = { type: "cancel" };
    workerRef.current?.postMessage(req); // cooperative — the worker still emits a final Done
  }, []);

  const dismiss = useCallback(() => setState({ phase: "idle" }), []);

  const subscribeTicker = useCallback((cb: (t: Ticker) => void) => {
    listeners.current.add(cb);
    return () => {
      listeners.current.delete(cb);
    };
  }, []);

  useEffect(() => teardown, [teardown]);

  return { state, lastRun, start, cancel, dismiss, subscribeTicker };
}
