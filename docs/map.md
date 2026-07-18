# Web Referee Scheduler — Wayfinder Map

Labels: `wayfinder:map`

## Destination

A written **spec/plan** (no code this effort) for a new **standalone web app** — its own
separate repo — that assigns **Head + Assistant referees** across a **variable named roster**
and **variable named courts** for a 2-day beach-volley tournament, replacing the single-court /
4-referee Excel tool (which stays as-is, alongside).

The spec is done when the domain model, constraint rules, solver approach, UI, and
persistence/import format are each decided and assembled into a hand-off spec document a build
session can pick up. Every session orients to this before choosing a ticket.

## Notes

**Effort type:** planning. Produce decisions/spec, not code. The map lives in this repo's
`.scratch/` tracker; the app's code will go to a new separate repo (decided during charting).

**Skills to consult each session** (by ticket `Type:`): `/grilling` + `/domain-modeling`
(grilling tickets), `/prototype` (prototype tickets), `/research` (research tickets).

**Reference:** the existing VBA solver in `src/vba/` — especially `mod_Score.bas` (weighted
penalty constraints) and `mod_Solver.bas` (backtracking + 8s budget) — is the **conceptual**
source for the constraint math. Port, don't copy: it's a VBA→TS rewrite, and every rule
rescales from fixed **4 refs / 1 court** to **N refs / M courts** with synchronized rounds.

### Standing decisions (settled during charting grilling)

- **Destination artifact:** spec/plan only. Web app built later, in a **new separate repo**,
  **alongside** the untouched Excel tool.
- **Model:** shared pool of **N named referees**; **M named courts**; **synchronized rounds**;
  time = (day, round, court). Fixed match start times are **input** (app does not build the
  timetable). **Head + Assistant** per match; refs-per-match configurable.
- **Gender:** **W/M only**, per match.
- **Availability:** per-referee, per day/round; unavailable = hard "cannot assign".
- **Days:** solved **independently** (do day 1, decide day 2 later); roster may differ per day.
  **Carryover** of duty counts + pair history for refs present **both** days; one-day refs count
  only their own.
