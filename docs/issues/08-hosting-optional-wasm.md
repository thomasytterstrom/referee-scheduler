# 08 — Hosting target + optional exact (WASM) solver decision

Type: grilling
Status: resolved
Blocked by:

## Question

The shipping solver is pure-TS SA in a Web Worker — needs **no** special headers, so any static host
works ([solver-spec.md](../solver-spec.md)). The only pull toward a fancier host is the **optional**
feature-flagged exact backend:

- `or-tools-wasm` CP-SAT (best quality) needs **cross-origin isolation** (`COOP: same-origin` +
  `COEP: require-corp`) for its WASM threads — **GitHub Pages cannot set these** (only a hacky
  `coi-serviceworker` workaround); Netlify/Cloudflare/Vercel can via a `_headers` file.
- `highs-js` MILP is single-thread → **no** isolation headers, deploys on GitHub Pages, but the
  rest/balance penalties must be linearized (loses the exact squared-penalty shape).

Decide, for the new repo:

1. **Host** — GitHub Pages (free, simplest) vs Netlify/Cloudflare/Vercel (headers + `_headers`).
2. **Is the exact backend in scope at all for MVP**, or purely future? If yes, which
   (`highs-js` no-headers vs `or-tools-wasm` headers)? This choice and the host choice are coupled.
3. If the exact backend is deferred, does anything about the host choice still matter now (so we
   don't have to migrate later)?

Feeds the new-repo bootstrap fog. Use `/grilling`. Output: hosting + exact-backend decision.

## Answer

1. **Exact backend (CP-SAT / MILP): deferred — not in MVP.** Ticket 04 proved pure-TS simulated
   annealing produces hard-valid, well-balanced schedules and converges in <100 ms at target sizes.
   The provable-optimality guarantee is overkill for a 2-day referee grid and is the *only* thing
   that would force multi-MB WASM, a pre-1.0 dependency, and (for CP-SAT) COOP/COEP headers. Ship SA;
   keep a clean seam for exact polish behind a feature flag if ever wanted later.
2. **Host: GitHub Pages.** Repo already lives on GitHub (`github.com/thomasytterstrom`); free, no new
   account, deploys a Vite static build via one GitHub Actions workflow. With exact deferred there's
   no COOP/COEP requirement, so Pages' header limitation is irrelevant. **Vite `base: '/<repo>/'`**
   is the one Pages-specific config (subpath serving).
3. **No lock-in.** If exact is ever wanted: `highs-js` (single-thread MILP WASM) needs **no** headers
   and runs on Pages as-is; only Google's threaded CP-SAT needs COOP/COEP, at which point moving the
   static build to Netlify/Cloudflare (+ a `_headers` file) is hours, not a rewrite. **Load-bearing
   constraint: keep the app a host-portable static SPA** — no Pages coupling beyond the base path.

**Net for new-repo bootstrap:** target GitHub Pages, GitHub Actions build+deploy, Vite base path set
to the repo name, plain static SPA. Exact-solver deps stay out of MVP.
