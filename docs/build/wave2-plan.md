# Build Wave 2 — Implementation Plan (import · persistence · UI · print)

Source-of-truth plan for the second build wave of `referee-scheduler`. Steps 2–3 of
[handoff-spec §5](../handoff-spec.md) (domain core + Web Worker) are **done**; this plan covers the
remaining independent-branch work (steps 4–6) as a dependency graph for
`task-orchestrated-execution`. The durable graph is [wave2-task-graph.json](wave2-task-graph.json).

Each task references its settled spec rather than restating it (index-not-store). Testing follows the
bootstrap decision: **Vitest on the pure/DOM-free layers** (`model/`, `import/`, `persistence/`);
UI is validated visually + `tsc --noEmit`, no React component tests for MVP.

**The reframing:** the wave's root is not import or persistence — it is the canonical **`Tournament`
app-model + the solver adapter + live carryover**. The domain core speaks flattened
`Problem`/`Sol`/`Carry` (index arrays); the app, import, persistence and UI all speak the rich
`Tournament` graph (named referees/courts/days, stable ids). The adapter is the connective tissue,
and every other task imports it.

---

### Task 1: Canonical Tournament model + solver adapter + live carryover

**Files:**
- Create: `src/model/tournament.ts` (the `Tournament`/`Referee`/`Court`/`Day`/`Round`/`Match`/`Assignment`/`Slot` types + id helpers)
- Create: `src/model/adapter.ts` (per-day `Tournament` → solver `Problem`; solver `Sol` → `Assignment[]`; pins ↔ `Slot.pinned`)
- Create: `src/model/carryover.ts` (live `Carry` for a target day from all finalized earlier days)
- Create: `src/model/tournament.test.ts`, `src/model/adapter.test.ts`, `src/model/carryover.test.ts`
- Modify: `vite.config.ts` (widen Vitest `include` from `src/domain/**` to `src/{domain,model,import,persistence}/**/*.test.ts`)
- Import: `src/domain/types.ts`, `src/domain/carry.ts`, `src/domain/solver.ts`

Spec: [domain-model.md](../domain-model.md) (entities + invariants), [constraint-spec.md](../constraint-spec.md) §Carryover.

Steps: define the serializable `Tournament` graph keyed by stable ids exactly per domain-model; build
`toProblem(tournament, dayIndex)` (round = round index, court→court index, `requiresAssistant`→`needA`,
`availability`→`avail` Uint8Array, pins→`headPin`/`asstPin`) and `applySol(day, sol)` back to
`Assignment[]`; build `carryoverFor(tournament, dayIndex)` that folds every `finalized` day before it
via `domain/carry.accumulate`. Round-trip test: `Tournament → Problem → solve → applySol → Tournament`
stays hard-valid; carryover of a 2-day fixture matches hand-computed totals. **This is the wave root.**

---

### Task 2: Import — SheetJS fixtures → Tournament (merge on re-import)

**Files:**
- Create: `src/import/columns.ts` (Swedish header normalization + column map), `src/import/fixtures.ts` (xlsx/paste/csv → `Tournament` patch; round derivation; merge-by-`Kamp Id`)
- Create: `src/import/fixtures.test.ts`
- Import: `src/model/tournament.ts`, `xlsx`

Spec: [persistence-spec.md](../persistence-spec.md) §1 (ingest formats, column mapping, round derivation, re-import merge, court selection, row skipping). Grounded on [reference/federation-export-sample.tsv](../reference/federation-export-sample.tsv).

Steps: one detector for `.xlsx`/paste/`.csv`; map `Datum`→Day, `Starttid`→round (distinct-sorted rank)
+ `Match.startTime`, `Spelplats`→Court name verbatim, `Klass` H/D→M/W; `requiresAssistant` default true;
`highlight` from non-empty `Matchnamn`; merge keyed on `Kamp Id` (composite fallback) preserving
assignments/pins + flagging moves; per-row error collection. Test against the real sample TSV.

---

### Task 3: Persistence — serialize/migrate + IndexedDB library

**Files:**
- Create: `src/persistence/serialize.ts` (canonical `Tournament` ↔ v1 JSON envelope), `src/persistence/migrate.ts` (`schemaVersion` dispatch; v1 only, seam present), `src/persistence/db.ts` (IndexedDB library of N via `idb` + `lastOpenedId` meta + debounced autosave helper)
- Create: `src/persistence/serialize.test.ts`, `src/persistence/migrate.test.ts` (db.ts covered by round-trip; IndexedDB itself not unit-tested for MVP)
- Import: `src/model/tournament.ts`, `idb`

Spec: [persistence-spec.md](../persistence-spec.md) §0, §2, §3.

Steps: `serialize`/`deserialize` around `{schemaVersion:1, exportedAt, appVersion, tournament}`;
`migrate(obj)` refuses newer, runs vN→vN+1 for older, loads equal; `db.ts` opens store `tournaments`
keyed by id + `meta`, save/load/list/delete, debounced autosave (~500ms). Carryover never serialized.

---

### Task 4: i18n catalogue + t() helper

**Files:**
- Create: `src/i18n/en.json` (string catalogue, named placeholders `{ref}`/`{time}`), `src/i18n/t.ts` (~15-line `t(key, params)`)
- Create: `src/i18n/t.test.ts`
- Import: none

Spec: [handoff-spec.md §4](../handoff-spec.md) translation-readiness note; strings drawn from [warnings-spec.md](../warnings-spec.md) + [ui-spec.md](../ui-spec.md).

Steps: hand-rolled `t(key, params)` doing named-placeholder substitution against `en.json`; no i18n
library. Seam only — English ships; a later `sv.json` is a mechanical swap. **Wave root (no deps).**

---

### Task 5: Wizard shell — Setup · Import · Export steps + app state + autosave

