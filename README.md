# Referee Scheduler

Web app for assigning referees to volleyball tournament matches. Replaces a legacy Excel/VBA tool with a browser-based solver and interactive grid.

## What it does

Given a tournament's referee roster, courts, and match schedule, the app automatically assigns Head and Assistant referees per match while respecting hard constraints (availability, no double-booking) and optimizing soft constraints (rest between duties, load balance, gender balance, pair variety).

Key features:

- **Solver** — greedy seed + simulated annealing. Hard constraints satisfied by construction; soft constraints weighted and scored.
- **Day-by-day workflow** — each day's carryover stats (duty counts, pair history) automatically feed into subsequent days.
- **Interactive grid** — round × court grid with click/drag assignment, manual pinning, and per-referee detail view.
- **Generate & Reshuffle** — one-click solve with seed control for reproducible results.
- **Warnings panel** — highlights violated soft constraints in real time.
- **Print views** — wall grid, per-referee duty slips, per-court call sheets.
- **Import** — paste or upload TSV/CSV/Excel with court names, referee names, and match numbers.
- **Local persistence** — IndexedDB with autosave; no server required.

## Stack

| Layer | Technology |
|---|---|
| UI | React 19, TypeScript 6 |
| Build | Vite 8 |
| Tests | Vitest 4 |
| Lint | Oxlint 1.7 |
| Database | IndexedDB (via `idb`) |
| Import | SheetJS (XLSX) |

## Getting started

```bash
npm install
npm run dev        # dev server at http://localhost:5173/referee-scheduler/
```

## Scripts

```bash
npm run dev        # HMR dev server
npm run build      # tsc + vite build → dist/
npm run test       # Vitest (domain/model/persistence layers)
npm run lint       # Oxlint
npm run preview    # preview production build locally
```

## Project structure

```
src/
  domain/       # Pure solver logic — no React, no I/O (solver, score, constraints, RNG)
  model/        # Rich domain graph (Tournament, Day, Match, Referee, Court) + solver adapter
  persistence/  # IndexedDB store, autosave, serialization, migration
  import/       # TSV/CSV/Excel parser + column header aliases
  i18n/         # English string catalogue (named placeholders, Swedish-ready)
  ui/           # React components organized by feature
    wizard/     # Main workflow shell
    grid/       # Round × court assignment grid
    solve/      # Generate/reshuffle modals + web worker controller
    review/     # Review drawer
    print/      # Print views
    warnings/   # Soft constraint violation panel
    state/      # App state store
  App.tsx       # Root: picker ↔ wizard + state provider
docs/           # Specs: domain model, constraint rules, solver algorithm, UI, persistence, print
```

## Architecture notes

- **Solver portability** — `src/domain/` has zero dependencies beyond an injectable RNG. Can run in a web worker or be ported to WASM without touching React code.
- **Hard constraints by construction** — the solver only proposes feasible moves, so simulated annealing stays in the feasible region without penalty terms.
- **Typed-array problem representation** — `Problem`/`Sol` use `Int32Array`/`Float64Array` for performance; object graphs are only in the model layer.
- **Live carryover** — never persisted; recomputed on demand from all earlier days. Regenerate a later day to pick up edits to an earlier one.
- **Static hosting** — builds to `dist/` with base path `/referee-scheduler/`, suitable for GitHub Pages.