- **Constraint priority (new order):**
  1. **≤2 consecutive active duties** (Head or Assist), 1-slot rest resets — soft, **highest
     weight** (new #1)
  2. Head balance & Assistant balance
  3. Fine gender balance
  4. Pair variety (caps become formulas of N)
  5. ≤3 consecutive sits
  6. H→A back-to-back
  Hard: 1 referee ≤ 1 match per round (across all courts); availability; pins.
- **Workflow:** Generate (solve unlocked), Reshuffle (new seed), manual **pin/lock + override**
  on the grid. Pins are locks; incremental re-solve around them. In MVP.
- **Finals:** no special concept — folded into generic pinning; optional display-only tag.
- **Persistence:** local **IndexedDB** + **JSON export/import**. No backend/accounts. Solver in
  a **Web Worker**.
- **Input:** import (paste/upload TSV/CSV carrying court + ref names) **and** manual builder;
  import is fast-fill over the manual model.
- **Views (MVP):** round×court editable grid (primary) + per-referee view + summary stats +
  warnings panel (shows bent soft constraints).
- **Stack:** React + TypeScript + Vite, static hosting. **UI language: English.**
- **Translation-readiness (convention, not a feature):** i18n / Swedish UI stays **out of scope**
  (English-only MVP). But every user-facing string is a **catalogue entry with named placeholders**
  (`{ref}`, `{time}`) — never a concatenated fragment — so a later translation is a mechanical
  catalogue swap (`en.json`/`sv.json`), not a rewrite. Known deferrals for a future i18n effort:
  **pluralization** (`{n} referee(s)` is an English hack) and locale date formatting (times are
  `HH:MM`, already fine). Costs nothing now; expensive to retrofit.

## Decisions so far

<!-- one line per closed ticket: gist of the answer + link. Empty until tickets resolve. -->

- [Domain model](issues/01-domain-model.md) — tournament-wide Referee/Court rosters (stable
  `id` + mutable `name`); sparse per-day round×court grid; per-match `requiresAssistant` (Head
  always, Assistant 0/1); per-slot pinning; per-round availability; **variable** day list with
  reversible finalize + **live-computed** carryover. Full model:
  [domain-model.md](domain-model.md). Unblocks tickets 03, 05, 06.
- [Constraint spec for N refs / M courts](issues/03-constraint-spec.md) — rest rule new #1
  (w=5000, `(streak−2)²`, dominant not lexicographic); availability-**proportional** balance &
  gender targets; pair-variety caps as `ceil(P/pairs)` formulas; cumulative-target **carryover**;
  per-round demand feasibility replaces `N≥2M`. Full spec:
  [constraint-spec.md](constraint-spec.md). Unblocks ticket 04.
- [Solver algorithm survey](issues/02-solver-approach-survey.md) — greedy construction +
  **simulated annealing** in pure TS (Web Worker); backtracking doesn't scale to N×M×rounds;
  min-cost-flow as seed subroutine; optional CP-SAT/MILP polish behind a flag (CP-SAT WASM needs
  COOP/COEP headers GitHub Pages can't set — affects hosting). Locked in ticket 04. See
  [findings](research/02-solver-approaches.md).
- [Solver decision + prototype](issues/04-solver-decision-prototype.md) — **greedy seed → simulated
  annealing, pure TS in a Web Worker**, confirmed by a throwaway [prototype/](prototype/) (`bun run
  bench`): hard-valid always; converges <100ms at N≤12/M≤8/12 rounds (2s budget = huge margin);
  incremental pins held; reshuffle 82–94% different at equal score; rest bent only when physically
  forced (precheck warns). Exact CP-SAT/MILP kept optional/feature-flagged. Full design:
  [solver-spec.md](solver-spec.md). Graduated fog into tickets 07 + 08.
- [Hosting target + optional exact (WASM) solver decision](issues/08-hosting-optional-wasm.md) —
  **GitHub Pages** (repo already on GitHub; GitHub Actions build+deploy; Vite `base:'/<repo>/'`);
  exact CP-SAT/MILP backend **deferred out of MVP** (SA sufficient). No lock-in — `highs-js` MILP
  needs no headers if exact ever wanted; only threaded CP-SAT needs COOP/COEP → then move static
  build to Netlify/Cloudflare. Load-bearing: keep app a **host-portable static SPA**.
- [UI/UX prototype](issues/05-ui-ux-prototype.md) — **guided-wizard shell** (Setup→Import→Generate→
  Review→Export) + **dense round×court grid** as the Review editing surface (pin=🔒, override=ref
  dropdown) + **per-referee timeline + fairness bars + warnings** in a review drawer. Per-ref color by
  stable `id`; English. Chosen from a 3-variant mockup [prototype/ui-proto.html](prototype/ui-proto.html)
  (`bun run ui`). Full design: [ui-spec.md](ui-spec.md). Unblocked ticket 07; graduated tickets 09 + 10.
- [Persistence & import/export format](issues/06-persistence-import-export.md) — **one canonical
  `Tournament` shape** across memory/IndexedDB/JSON; **import = fixtures only** (`.xlsx`+paste via
  SheetJS); **round = distinct `Starttid` per day** (federation `Round` col = bracket codes,
  ignored); `Spelplats`→Court, `Klass` H/D→M/W, `Kamp Id` = stable merge key; **re-import merges by
  `Kamp Id`** preserving assignments/pins + flags moves; `requiresAssistant` default-true w/ per-
  round & per-court bulk toggle; **per-day court selection**; **IndexedDB library of N** +
  debounced autosave; **JSON envelope** `{schemaVersion:1,…}` w/ migration seam. Grounded on a real
  export [reference/federation-export-sample.tsv](reference/federation-export-sample.tsv). Full spec:
  [persistence-spec.md](persistence-spec.md). Graduated ticket 11 (new-repo bootstrap).
- [Print / export view](issues/10-print-export-view.md) — **ship all three** print artifacts (each
  one day): **master wall grid** (landscape, 1 page/day), **per-referee duty slips** (portrait, 2-up,
  cut-and-hand-out), **per-court call sheets** (portrait, 1 page/court, referee list only — no score
  column, app tracks no results) — different courtside roles, not competing designs. Print-safe: full name + id-color dot (`print-color-adjust:
  exact`), gender as text, ink-light. Header: tournament · day · generated-at. **Mechanism: `@media
  print` CSS over the Export views** + `window.print()`, `@page` orientation rewritten per artifact —
  no dedicated route (addable later, no lock-in). Chosen from a 3-variant mockup
  [prototype/print-proto.html](prototype/print-proto.html) (`bun run print`). Full spec:
  [print-spec.md](print-spec.md).
- [Solve-progress UI + Web Worker wiring](issues/07-solve-progress-ui.md) — **blocking modal over a
  dimmed, frozen Review grid** (spinner + live best/iters/elapsed ticker from `progress` msgs); grid
  updates **atomically on close**, never live-churns. **Cancel = keep best-so-far only** (one button;
  no discard/restore — a solve never returns nothing); **min modal display ≈600 ms** so a ~100 ms solve
  doesn't blink. Generate=`warmStart:true` (incremental), Reshuffle=new seed; **precheck runs
  synchronously on main before any `solve`** (fail → modal error state, no worker); budget-bent = normal
  `done` → warn banner + Warnings panel (09). Only solver-protocol delta: a `reason:"budget"|"cancelled"`
  field on `done`. Chosen from throwaway [prototype/progress-proto.html](prototype/progress-proto.html)
  (`bun run progress`). Full wiring in the ticket [07 answer](issues/07-solve-progress-ui.md).
- [Warnings panel exact contents](issues/09-warnings-panel-contents.md) — **3 severity tiers**
  (Blocker 🔴 / Forced 🟠 / Bent 🟡); **all six** soft constraints surface when nonzero (no numeric
  threshold), weight shown by tier — amber = rest + H/A balance, yellow = gender/pair/sits/H→A
  collapsed into one expandable line; **two-tier granularity** (headline count → per-instance lines
  **recomputed on main from the schedule — no new worker fields**); **hints amber-only** (specific
  staffing hint for forced-rest, generic Reshuffle/override otherwise); one pinned amber **run
  entry** for budget/cancelled; rounds named by **start time**; green empty state; **no "solver" in
  any string** (Generate verb). Full copy + rules: [warnings-spec.md](warnings-spec.md).
- [New-repo bootstrap plan](issues/11-new-repo-bootstrap.md) — new **public** repo
  `github.com/thomasytterstrom/referee-scheduler` (MIT, alongside untouched Excel repo); Pages at
  `/referee-scheduler/`, host-portable static SPA. **npm** + **Node 22 LTS** (`.nvmrc`); `create
  vite react-ts`; **Vitest on `domain/` only**. Layout: `domain/` copied 1:1 from `prototype/src`
  (DOM-free), lone `solver/solver.worker.ts`, `import/` (SheetJS), `persistence/` (idb library),
  `ui/`, `i18n/en.json`. Single `deploy.yml` push-to-`master`, gated on vitest+`tsc --noEmit`. Deps
  `react react-dom xlsx idb` (+dev); **SheetJS from official CDN tarball**; **i18n hand-rolled** (no
  lib); exact solver deferred. Full plan: [bootstrap-spec.md](bootstrap-spec.md). All decision
  tickets now resolved → graduated the final-assembly fog into ticket 12.
- [Final spec assembly](issues/12-final-spec-assembly.md) — **destination reached.** Collated all 11
  resolved specs into one stitch hand-off document: [handoff-spec.md](handoff-spec.md) (what-you're-
  building recap · dependency-ordered reading order · system-architecture data-flow + module↔spec
  table · cross-cutting invariants · build sequence · deferrals/out-of-scope · spec index). Index-not-
  store: points at each spec, restates nothing. **This closes the map** — planning effort complete,
  a build session picks up `handoff-spec.md`.

## Not yet specified

<!-- in-scope fog: graduates into tickets as the frontier advances -->

- _(empty — all decisions made; final assembly graduated to ticket 12.)_

## Out of scope

<!-- ruled beyond this effort's destination; never graduates -->

- **Backend / accounts / multi-user / sharing** — local-only chosen.
- **Match timetable generation** — app takes fixed start times as input, does not build the grid.
- **Mixed-gender matches** — W/M only.
- **Native mobile app / i18n / Swedish UI** — English web only.
- **Fancy PDF export** — browser print only for MVP.
