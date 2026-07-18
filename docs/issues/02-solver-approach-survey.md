# 02 — Solver algorithm survey

Type: research
Status: resolved
Blocked by: none

## Question

Survey algorithmic approaches for assigning **Head + Assistant** referees to matches arranged in
**synchronized rounds across M courts** with **N referees** over a day (and 2 days with
carryover), honoring:

- **Hard:** one referee ≤ one match per round (across all courts); per-referee availability;
  pinned/locked assignments.
- **Soft, weighted (priority order):** ≤2 consecutive active duties (top), Head/Assistant
  balance, fine gender balance, pair variety, ≤3 consecutive sits, H→A back-to-back.

The current Excel tool uses **depth-first backtracking with an 8-second budget** for 1 court /
4 refs / ~16–18 matches (`src/vba/mod_Solver.bas`). The core question: **does backtracking scale
to N refs × M courts × rounds × 2 days, or is a different approach needed** — constraint
programming, ILP, greedy + local search / simulated annealing, or min-cost flow per round?

Capture: expected problem sizes (e.g. N=8–12, M=4–8, ~8–12 rounds/day), trade-offs of each
approach, what runs acceptably **in-browser (Web Worker)**, and a recommendation with references
to primary sources.

Use `/research`. Output: findings markdown under
`.scratch/web-referee-scheduler/research/` linked from this ticket. Feeds ticket 04.

## Answer

Full findings: [research/02-solver-approaches.md](../research/02-solver-approaches.md).

**Recommendation: greedy construction + simulated annealing / local search, pure TypeScript in
a Web Worker.**

- **Backtracking does not scale.** The Excel DFS is tuned for the trivial 1-court/4-ref case
  (~10^17 raw leaves at its 8 s budget); web sizes are ~10^46 (N=8, M=4) to ~10^104 (N=12, M=6)
  raw leaves. DFS is out.
- **Simulated annealing** is the mainstream approach for sports/referee scheduling: zero-
  dependency pure TS (no WASM, no cross-origin-isolation headers), and it reuses the existing
  `mod_Score.bas` penalty function directly as its objective. Pins = frozen cells; reshuffle =
  RNG reseed; incremental re-solve = warm start.
- **Min-cost flow / Hungarian** rejected as a standalone (per-round matching can't see cross-
  round constraints like the rest rule) but recommended as the **greedy-seed subroutine** feeding
  SA.
- **Optional exact polish behind a flag:** CP-SAT via `or-tools-wasm` (best quality + `AddHint`
  warm start, but pre-1.0, multi-MB, needs COOP/COEP headers) or MILP via `highs-js` (no headers
  needed, but the top-priority "≤2 consecutive" + squared-balance penalties are awkward to
  linearize). Note: COOP/COEP headers can't be set on GitHub Pages — interacts with the hosting
  choice; decide in ticket 04.

Decision to lock in ticket 04. All library/solver claims cited in the findings file.
