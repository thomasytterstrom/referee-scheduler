# UI Spec — Web Referee Scheduler

Resolves ticket [05 — UI/UX prototype](issues/05-ui-ux-prototype.md). Builds on
[domain-model.md](domain-model.md). Direction chosen from the throwaway 3-variant mockup
[prototype/ui-proto.html](prototype/ui-proto.html) (`bun run ui`): **Variant C (guided wizard) shell
+ Variant A's dense round×court grid as the editing surface + Variant B's per-referee timeline and
fairness bars in the review drawer.** UI language **English**; per-referee color by stable `id`.

## Shell — guided wizard (from Variant C)

Left vertical **stepper**: **Setup → Import → Generate → Review → Export**. Single primary work area
per step; large touch targets; usable by a once-a-year non-technical organizer. Steps are navigable
(not a locked funnel) — you can jump back to Setup after generating. Day switcher (Day 1 / Day 2,
solved **independently**) is persistent; each day carries its own draft/finalized state.

- **Setup** — roster (referee names), courts (names), refs-per-match default, per-referee
  availability (per day, per round). Manual builder.
- **Import** — paste/upload TSV/CSV; fast-fill **over** the manual model (import is an overlay, not a
  replacement). Columns per the persistence/import ticket.
- **Generate** — the prominent call-to-action: run the solver (Web Worker). **Reshuffle** (new seed)
  sits beside it. Progress/cancel affordance is ticket 07.
- **Review** — the main surface (below).
- **Export** — JSON export/import + browser print view (print layout is ticket 10).

## Review step — two views over the same schedule

Default **per-round overview cards** (readable, from C) with a **toggle to a dense round×court grid**
(from A) for fast editing.

- **Overview (cards):** one card per round; each match shows court, gender badge (W/M), Head chip,
  Assistant chip (or "—" when the match needs none). Good for scanning and confirming.
- **Grid (dense):** rows = rounds, cols = courts; each cell = match no, gender, Head/Assistant
  ref chips. This is the **editing** surface — fast bulk pin/override.
  - **Pin/lock**: click a slot → toggles pinned (outlined cell + 🔒). Pinned = solver works around it
    (incremental re-solve). Pins are the only "finals" concept (folded into generic pinning; optional
    display-only highlight tag).
  - **Override**: click a ref chip → dropdown of available refs for that (round, court) slot; picking
    one pins it.

Referee identity drives a fixed color per ref (by `id`, not name — survives rename); chips carry the
color across every view.

## Review drawer — per-referee view + summary + warnings (from Variant B)

Docked panel (slide-up / side dock) holding three always-available readouts:

- **Per-referee timeline** — rows = refs, cols = rounds; each cell H / A / · (rest), ref-colored.
  Makes the **rest rule visible at a glance** (consecutive active cells jump out).
- **Fairness / summary** — per-ref Head-vs-Assistant load bars, duty totals, gender split
  (W/M per role), pair matrix. The "is this balanced?" check.
- **Warnings** — list of bent soft constraints (exact contents = ticket 09), severity-dotted.

## Controls (consistent across steps)

**Generate** (primary), **Reshuffle** (new seed), **Import**, **day switcher**, and in Review the
**overview⇄grid toggle** + per-slot **pin/override**. Reshuffle and Generate both re-run the solver;
Generate preserves pins (incremental), Reshuffle reseeds for variety.

## Deferred to follow-up tickets (graduated from this decision)

- **Solve-progress UI + Web Worker wiring** — ticket 07 (was blocked by this ticket).
- **Warnings panel exact contents** — ticket 09 (which violations, wording, severity).
- **Print/export view** — ticket 10 (printable courtside layout; browser print only per scope).

## Prototype (primary source, throwaway)

[prototype/ui-proto.html](prototype/ui-proto.html) — all three explored variants (A spreadsheet,
B dashboard, C wizard), switchable via `?variant=` + floating bar / arrow keys, on mock data. Served
by `bun run ui`. Verified rendering via [prototype/verify-ui.ts](prototype/verify-ui.ts) (DOM shim).
The winning **combination** is captured here in this spec; the full variant set stays in `.scratch/`
as the record of the exploration.
