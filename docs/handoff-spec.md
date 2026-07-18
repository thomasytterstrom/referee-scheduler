# Web Referee Scheduler — Hand-off Spec

**Terminal deliverable** of the `web-referee-scheduler` planning effort (resolves ticket
[12 — Final spec assembly](issues/12-final-spec-assembly.md); closes the
[map](map.md)). This is the entry point a **build session** picks up. It does not restate the
detailed specs — each decision lives in exactly one file; this document stitches them into a
coherent whole, names the reading order, and draws the threads that cross spec boundaries.

Planning is done: every decision (tickets 01–11) is resolved. No code was produced this effort.
The app is built later, in a **new separate repo**, alongside the untouched Excel tool.

---

## 1. What you're building

A standalone **web app** that assigns **Head + Assistant referees** across a **variable named
roster** (N refs) and **variable named courts** (M courts) for a **K-day** beach-volley tournament
(K ≥ 1; MVP data is 2 days). It replaces the single-court / 4-referee Excel workbook (`Domarschema.xlsm`),
which stays as-is alongside. The federation match export is the input; the app does **not** build
the timetable — fixed start times are given.

- **Stack:** React + TypeScript + Vite, static SPA, GitHub Pages. **UI language: English.**
- **No backend, no accounts.** Local IndexedDB + JSON export/import. Solver in a Web Worker.
- **Conceptual source** for the constraint math: the existing VBA (`src/vba/mod_Score.bas`,
  `mod_Solver.bas`). **Port, don't copy** — rescale from fixed 4 refs / 1 court / 2 days to
  N refs / M courts / K days with synchronized rounds.

---

## 2. Reading order

Read top to bottom; each builds on the ones above it.

1. [domain-model.md](domain-model.md) — the data graph everything else operates on (Tournament →
   Referees, Courts, Days → Rounds → Matches → Assignments/Slots). **Read first.**
2. [constraint-spec.md](constraint-spec.md) — the scoring objective: six weighted, squared soft
   penalties + hard constraints + cross-day carryover + validation preconditions.
3. [solver-spec.md](solver-spec.md) — greedy seed → simulated annealing in a Web Worker; neighborhood,
   budget, incremental/reshuffle, worker protocol. Backed by [prototype/](prototype/) (`bun run bench`).
   Approach survey: [issues/02-solver-approach-survey.md](issues/02-solver-approach-survey.md).
4. [ui-spec.md](ui-spec.md) — guided wizard shell + dense round×court editing grid + per-referee
   review drawer.
5. [issues/07-solve-progress-ui.md](issues/07-solve-progress-ui.md) — the solve-progress **modal**
   and the exact worker↔UI message wiring + UI state machine.
6. [warnings-spec.md](warnings-spec.md) — the Review-drawer warnings panel: 3 severity tiers, which
   constraints surface, full English string catalogue.
7. [persistence-spec.md](persistence-spec.md) — one canonical `Tournament` shape across
   memory/IndexedDB/JSON; `.xlsx`/paste import with merge-on-re-import; autosave; JSON envelope +
   migration seam.
8. [print-spec.md](print-spec.md) — the three courtside print artifacts via `@media print`.
9. [issues/08-hosting-optional-wasm.md](issues/08-hosting-optional-wasm.md) — GitHub Pages host
   decision + the deferred, feature-flagged exact (WASM) solver.
10. [bootstrap-spec.md](bootstrap-spec.md) — how to stand the **new repo** up (name, toolchain,
    directory layout, CI/deploy, dependencies). **The build session's starting checklist.**

---

## 3. System architecture — how the pieces fit

One data graph, one objective, one flow. The pipeline:

