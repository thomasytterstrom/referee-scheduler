# 02 — Solver approach survey for the web referee scheduler

Research findings for ticket `.scratch/web-referee-scheduler/issues/02-solver-approach-survey.md`.
Feeds ticket 04.

## TL;DR / Recommendation

**Recommended: greedy construction + local search / simulated annealing (SA), written in pure
TypeScript, running in a Web Worker.** Keep an exact solver (CP-SAT via `or-tools-wasm`, or MILP via
`highs-js`) as an optional "polish" backend behind a feature flag, but do **not** make it the
critical path.

Rationale in one paragraph:

- **Backtracking does not scale.** The current Excel DFS is tuned for the *trivial* 1-court / 4-ref
  case (~10^17 raw leaves, and even there it needs an 8 s budget and a pruning lower bound). At the
  stated web sizes the raw search tree is ~10^46 (N=8, M=4, 10 rounds) to ~10^104 (N=12, M=6, 12
  rounds) leaves — see the size analysis below. The 8 s budget would return a barely-improved
  locks-only seed, not a good schedule.
- **Local search / SA is the mainstream answer** for exactly this class (sports/referee assignment,
  round-robin timetabling) and is trivially implementable in pure TS with zero dependencies, zero
  WASM, zero cross-origin-isolation headaches. It gives fast "good enough" solutions, degrades
  gracefully under a time budget, and handles the incremental re-solve + reshuffle requirements
  cleanly (freeze pinned cells; reseed the RNG).
- **The soft-constraint model already in `mod_Score.bas` is an SA objective function.** The existing
  weighted penalty (H/A balance, fine gender, pair variety, long-sit, H→A) *is* the energy function
  SA minimizes. Porting it is near-direct; SA replaces only the *search*, not the *scoring*.
