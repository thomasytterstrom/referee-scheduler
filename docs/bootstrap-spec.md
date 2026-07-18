# New-Repo Bootstrap — Web Referee Scheduler

Resolves ticket [11 — New-repo bootstrap plan](issues/11-new-repo-bootstrap.md). Graduated from the
map's "New-repo bootstrap" fog once persistence ([06](issues/06-persistence-import-export.md)) and
host ([08](issues/08-hosting-optional-wasm.md)) were firm.

This is the hand-off plan a build session picks up to stand the new repo up. **Planning only — no
code produced this effort.**

Status: **settled**.

---

## 1. Repository

- **Name:** `referee-scheduler`
- **Owner:** `github.com/thomasytterstrom` (same account as this Excel-tool repo; the two live
  side by side — the Excel `Refereeschedule` repo is **not** touched).
- **Visibility:** **public**. Nothing sensitive in a beach-volley referee grid; public = free Pages
  on any plan, no auth friction.
- **License:** **MIT** (single `LICENSE` file; permissive, standard for a personal open tool).
- **Pages URL:** `https://thomasytterstrom.github.io/referee-scheduler/`
- **Vite base path:** `base: '/referee-scheduler/'` — the one Pages-specific config (subpath
  serving). Keep the app an otherwise host-portable static SPA (per ticket 08: no Pages coupling
  beyond the base path, so a later move to Netlify/Cloudflare is hours, not a rewrite).

## 2. Toolchain

- **Package manager:** **npm.** Ships with Node (durable for a ~30-sessions/year tool that must
  build cleanly on a fresh machine a year later); CI uses the first-party `actions/setup-node` with
  built-in npm cache. (The throwaway `prototype/` ran on bun; the shipping repo does not.)
- **Node:** **22 LTS**, pinned via **`.nvmrc`** (contents: `22`). CI reads the same file through
  `node-version-file` so local and CI never drift.
- **Scaffold command:**
  ```
  npm create vite@latest referee-scheduler -- --template react-ts
  ```
  Stock React + TypeScript + Vite template. `.gitignore` and base `README.md` come from the
  template (no decisions there).
- **Tests:** **Vitest**, shares `vite.config.ts` (zero extra config). Tests target **`domain/`
  only** for MVP — the pure, DOM-free solver core, where a silent rescale bug (4 refs/1 court →
  N×M) would hide. **No** React component tests / `@testing-library` / jsdom for MVP (UI is
  validated visually; addable later).

## 3. Directory layout

```
referee-scheduler/
├─ .github/workflows/deploy.yml      # build + Pages deploy (§4)
├─ .nvmrc                            # 22
├─ LICENSE                           # MIT
├─ index.html
├─ vite.config.ts                    # base:'/referee-scheduler/'
├─ tsconfig.json
├─ package.json
└─ src/
   ├─ main.tsx
   ├─ App.tsx
   ├─ domain/            # PURE, DOM-free — copied 1:1 from prototype/src, then hardened
   │   ├─ types.ts
   │   ├─ score.ts
   │   ├─ solver.ts
   │   ├─ validate.ts
   │   ├─ carry.ts
   │   └─ rng.ts
   ├─ solver/
   │   └─ solver.worker.ts           # Web Worker entry; imports domain/solver
   ├─ import/
   │   └─ fixtures.ts                # SheetJS parser: xlsx/paste/csv → Tournament
   ├─ persistence/
   │   ├─ serialize.ts               # canonical Tournament ↔ JSON envelope
   │   ├─ migrate.ts                 # schemaVersion dispatch (v1 only for now; seam exists)
   │   └─ db.ts                      # IndexedDB via idb — library of N tournaments
   ├─ ui/
   │   ├─ wizard/                    # Setup → Import → Generate → Review → Export shell
   │   ├─ grid/                      # round×court editable grid (primary review surface)
   │   ├─ referee-view/             # per-referee timeline + fairness bars
   │   ├─ warnings/                  # warnings panel (3 severity tiers)
   │   ├─ print/                     # @media print views (wall grid / duty slips / call sheets)
   │   └─ components/                # shared bits
   └─ i18n/
       └─ en.json                    # string catalogue, named placeholders
```

