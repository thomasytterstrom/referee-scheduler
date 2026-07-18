# 12 — Final spec assembly (hand-off document)

Type: task
Status: resolved
Blocked by: 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11

## Question

Graduated from the map's "Final spec assembly" fog now that every decision ticket (01–11) is
resolved. This is the **terminal deliverable** of the planning effort (destination: a hand-off spec
a build session can pick up). No new decisions — pure collation.

Collate the resolved specs into one coherent hand-off document (or an ordered index that stitches
them), covering:

- domain model — [domain-model.md](../domain-model.md)
- constraints (N refs / M courts) — [constraint-spec.md](../constraint-spec.md)
- solver approach + prototype evidence — [solver-spec.md](../solver-spec.md), [prototype/](../prototype/)
- UI/UX — [ui-spec.md](../ui-spec.md)
- persistence & import/export — [persistence-spec.md](../persistence-spec.md)
- solve-progress UI + worker protocol — [07](07-solve-progress-ui.md)
- warnings panel — [warnings-spec.md](../warnings-spec.md)
- print/export views — [print-spec.md](../print-spec.md)
- hosting + deferred exact solver — [08](08-hosting-optional-wasm.md)
- new-repo bootstrap — [bootstrap-spec.md](../bootstrap-spec.md)

Output: the assembled hand-off spec (the effort's destination). Resolving this closes the map.

## Answer

Assembled the hand-off spec at [handoff-spec.md](../handoff-spec.md) — the effort's destination
artifact. Pure collation; no new decisions.

Written as a **stitch document, not a restatement** (index-not-store — each decision keeps its single
home in its own spec; the hand-off points, it does not copy):

1. **What you're building** — destination recap (N refs / M courts / K days, standalone web app,
   Excel tool untouched).
2. **Reading order** — the 10 specs top-to-bottom in dependency order (domain → constraints → solver →
   UI → progress → warnings → persistence → print → hosting → bootstrap).
3. **System architecture** — one data-flow diagram (import/manual → canonical `Tournament` → precheck
   → worker greedy+SA → UI → print) + a module↔spec table matching the bootstrap directory layout.
4. **Cross-cutting threads** — the load-bearing invariants that span specs: stable-id identity;
   carryover recomputed-never-stored; one shared objective; hard-by-construction vs soft-squared;
   rescale-never-hardcode-4; English catalogue w/ named placeholders; no "solver" in strings;
   host-portable SPA.
5. **Build sequence** — the bootstrap checklist order (stand up repo → copy `prototype/src`→`domain/`
   → wrap worker → import → persistence → UI).
6. **Deferrals & out of scope** — exact WASM solver, i18n, schema migrations (seams exist);
   out-of-scope list carried from the map.
7. **Spec index** — area → spec file → resolved ticket table.

All 11 blocker tickets (01–11) confirmed `Status: resolved` before assembling. **This closes the map** —
every decision the destination named is made and collated; nothing remains before a build session can
pick up [handoff-spec.md](../handoff-spec.md).