- **Exact solvers are viable in-browser but carry real friction** (multi-MB WASM download, and
  multithreading needs `SharedArrayBuffer` / cross-origin isolation which static hosts like GitHub
  Pages can't set without a hacky service-worker workaround). They are worth keeping as an optional
  quality upgrade, not a dependency for shipping.

Suggested concrete stack: **greedy seed (round-by-round least-loaded, or per-round Hungarian
matching) → simulated annealing over swap/move neighborhoods, objective = ported `Score_Total`,
wall-clock budget, best-so-far returned on timeout.** Optionally offer a "Solve to optimality
(slow)" button wired to `highs-js` (MILP) or `or-tools-wasm` (CP-SAT) for users who want a proven
result and can tolerate the download + headers.

---

## The problem, restated for solver selection

- **Decision variables:** for each (round, court) match, choose a Head ref and an Assistant ref.
- **Hard constraints:**
  - one ref serves at most one match per round *across all courts* (a ref is Head XOR Assistant XOR
    idle in a given round);
  - per-ref availability;
  - pinned/locked assignments.
- **Feasibility floor:** a round with `M` active courts consumes `2M` distinct refs, so `2M ≤ N`
  must hold (with `M=8, N=8` there is no idle ref — very tight; with `M=4, N=8` the round is
  exactly saturated). This is worth validating up front regardless of solver choice.
- **Soft, weighted (priority order):** (1) ≤2 consecutive active duties before a rest — TOP;
  (2) Head/Assistant count balance; (3) fine gender balance (W/M) per role; (4) pair variety;
  (5) ≤3 consecutive idle rounds; (6) Head-then-Assist back-to-back preference.
- **Two days** with carryover of counts + pair history — this is just a longer horizon plus seeded
  starting statistics; it does not change solver class.
- **Sizes:** N=8–12 refs, M=4–8 courts, ~8–12 rounds/day.
- **Runtime:** in-browser Web Worker, TypeScript.
- **Workflow:** incremental re-solve around pins; reshuffle (reseed) for variation.

### Why the "rounds" structure matters

Unlike the current Excel model (matches in a chronological *sequence*, one court), the web problem is
a **grid**: rounds × courts, with a hard exclusivity coupling *within* a round (a ref can't be on two
courts at once) and soft coupling *across* rounds (consecutive-duty / consecutive-idle / pair
history / balance). This "within-round matching + cross-round fairness" structure is precisely what
breaks the simplest exact tricks (see min-cost flow, below) and what local search handles naturally.

---

## Size analysis: why backtracking is the wrong default

Model a full round as an ordered assignment of `2M` distinct role-slots (M Heads + M Assistants) to
`N` refs, i.e. `P(N, 2M) = N!/(N−2M)!` valid staffings per round, and multiply across `R` rounds for
the raw leaf count (before pruning):

| Case | refs/round used | assignments per round `P(N,2M)` | raw leaves `P(N,2M)^R` |
|------|-----------------|----------------------------------|-------------------------|
| Current Excel trivial (1 court, N=4, 16 matches) | 2 | 12 per match | ~1.85 × 10^17 |
| Web small: N=8, M=4, R=10 | 8 | ~4.03 × 10^4 | ~1.1 × 10^46 |
| Web mid: N=10, M=5, R=10 | 10 | ~3.63 × 10^6 | ~4.0 × 10^65 |
| Web large: N=12, M=6, R=12 | 12 | ~4.79 × 10^8 | ~1.5 × 10^104 |

(Computed with `P(n,k)=∏_{i=0}^{k-1}(n−i)`. With M=8 courts you need N≥16 refs, outside the stated
range, so M is effectively capped near N/2.)

The current DFS already needs an 8-second wall clock and a `Score_PartialPenalty` lower bound to cope
with ~10^17 leaves on the *trivial* case. The web cases are **29 to 87 orders of magnitude larger**.
Even excellent pruning cannot close that gap; a chronological DFS would spend the whole budget deep
in the first few rounds and return essentially the locks-only seed. **Backtracking is out as the
primary method.** (It remains a fine *exact* method for tiny inputs, e.g. a single very small round,
but that is not the target regime.)

---

## Per-approach analysis

### 1. Backtracking / DFS with pruning (the current approach)

- **What it is:** depth-first assignment of matches in order, prune branches whose partial penalty
  already exceeds the best complete solution; return best-on-timeout.
- **Scaling:** fails at target sizes (see table). Fine only for the trivial legacy case.
- **In-browser:** trivially pure TS, no deps. Already proven in VBA; a TS port is mechanical.
- **Incremental / reshuffle:** already supported in the Excel version (locks seed `mBest`; RNG
  reseed shuffles equal-score buckets). These patterns port directly and are worth *reusing inside
  a better search*.
- **Verdict:** keep the *scoring* and the *lock/reseed* patterns; drop DFS as the primary search.

### 2. Simulated annealing / local search (RECOMMENDED primary)

- **What it is:** start from a feasible schedule (greedy or per-round matching), then repeatedly
  apply small moves — swap two refs within a round, move a ref between rounds, swap Head↔Assistant,
  reassign an idle ref — accepting improving moves always and worsening moves with probability
  `exp(−Δ/T)` as temperature `T` cools. Objective = the weighted penalty already in
  `mod_Score.bas`. Hard constraints are enforced by construction (only generate feasible neighbors),
  which keeps the search in the feasible region and avoids penalty juggling.
- **Scaling:** designed for large discrete spaces; runtime is controlled by iteration count, not by
  problem size explosion. Comfortably handles N=12 / M=6 / 24 rounds (2 days) within a few seconds.
  Simulated annealing "is often used when the search space is discrete" and "for problems where a
  fixed amount of computing resource is available, finding an approximate global optimum may be more
  relevant than … a precise local optimum" — an exact description of a time-budgeted in-browser
  scheduler. [SA / Wikipedia]
- **Domain fit:** this is the mainstream approach for sports/referee scheduling and round-robin
  timetabling. Surveys note "several approaches to sports scheduling problems make use of local
  search," and the referee-assignment literature uses local-search hybrids (ILS + embedded MIP).
  Course-timetabling competition winners use a construct → hill-climb → SA/Great-Deluge pipeline.
  [Referee Assignment in Sports Leagues; Hybrid ILS + MIP; Feature-based SA timetabling]
- **In-browser:** **best-in-class.** Pure TypeScript, zero dependencies, zero WASM, no
  cross-origin-isolation headers, runs in any Web Worker on any static host. Small bundle.
- **Incremental / reshuffle:** natural. Pins = frozen cells the neighborhood generator never
  touches; incremental re-solve = start SA from the current schedule (warm start) with pins frozen;
  reshuffle = new RNG seed and/or a burst of high-temperature moves. Cross-day carryover = seed the
  per-ref counters and pair-history matrix from day 1 before annealing day 2 (or anneal both days
  jointly).
- **Cost / risk:** no optimality guarantee; quality depends on neighborhood design and cooling
  schedule (tuning effort). Mitigate with multi-restart (cheap, and doubles as the reshuffle
  mechanism) and by reusing the already-tuned weights.
- **Verdict:** primary recommendation.

### 3. Constraint programming — CP-SAT via `or-tools-wasm`

- **What it is:** Google OR-Tools' CP-SAT, a hybrid CP + SAT + LP solver, is a natural fit for
  "scheduling, routing, assignment, and resource allocation." It finds good solutions fast then
  spends remaining time proving optimality — a profile well suited to a time budget. Supports warm
  starts via `model.AddHint` (variable-value hints), which maps directly onto incremental re-solve.
  Time-limited via `max_time_in_seconds`; returns `FEASIBLE` (valid, not proven optimal) vs
  `OPTIMAL`. [CP-SAT Primer; OR-Tools docs; CP-SAT rostering guides]
- **In-browser reality:** **exists and is real, but pre-1.0 and heavy.** `or-tools-wasm`
  (npm: `or-tools-wasm`, Apache-2.0) exposes CP-SAT, MPSolver (GLOP/CLP/GLPK/SCIP/CBC/BOP/SAT),
  routing, MathOpt, assignment, network-flow, RCPSP, etc., tested across Vite/Webpack/Rollup/
  Node/Deno/Bun and Chromium/Firefox. But: **v0.9.1, ~46 GitHub stars, single maintainer** — real
  supply-chain / longevity risk for a shipping tool. Critically, **browser builds "require
  cross-origin isolation headers for WebAssembly threads"** (`COOP: same-origin` +
  `COEP: require-corp`); without them "solving can fail during WebAssembly runtime or worker
  startup." GitHub Pages *cannot* set these headers natively; the workaround is a hacky
  `coi-serviceworker`, or hosting on Netlify/Cloudflare Pages (which support a `_headers` file).
  [or-tools-wasm repo; web.dev COOP/COEP; GitHub community #13309]
- **Scaling:** CP-SAT would crush these sizes if it runs — this is a *tiny* CP model. Quality and
  optimality guarantees far exceed SA.
- **Incremental / reshuffle:** incremental is excellent (`AddHint` warm start; fix pinned vars).
  Reshuffle is *awkward* — CP-SAT is deterministic toward the optimum, so "give me a different but
  equally good schedule" needs tricks (randomize the objective slightly, randomize search seed /
  worker order, or add no-good cuts against the last solution). Less natural than SA's reseed.
