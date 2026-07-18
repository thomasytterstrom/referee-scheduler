# 11 — New-repo bootstrap plan

Type: grilling
Status: resolved
Blocked by: 06, 08

## Question

Graduated from the map's "New-repo bootstrap" fog now that persistence (06) is firm and the host is
decided (08: GitHub Pages, `base:'/<repo>/'`, GitHub Actions build+deploy). Produce the bootstrap
**plan** (no code this effort — destination is spec/plan only):

- **Repo name + owner/org** — the new standalone repo the web app lives in (alongside the untouched
  Excel tool). Public/private.
- **Scaffolding** — Vite + React + TypeScript template, directory layout, where the ported
  solver/score/validate modules land (prior art: the throwaway `prototype/` in this effort), the
  Web Worker entry, the SheetJS import module, the IndexedDB layer.
- **GitHub Actions deploy** — workflow to build and publish to GitHub Pages; `base` path; Node
  version; artifact/pages permissions.
- **Dependencies** — the confirmed set (React, Vite, TS, SheetJS/`xlsx`, IndexedDB helper e.g.
  `idb`), and anything deferred (exact CP-SAT/MILP solver — out of MVP per ticket 08).

Use `/grilling`. Output: new-repo bootstrap section of the hand-off spec.

## Answer

Full plan: **[bootstrap-spec.md](../bootstrap-spec.md)**.

Gist:

- **Repo:** `github.com/thomasytterstrom/referee-scheduler`, **public**, **MIT**, alongside the
  untouched Excel repo. Pages URL `thomasytterstrom.github.io/referee-scheduler/`; Vite
  `base:'/referee-scheduler/'` is the only Pages-specific config (stays a host-portable static SPA).
- **Toolchain:** **npm** (first-party `setup-node` + npm cache); **Node 22 LTS** pinned via
  `.nvmrc` + `node-version-file`; scaffold `npm create vite@latest … --template react-ts`;
  **Vitest** on `domain/` only (pure/DOM-free core), no component tests for MVP.
- **Layout:** `src/domain/` = `types score solver validate carry rng` copied 1:1 from
  `prototype/src/` (DOM-free, worker- and test-loaded); `solver/solver.worker.ts` the sole
  worker-aware file (imports `domain/solver` so the algorithm stays plain-testable);
  `import/fixtures.ts` (SheetJS), `persistence/{serialize,migrate,db}` (idb, library of N),
  `ui/{wizard,grid,referee-view,warnings,print,components}`, `i18n/en.json`.
- **Deploy:** single `.github/workflows/deploy.yml`, push-to-`master` (+ dispatch); perms
  `pages:write`+`id-token:write`; `checkout → setup-node → npm ci → gate (vitest + tsc --noEmit)
  → build → upload-pages-artifact → deploy-pages`. Pages source = GitHub Actions.
- **Deps:** runtime `react react-dom xlsx idb`; dev `vite @vitejs/plugin-react typescript
  @types/react @types/react-dom vitest`. **SheetJS installed from the official CDN tarball**
  (registry `xlsx` is stale/flagged). **i18n hand-rolled** (~15-line `t(key,params)` over
  `en.json`, named placeholders — no library; the catalogue is the future-swap seam). Exact solver
  (`highs-js`/`or-tools-wasm`) **deferred out of MVP** per ticket 08.
