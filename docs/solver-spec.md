# Solver Spec — Web Referee Scheduler

Resolves ticket [04 — Solver approach decision + prototype](issues/04-solver-decision-prototype.md).
Builds on [constraint-spec.md](constraint-spec.md) (objective) and [domain-model.md](domain-model.md)
(data). Decision validated by the throwaway [prototype/](prototype/) (`bun run bench`).

## Decision

**Greedy construction seed → simulated annealing (SA), pure TypeScript, in a Web Worker.** No WASM,
no dependencies, no cross-origin-isolation headers. Backtracking (the Excel approach) is rejected —
the search tree is 29–87 orders of magnitude larger at web sizes and it would return only the
locks-only seed within budget. The exact CP-SAT/MILP "solve to optimality" backend stays an
optional, feature-flagged upgrade (see Optional exact polish), **not** the shipping path.

Prototype confirmed all five acceptance questions on N=8–12 / M=4–8 / R=8–12 / 2 days: schedules are
hard-valid, penalty is minimized rest-first, it runs far inside budget, and incremental + reshuffle
both work. See the ticket `## Answer` for measured numbers.

## Architecture

Five modules; the objective is the single source of truth reused by every stage.

1. **Feasibility precheck** (hard, pre-solve). Per round, `demand = Σ (needA ? 2 : 1)` over its
   matches; **fail** (block solve, name the round) if `demand > available refs that round`. Also
   check pins are internally consistent. **Warn** (don't block) when demand equals available across
   ≥3 consecutive rounds — rest rule will be forced to bend. Mirrors `mod_Validation.bas`; replaces
   the crude global `N ≥ 2M`.
2. **Objective** (`score.ts`, ported from `mod_Score.bas` → `constraint-spec.md`). Weighted sum of
   squared penalties; availability-proportional cumulative targets; cross-day carryover. Returns the
   total **and** a per-constraint breakdown (drives the warnings panel).
3. **Greedy seed** (`greedy`). Round-by-round, heads before assistants, least-loaded ref (cumulative
   duty count incl. carryover) with a reservoir tiebreak. Pins pre-applied and counted into load.
   Produces a feasible starting schedule.
4. **Simulated annealing** (`solve`). Feasibility-preserving neighborhood; geometric cooling tracked
   to the wall-clock budget; accept improving moves always, worsening with `exp(−Δ/T)`; keep
   best-so-far. Returns best on timeout — never a "no solution" path.
5. **Optional exact polish** (feature-flagged, later). `highs-js` (MILP, single-thread, no isolation
   headers, but must linearize the rest/balance penalties) or `or-tools-wasm` (CP-SAT, best quality,
   but multi-MB + needs COOP/COEP → constrains hosting). Ships only if the deploy target can carry it.

## Neighborhood (all moves preserve every hard constraint by construction)

The search **never leaves the feasible region**, so hard rules need no penalty weight.

- **Reassign** — move one non-pinned slot to another available ref not already used that round.
- **Swap-in-round** — swap the refs of two non-pinned slots in the same round.
- **Head↔Assistant** — swap the two roles of one match.
- **Cross-round swap** — swap refs between two non-pinned slots in different rounds, guarded by
  availability + no double-book + head≠asst in each affected match.

Pinned slots are invisible to every generator → pins are immovable without special-casing.

## Time budget & convergence

- **Wall-clock budget, best-so-far returned on timeout** (same contract as the Excel solver, no
  failure path). Default **≈1–2 s** per day-solve.
- At the target sizes SA does **1.4M–2.3M iterations in 2 s** and **converges within ~100 ms**
  (measured: score is flat from a 100 ms to a 2 s budget). The budget exists for safety margin and
  larger-than-expected inputs, not because these sizes need it.
- Days solve **independently**; a finalized day's assignments seed the next day's carryover
  accumulators before annealing.

## Incremental re-solve & reshuffle

- **Incremental (warm start).** Re-solve starts SA from the *current* schedule with a low initial
  temperature and all pinned slots frozen — it repairs/improves around the pins rather than starting
  over. Measured: pins always held, result stays valid. This is the "edit the grid, re-Generate"
  workflow.
- **Reshuffle.** New RNG seed → fresh greedy seed + fresh anneal. Measured: 82–94 % of slots differ
  from the previous seed at a near-identical score — genuinely different, equally good schedules.
- **Determinism.** Seedable PRNG (mulberry32); a given seed reproduces a schedule exactly.

## Web Worker protocol (progress / cancel)

Solve runs off the main thread. Contract (details of the progress *UI* graduate to their own ticket):

- **main → worker**: `{ type: "solve", problem, carry, opts: { budgetMs, seed, warmStart? } }`;
  `{ type: "cancel" }`.
- **worker → main**: periodic `{ type: "progress", elapsedMs, bestScore, iters }` ticks (emit every
  N ms, not every iteration); terminal `{ type: "done", sol, score, breakdown }`.
- **Cancel** = cooperative: the SA loop checks a flag between iteration batches and returns
  best-so-far immediately. (In the prototype the loop already batches iterations between clock
  checks — the cancel flag drops into the same gate.)

## Ported from / rescaled

`mod_Score.bas` scoring shape and the lock/reseed patterns port directly. Everything rescales from
the Excel tool's fixed **4 refs / 1 court / 2 days** to **N refs / M courts / K days** with
synchronized rounds, per-round availability, and live cross-day carryover. Do not reintroduce the
hardcoded `4`.