- **Cost / risk:** multi-MB WASM download; threading requires cross-origin isolation; pre-1.0
  single-maintainer dependency; deterministic-solution reshuffle friction.
- **Verdict:** strong optional "solve to optimality" backend; not the shipping default.

### 4. ILP / MILP — `highs-js` (npm `highs`) or `glpk.js`, pure-JS `javascript-lp-solver`

- **What it is:** encode the schedule as binary vars `x[round,court,ref,role]` with the exclusivity
  and availability constraints linear, and the soft penalties linearized in the objective. Solve
  with branch-and-cut.
- **In-browser reality:** **the most mature WASM option.** `highs-js` (npm `highs`) compiles the
  University of Edinburgh HiGHS solver (a top-tier open-source LP/MILP engine, Mittelmann-benchmark
  competitive) to WASM; "Web Assembly is much faster than a JS-based optimizer ever could be" and it
  "runs in browsers and is well-suited for Web Workers." `glpk.js` (WASM GLPK, JSON interface with
  `mipgap`/`tmlim` MIP controls) and the zero-dependency pure-JS `javascript-lp-solver` are
  alternatives; `lp-model` is a TS modeling wrapper that lets you swap HiGHS/GLPK/jsLPSolver
  backends. Single-threaded HiGHS/GLPK WASM does **not** require cross-origin isolation (unlike
  multithreaded CP-SAT), so it deploys more easily on a static host. [highs-js repo; HiGHS docs;
  glpk.js; javascript-lp-solver; lp-model]