```
 .xlsx / paste ──▶ import/fixtures.ts ──▶ ┌──────────────────────┐
                   (SheetJS, merge)       │  canonical Tournament │◀──▶ persistence
 manual Setup ───────────────────────────▶│  (domain model,       │     (IndexedDB library
                                          │   stable ids)         │      + JSON envelope)
                                          └───────────┬──────────┘
                                                      │ per day (solved independently)
                          precheck (main, sync) ──────┤
                                                      ▼
                                    solver/solver.worker.ts
                                    greedy seed ─▶ simulated annealing
                                    (objective = score.ts, the single
                                     source of truth; carryover live)
                                                      │ progress / done
                                                      ▼
                    ┌─────────────── UI (wizard: Setup▸Import▸Generate▸Review▸Export) ───────────────┐
                    │  Generate modal (07)   round×court grid   review drawer:                       │
                    │                        (pin/override)     per-ref timeline · fairness · warnings│
                    └───────────────────────────────────────────────────────┬────────────────────────┘
                                                                             ▼
                                                           print (@media print): wall grid ·
                                                           duty slips · call sheets
```

Module ↔ spec map (matches the [bootstrap layout](bootstrap-spec.md#3-directory-layout)):

| Module (`src/`) | Responsibility | Spec |
|---|---|---|
| `domain/` | `Tournament` graph, scoring, greedy+SA, validation, carryover, PRNG — **pure, DOM-free** | [domain-model](domain-model.md), [constraint-spec](constraint-spec.md), [solver-spec](solver-spec.md) |
| `solver/solver.worker.ts` | only worker-aware file; imports `domain/solver` | [solver-spec §Worker protocol](solver-spec.md), [ticket 07](issues/07-solve-progress-ui.md) |
| `import/` | SheetJS `.xlsx`/paste/csv → `Tournament`, merge-on-re-import | [persistence-spec §1](persistence-spec.md) |
| `persistence/` | serialize/migrate + IndexedDB library of N | [persistence-spec §2–3](persistence-spec.md) |
| `ui/wizard,grid,referee-view,warnings` | shell + editing surface + review drawer | [ui-spec](ui-spec.md), [warnings-spec](warnings-spec.md), [ticket 07](issues/07-solve-progress-ui.md) |
| `ui/print/` | `@media print` layouts | [print-spec](print-spec.md) |
| `i18n/en.json` | string catalogue, named placeholders | translation-readiness note ([map Notes](map.md)) |

---

## 4. Cross-cutting threads (the load-bearing invariants)

These span multiple specs — hold them across the whole build:

- **Stable-id identity.** Referees/Courts/Matches/Days key on a stable `id`, never `name`. Renames
  never break carryover, pair history, storage, or per-ref color. (Domain model; persistence.)
- **Carryover is always recomputed, never stored.** Derived live from finalized days' assignments on
  load. Editing a finalized day recomputes it and flags dependents possibly-stale. (Domain; constraints;
  persistence.)
- **One objective, reused everywhere.** `score.ts` is the single source of truth — the greedy seed,
  the SA accept test, and the warnings panel all read the same per-constraint breakdown. (Constraints;
  solver; warnings.)
- **Hard vs soft split.** Hard constraints (one duty per ref per round; availability; pins;
  Head≠Assistant; W/M) are enforced **by construction** — the SA neighborhood never leaves the feasible
  region, so hard rules carry no penalty weight. Soft constraints are weighted **squared** deviations;
  **rest rule (w=5000) dominates** and bends only when physically forced. (Constraints; solver.)
- **Rescale, never hardcode.** Everything scales from the Excel tool's fixed 4 refs / 1 court / 2 days
  to N/M/K. Balance & gender targets are **availability-proportional**; pair caps are `ceil(P/pairs)`
  formulas. Do not reintroduce the hardcoded `4`. (Constraints; solver.)
- **English string catalogue with named placeholders** (`{ref}`, `{time}`) — never concatenated
  fragments — so a future `sv.json` is a mechanical swap. i18n itself is out of scope. (Map Notes;
  warnings-spec; bootstrap §5.)
- **No "solver" in any user-facing string** — anchor to the **Generate** verb. (Warnings-spec.)
- **Host-portable static SPA.** Only Pages-specific config is `base:'/referee-scheduler/'`; a move to
  Netlify/Cloudflare is hours, not a rewrite. (Hosting ticket 08; bootstrap.)

---

## 5. Build sequence

Follow [bootstrap-spec.md](bootstrap-spec.md) as the checklist. Order:

1. **Stand up the repo** — public `referee-scheduler`, MIT, `npm create vite@latest -- --template
   react-ts`, `.nvmrc` = `22`, `base:'/referee-scheduler/'`, `deploy.yml` (Pages via Actions, gated on
   Vitest + `tsc --noEmit`).
2. **Copy `prototype/src/` → `src/domain/` 1:1** (`types score solver validate carry rng`) and harden
   in place under **Vitest** — this is the already-written VBA→TS rewrite, kept DOM-free.
3. **Wrap the worker** — `solver/solver.worker.ts` imports `domain/solver`; wire the message protocol
   ([solver-spec](solver-spec.md) + [ticket 07](issues/07-solve-progress-ui.md)).
4. **Import** (`import/fixtures.ts`, SheetJS from the official CDN tarball) → canonical `Tournament`.
5. **Persistence** (`persistence/`) — serialize/migrate + IndexedDB library.
6. **UI** — wizard shell, round×court grid, review drawer, Generate modal, warnings panel, print views.
7. Everything gated in CI; deploy on push to `master`.

---

## 6. Deferrals & out of scope

Deferred (seam exists, not built for MVP):

- **Exact solver** — `highs-js` (MILP, no isolation headers) or `or-tools-wasm` (CP-SAT, needs
  COOP/COEP → constrains hosting). Behind a feature flag. SA is sufficient. ([Ticket 08](issues/08-hosting-optional-wasm.md).)
- **i18n / Swedish UI** — English-only MVP; catalogue + placeholder convention is the seam.
- **JSON schema migrations** — only v1 ships; the `migrate()` dispatch seam exists from day one.

Out of scope (ruled beyond this effort's destination — see [map](map.md#out-of-scope)):

- Backend / accounts / multi-user / sharing.
- Match timetable generation (fixed start times are input).
- Mixed-gender matches (W/M only).
- Native mobile app.
- Fancy PDF export (browser print only).

---

## 7. Spec index

| Area | Spec | Resolved ticket |
|---|---|---|
| Domain model | [domain-model.md](domain-model.md) | [01](issues/01-domain-model.md) |
| Solver approach survey | [research/02-solver-approaches.md](research/02-solver-approaches.md) | [02](issues/02-solver-approach-survey.md) |
| Constraints (N refs / M courts) | [constraint-spec.md](constraint-spec.md) | [03](issues/03-constraint-spec.md) |
| Solver decision + prototype | [solver-spec.md](solver-spec.md), [prototype/](prototype/) | [04](issues/04-solver-decision-prototype.md) |
| UI / UX | [ui-spec.md](ui-spec.md) | [05](issues/05-ui-ux-prototype.md) |
| Persistence & import/export | [persistence-spec.md](persistence-spec.md) | [06](issues/06-persistence-import-export.md) |
| Solve-progress modal + worker wiring | [issues/07-solve-progress-ui.md](issues/07-solve-progress-ui.md) | [07](issues/07-solve-progress-ui.md) |
| Hosting + deferred exact solver | [issues/08-hosting-optional-wasm.md](issues/08-hosting-optional-wasm.md) | [08](issues/08-hosting-optional-wasm.md) |
| Warnings panel | [warnings-spec.md](warnings-spec.md) | [09](issues/09-warnings-panel-contents.md) |
| Print / export views | [print-spec.md](print-spec.md) | [10](issues/10-print-export-view.md) |
| New-repo bootstrap | [bootstrap-spec.md](bootstrap-spec.md) | [11](issues/11-new-repo-bootstrap.md) |
