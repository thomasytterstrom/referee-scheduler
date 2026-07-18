# 04 — Solver approach decision + prototype

Type: prototype
Status: resolved
Blocked by: 02, 03

## Question

Using the survey (ticket 02) and the formalized constraints (ticket 03), **decide the solver
approach** and validate it with a throwaway prototype on realistic sizes (e.g. N = 8–12,
M = 4–8, ~8–12 rounds/day, 2 days with carryover).

Confirm the prototype:

- produces **valid** schedules honoring all hard constraints (one-ref-per-round, availability,
  pins),
- reasonably minimizes the weighted soft penalties (rest rule respected first),
- runs within an acceptable **in-browser (Web Worker)** time budget, and
- supports **incremental re-solve** around pinned assignments + a **reshuffle** (reseed) path.

Use `/prototype`. Output: chosen algorithm + prototype link + a spec section covering solver
design, time budget, and progress/cancel behavior.

## Answer

**Chosen algorithm: greedy least-loaded seed → simulated annealing, pure TypeScript, in a Web
Worker.** Full design in [solver-spec.md](../solver-spec.md). Backtracking rejected (tree 29–87
orders of magnitude too big at web sizes); CP-SAT/MILP kept as an optional feature-flagged "solve to
optimality" backend only.

**Prototype:** [prototype/](../prototype/) — throwaway, zero-dependency, runs on Bun. `bun run bench`
(measurement sweep) and `bun run tui` (drive it by hand). The `src/` modules (`score.ts`, `solver.ts`,
`validate.ts`, `carry.ts`, `types.ts`) are portable and lift into the real app; the `tui.ts`/`bench.ts`
shells are disposable. Captured in `.scratch/` (the tracker's scratch space, untracked by design) as
the primary source.

**All five acceptance questions confirmed** on N=8–12 / M=4–8 / R=8–12 / 2 days with carryover:

| Question | Result (measured, `bun run bench`) |
|---|---|
| Hard-valid schedules? | **Yes**, every case — hard constraints enforced by construction (moves only emit feasible neighbors). |
| Minimizes soft penalty, rest first? | **Yes** — where rest is satisfiable (`wide N12 M4`) SA drives rest→~0 and beats the greedy seed **87 %**; where physically forced (M≈N/2, every court busy every round) the precheck **warns** and rest is the residual, i.e. bent only when forced. |
| In-browser time budget? | **Yes, huge margin** — 1.4M–2.3M SA iters in 2 s pure TS; score is flat from a **100 ms** budget to 2 s, so it converges in <100 ms at these sizes. |
| Incremental re-solve around pins? | **Yes** — warm-start from current schedule, pins frozen; measured pins always **held**, result stays valid. |
| Reshuffle variation? | **Yes** — new seed differs in **82–94 %** of slots at near-identical score (many equivalent optima). |

**Spec deliverables** (in [solver-spec.md](../solver-spec.md)): solver architecture (precheck →
objective → greedy → SA → optional exact polish), neighborhood move set, wall-clock budget +
best-so-far-on-timeout contract, incremental/reshuffle mechanics, and the Web Worker
solve/progress/cancel message protocol.

**Follow-ups surfaced (now graduated to fog/tickets):** the detailed **solve-progress UI** and the
**hosting-vs-optional-WASM** decision (CP-SAT needs COOP/COEP headers GitHub Pages can't set) both
depend on this and are now specifiable.