**Rationale**

- `domain/` mirrors `prototype/src/` (`types score solver validate carry rng`) 1:1 → the port is a
  **copy-in**, not a redesign. The prototype src is already the VBA→TS rewrite; harden it in place.
  Kept DOM-free so it runs headless under Vitest and loads into the worker unchanged.
- `solver/solver.worker.ts` is the **only** worker-aware file. It imports `domain/solver`, so the
  algorithm itself stays plain-callable in tests (no worker harness needed to test it). Vite worker
  import form:
  ```ts
  new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
  ```
- `import/`, `persistence/`, `i18n/` each map onto a settled spec section
  ([persistence-spec.md](persistence-spec.md) §1, §2–3, and the map's translation-readiness note).

## 4. GitHub Actions deploy

Single workflow `.github/workflows/deploy.yml`, the official Vite→Pages pattern:

- **Trigger:** push to `master` (+ manual `workflow_dispatch`).
- **Permissions:** `pages: write`, `id-token: write`, `contents: read`.
- **Concurrency:** one Pages deploy at a time (`group: pages`, cancel-in-progress false).
- **Steps:**
  1. `actions/checkout`
  2. `actions/setup-node` with `node-version-file: .nvmrc`, `cache: npm`
  3. `npm ci`
  4. **Gate:** `npm run test` (Vitest) **and** `npx tsc --noEmit` — a red test or type error blocks
     the publish (stops a broken build going live mid-tournament).
  5. `npm run build` (Vite → `dist/`)
  6. `actions/configure-pages`
  7. `actions/upload-pages-artifact` (path `dist`)
  8. `actions/deploy-pages`

Pages source set to **GitHub Actions** (not branch) in repo settings. `npm ci` fetches the SheetJS
tarball from `cdn.sheetjs.com` (see §5) — an external host at build time; note for offline/air-gapped
CI (not a concern here).

## 5. Dependencies

| Kind | Packages |
|---|---|
| runtime | `react`, `react-dom`, `xlsx` (SheetJS), `idb` |
| dev | `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`, `vitest` |
| deferred (out of MVP) | exact solver — `highs-js` (MILP, no headers) or `or-tools-wasm` (CP-SAT, needs COOP/COEP). Not installed. Kept behind a feature-flag seam per ticket 08. |

**SheetJS (`xlsx`) install source:** install from the **official SheetJS CDN tarball**, not the npm
registry — the registry `xlsx` is stale (0.18.5, flagged advisories); SheetJS ships current, patched
builds from their own CDN:
```
npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```
(pin the concrete version current at build time). `package.json` records the tarball URL.

**i18n:** **no library.** English-only MVP; i18n itself is out of scope. Hand-roll a ~15-line
`t(key, params)` reading `i18n/en.json` with named placeholders (`{ref}`, `{time}`). The catalogue +
placeholder convention is the seam so a future `sv.json` is a mechanical swap — pulling
`react-i18next` now is speculative machinery for a deferred feature.

## 6. What a build session inherits

All decisions for the app are already made across this effort's specs — this bootstrap plan only
stands the repo up. Pointers for the builder:

- Domain model: [domain-model.md](domain-model.md)
- Constraints (N refs / M courts): [constraint-spec.md](constraint-spec.md)
- Solver (greedy seed → SA in a worker): [solver-spec.md](solver-spec.md) + working
  [prototype/](prototype/)
- UI (wizard + grid + review drawer): [ui-spec.md](ui-spec.md)
- Persistence & import/export: [persistence-spec.md](persistence-spec.md)
- Solve-progress modal + worker protocol: [issues/07-solve-progress-ui.md](issues/07-solve-progress-ui.md)
- Warnings panel copy + rules: [warnings-spec.md](warnings-spec.md)
- Print artifacts: [print-spec.md](print-spec.md)
- Hosting + deferred exact solver: [issues/08-hosting-optional-wasm.md](issues/08-hosting-optional-wasm.md)