- **Scaling:** feasible at these sizes, but the *modeling* is the pain point. The **top-priority
  "≤2 consecutive active duties" constraint and the quadratic-style balance/variety penalties are
  awkward to linearize** — consecutive-window constraints need extra indicator vars per
  (ref, window), and squared-deviation balance must be replaced by linear L1 deviations or
  piecewise-linear approximations. This inflates the model and loses the exact penalty shape the
  current tool uses. (HiGHS supports convex *quadratic objectives* but **not** integer + quadratic
  together, so the existing squared penalties can't be used verbatim with integer vars.)
- **Incremental / reshuffle:** incremental via fixing pinned vars is easy; MILP warm-starting in
  these WASM builds is weaker than CP-SAT's hints. Reshuffle has the same determinism problem as
  CP-SAT (perturb objective / add cuts).
- **Verdict:** viable and the easiest-to-deploy exact backend, but the linearization tax on the
  priority-1 consecutive-duty constraint and the loss of the squared penalty shape make it less
  attractive than CP-SAT for the exact route, and far heavier than SA for the default route.

### 5. Min-cost flow / Hungarian bipartite matching, per round

- **What it is:** each round is a min-cost assignment of refs → role-slots, solvable optimally in
  `O(n³)` by the Hungarian algorithm (the assignment problem is a special case of min-cost flow).
  Extremely fast per round.
- **Fatal limitation for this problem:** a per-round matching optimizes **each round in isolation**
  and has **no memory across rounds**. But *every* soft constraint here except gender balance is
  **cross-round**: ≤2 consecutive duties, ≤3 consecutive idle, pair variety over the day/two days,
  H→A back-to-back, and running H/A balance. "Real assignment/scheduling problems may include
  constraints not captured by the one-to-one assignment model (skills, shifts, precedence, fairness,
  … multi-period requirements)"; the remedy is "a broader optimization model (often ILP/MILP) …
  rather than Hungarian alone." [Hungarian/assignment references; calctypes guide]
- **Where it still helps:** as a **subroutine**, not the whole solver. Fold the cross-round penalties
  (based on the schedule *so far*) into each round's cost matrix and matching round-by-round — this
  is a strong **greedy seed generator** for SA (better than naive least-loaded). It can also be the
  "re-optimize one round with everything else frozen" large-neighborhood move inside local search.
- **Verdict:** not a standalone solver; excellent as the greedy-seed / repair subroutine feeding
  approach #2.

---

## In-browser feasibility summary

| Approach | Pure TS? | Bundle | Cross-origin isolation needed? | Static-host friendly? | Reshuffle | Incremental |
|----------|----------|--------|-------------------------------|------------------------|-----------|-------------|
| Backtracking | Yes | tiny | No | Yes | Yes (reseed) | Yes (locks) — but doesn't scale |
| **SA / local search** | **Yes** | **tiny** | **No** | **Yes** | **Native (reseed)** | **Native (warm start)** |
| CP-SAT (`or-tools-wasm`) | No (WASM) | multi-MB | **Yes** (threaded) | No (needs COOP/COEP) | Awkward | Excellent (`AddHint`) |
| MILP (`highs-js`) | No (WASM) | multi-MB | No (single-thread) | Yes-ish | Awkward | OK (fix vars) |
| Min-cost flow / Hungarian | Yes | tiny | No | Yes | N/A alone | N/A alone |

Key deployment fact: multithreaded WASM (CP-SAT's parallel workers) needs `SharedArrayBuffer`, which
needs cross-origin isolation (`COOP: same-origin` + `COEP: require-corp`). GitHub Pages cannot set
these headers; workarounds are a `coi-serviceworker` (described by practitioners as "very hacky") or
moving to Netlify/Cloudflare Pages. Single-threaded HiGHS/GLPK WASM avoids this. Pure-TS SA avoids
WASM entirely.

---

## Recommended architecture (feeds ticket 04)

1. **Feasibility precheck** (hard): `2M ≤ N` per round, availability leaves enough refs per round,
   pins are mutually consistent. Fail fast with a Swedish message, mirroring `mod_Validation.bas`.
2. **Objective module**: port `mod_Score.bas` (`Score_Total` + stat accumulation) to TS, generalized
   from the hardcoded 4 refs to N, and extended to the round/court grid and 2-day carryover. This is
   the single source of truth for solution quality, reused by every search.
3. **Greedy seed**: round-by-round least-loaded assignment, optionally a per-round Hungarian/min-cost
   matching whose cost matrix embeds the cross-round penalties accrued so far. Apply pins as fixed.
4. **Simulated annealing** over feasibility-preserving neighborhoods (within-round swap, cross-round
   move, Head↔Assistant swap, idle-ref reassign). Wall-clock budget; return best-so-far; multi-restart.
   Reseed RNG for reshuffle; warm-start from current schedule for incremental re-solve; freeze pinned
   cells throughout.
5. **Optional exact polish (feature-flagged)**: a "Solve to optimality (slower)" path using
   `highs-js` (MILP, no isolation headers, but linearize the consecutive-duty + balance penalties) or
   `or-tools-wasm` (CP-SAT with `AddHint` warm start — best quality, but multi-MB, pre-1.0, and needs
   cross-origin isolation on the host). Present only if the deployment target can carry it.

This keeps the shippable default lightweight and dependency-free while leaving a clear upgrade path to
proven-optimal solving if/when hosting and bundle-size budgets allow.

---

## References

Solvers & JS/WASM libraries
- or-tools-wasm (CP-SAT + MPSolver + routing in WASM, Apache-2.0, v0.9.1): https://github.com/Axelwickm/or-tools-wasm
- or-tools-wasm live examples: https://axelwickman.com/or-tools-wasm
- Compiling OR-Tools to WebAssembly (background): https://dev.to/pavkode/compiling-google-or-tools-to-webassembly-simplifies-browser-based-optimization-solvers-60k
- highs-js (HiGHS MILP/LP/QP in WASM, npm `highs`): https://github.com/lovasoa/highs-js
- HiGHS solver documentation: https://ergo-code.github.io/HiGHS/dev/
- glpk.js (GLPK in WASM, JSON MILP interface): https://github.com/jvail/glpk.js/
- javascript-lp-solver (pure-JS LP/MIP, zero deps, Web Worker capable): https://www.npmjs.com/package/javascript-lp-solver
- lp-model (TS modeling wrapper over highs-js / glpk.js / jsLPSolver): https://github.com/DominikPeters/lp-model
- kiwi.js (Cassowary constraint solver, TS — layout/continuous, not this problem): https://github.com/IjzerenHein/kiwi.js/

CP-SAT capabilities / scheduling
- CP-SAT solver (OR-Tools docs): https://developers.google.com/optimization/cp/cp_solver
- OR-Tools CP-SAT scheduling / time limit (`max_time_in_seconds`): https://developers.google.com/optimization/cp/cp_tasks
- The CP-SAT Primer (installation, behavior, hints/warm start): https://d-krupke.github.io/cpsat-primer/
- CP-SAT rostering guide: https://mbrenndoerfer.com/writing/cp-sat-rostering-constraint-programming-workforce-scheduling
- Nurse rostering in CP-SAT (Solver Max): https://www.solvermax.com/resources/models/staff-scheduling/nurse-rostering-in-or-tools-cp-sat-solver

Metaheuristics / local search for sports & referee scheduling
- Referee Assignment in Sports Leagues (survey; local search for round-robin): https://www.researchgate.net/publication/221559067_Referee_Assignment_in_Sports_Leagues
- A Hybrid ILS Heuristic to the Referee Assignment Problem with an Embedded MIP Strategy: https://link.springer.com/chapter/10.1007/978-3-540-75514-2_7
- A Pragmatic Approach for Solving the Sports Scheduling Problem (SA → CP/SAT improvement): https://www.patatconference.org/patat2022/proceedings/PATAT_2022_paper_21.pdf
- Simulated annealing (Wikipedia — discrete search space, fixed-budget rationale): https://en.wikipedia.org/wiki/Simulated_annealing
- Feature-based tuning of SA for curriculum-based course timetabling: https://arxiv.org/pdf/1409.7186
- Exact (MIP) vs metaheuristic (SA+local search) for bi-objective scheduling: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4503688/

Assignment / min-cost flow (per-round matching + its cross-round limitation)
- Hungarian algorithm (assignment = special case of min-cost flow): https://cp-algorithms.com/graph/hungarian-algorithm.html
- Assignment problem / limitations of one-to-one matching for multi-period constraints: https://calctypes.com/hungarian-algorithm-explained/

In-browser deployment constraints (WASM threads / SharedArrayBuffer)
- Cross-origin isolation with COOP & COEP (web.dev): https://web.dev/articles/coop-coep
- COEP header (MDN): https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy
- GitHub Pages cannot set COOP/COEP headers (community discussion): https://github.com/orgs/community/discussions/13309