**Files:**
- Create: `src/ui/wizard/` (shell, step nav Setup→Import→Generate→Review→Export), `src/ui/state/` (in-memory `Tournament` store + autosave wiring), `src/ui/components/` (shared bits)
- Modify: `src/App.tsx`, `src/main.tsx`
- Import: `src/model/*`, `src/import/fixtures.ts`, `src/persistence/*`, `src/i18n/t.ts`

Spec: [ui-spec.md](../ui-spec.md) (guided-wizard shell), [persistence-spec.md §2.2](../persistence-spec.md) (autosave/reload/picker).

Steps: wizard scaffold + tournament picker on launch (reads `lastOpenedId`); Setup step (referee/court
roster manual entry), Import step (drop/paste → `fixtures` → store), Export step (JSON download +
IndexedDB). Grid/review/print slot in via Task 11. Depends on import + persistence + i18n.

---

### Task 6: Round×court editable grid (primary review surface)

**Files:**
- Create: `src/ui/grid/` (dense round×court grid, pin=🔒 toggle, override = ref dropdown, per-ref color by stable id, idle/not-refereed cells)
- Import: `src/model/tournament.ts`, `src/i18n/t.ts`

Spec: [ui-spec.md](../ui-spec.md) (Review grid), [domain-model.md](../domain-model.md) (grid cell = `(round,court)`).

Steps: render the sparse grid from a `Tournament` day; pin/override mutate `Slot`; disabled during a
solve (Task 9). Standalone component fed by props → parallelizable with the shell.

---

### Task 7: Per-referee review view (timeline + fairness bars)

**Files:**
- Create: `src/ui/referee-view/` (per-ref duty timeline + H/A fairness bars)
- Import: `src/model/tournament.ts`, `src/domain/score.ts`, `src/i18n/t.ts`

Spec: [ui-spec.md](../ui-spec.md) (review drawer).

Steps: per-ref row of duties across rounds + fairness bars from the score breakdown. Read-only; plugs
into the Review drawer (Task 11).

---

### Task 8: Warnings panel (3 severity tiers)

**Files:**
- Create: `src/ui/warnings/` (panel: Blocker/Forced/Bent tiers, per-instance lines recomputed on main)
- Import: `src/model/tournament.ts`, `src/domain/score.ts`, `src/i18n/t.ts`

Spec: [warnings-spec.md](../warnings-spec.md) (full copy + rules; 3 tiers; no "solver" in any string).

Steps: from the `Score` breakdown + schedule, surface all nonzero soft constraints by tier with the
exact English catalogue strings; green empty state; recompute per-instance lines on main (no new worker
fields). Plugs into the Review drawer (Task 11).

---

### Task 9: Generate modal + worker solve controller (state machine)

**Files:**
- Create: `src/ui/solve/solveController.ts` (main-thread precheck → worker `SolveReq` → progress/done; min 600ms display; cancel), `src/ui/solve/GenerateModal.tsx`
- Modify: `src/ui/wizard/` (Review toolbar: Generate/Reshuffle buttons)
- Import: `src/solver/protocol.ts`, `src/solver/solver.worker.ts` (via `new Worker(new URL(...))`), `src/domain/validate.ts`, `src/model/adapter.ts`, `src/ui/grid/`

Spec: [issues/07-solve-progress-ui.md](../issues/07-solve-progress-ui.md) (exact state machine + wiring), [solver-spec.md §Web Worker protocol](../solver-spec.md).

Steps: synchronous feasibility precheck on main (fail → modal error state, no worker); ok → spawn worker,
post `SolveReq` (Generate=`warmStart:true`, Reshuffle=new seed `warmStart:false`), patch ticker in place
on `progress`, on `done` wait `max(0,600−elapsed)` then apply atomically + warn banner if bent. Cancel =
`postMessage({type:"cancel"})`, keep best-so-far. Depends on shell + grid; worker protocol already built.

---

### Task 10: Print / export views (@media print)

**Files:**
- Create: `src/ui/print/` (master wall grid landscape; per-referee duty slips 2-up portrait; per-court call sheets portrait; `@media print` + `@page` per artifact)
- Import: `src/model/tournament.ts`, `src/i18n/t.ts`

Spec: [print-spec.md](../print-spec.md) (all three artifacts, print-safe rules, header format).

Steps: three print layouts over the Export views via `@media print` CSS + `window.print()`; id-color dot
with `print-color-adjust:exact`; gender as text; header tournament·day·generated-at. Standalone → parallel.

---

### Task 11: Review/Export assembly + end-to-end smoke

**Files:**
- Modify: `src/ui/wizard/` (Review step embeds grid + referee-view + warnings + Generate modal; Export step embeds print), `src/App.tsx`
- Create: `src/ui/review/` (Review drawer composing 6/7/8), a manual e2e checklist doc
- Import: all of Tasks 5–10

Spec: [handoff-spec.md §3](../handoff-spec.md) (data-flow), [ui-spec.md](../ui-spec.md).

Steps: wire the standalone components into the wizard's Review/Export steps; full click-through on the
sample fixture (import → set roster → Generate → pin/override → Reshuffle → Export JSON → print). Final
integration task — depends on everything.

---

## Execution waves (topological)

- **Wave 1 (parallel):** Task 1, Task 4
- **Wave 2 (parallel):** Task 2, Task 3, Task 6, Task 7, Task 8, Task 10
- **Wave 3:** Task 5
- **Wave 4:** Task 9
- **Wave 5:** Task 11

Wave 2 is the payoff — six independent modules, each in its own directory (no shared files), buildable
concurrently. Integration (5/9/11) touches the wizard + `App.tsx` and is deliberately serialized to
avoid write conflicts. Worktree isolation recommended for Wave 2 parallel agents.
