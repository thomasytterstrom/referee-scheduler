# Print / Export View Spec — Web Referee Scheduler

Resolves ticket [10 — Print / export view](issues/10-print-export-view.md). Builds on
[ui-spec.md](ui-spec.md) (the Export step). Scope: the **human-readable print artifact** only —
JSON export/import is already decided in [persistence-spec.md](persistence-spec.md). Browser print
only for MVP; fancy PDF is out of scope. Direction chosen from the throwaway 3-variant mockup
[prototype/print-proto.html](prototype/print-proto.html) (`bun run print`).

## What prints — ship all three artifacts

They serve **different courtside roles**, not competing designs; the Export step offers all three
and the organizer prints whichever they need. Each is scoped to **one day** (days are solved
independently) and switched via the persistent day switcher.

1. **Master wall grid** — **landscape, one page per day.** The full round×court table: rounds down
   the side (labelled `R1…` + start time), courts across the top, each cell = match no + gender +
   Head + Assistant. The single "source of truth" sheet taped at the tournament desk.
2. **Per-referee duty slips** — **portrait, 2-up, one slip per referee.** Each slip is that ref's
   personal *"your duties today"*: header (name + duty count) then chronological rows of
   Time · Court · Role (Head/Assist) · Class (W/M). `break-inside: avoid` so a slip never splits
   across a page. Cut and hand to each referee.
3. **Per-court call sheets** — **portrait, one page per court** (`break-before: page` between
   courts). Chronological referee list for that court: Time · Match no · Class · Head · Assistant.
   (No results/score column — the app assigns referees, it does not track match results.)

## Orientation / density / print-safety

- **Orientation is per-artifact**, set by rewriting the `@page` rule when the view switches:
  `@page { size: A4 landscape }` for the wall grid, `A4 portrait` for slips and call sheets,
  `margin: 12mm`.
- **Referee identity survives print.** Each ref shows **full name + a small solid color dot** (color
  by stable `id`, per ui-spec). `print-color-adjust: exact` keeps the dots on color printers; the
  full name carries identity on a B/W laser, so nothing depends on color alone.
- Gender shown as a **text tag** (`W`/`M`), not a color-only badge — print-safe by default.
- Header backgrounds (`#eef1f5`) forced through with `print-color-adjust: exact`; everything else is
  ink-light (thin borders, black text).

## Document header (every sheet / page)

One header band per printed page: **tournament name** (left) · **day** (`Day 1 — all courts` /
`— referee duty slips` / per-court subtitle) · **generated-at timestamp** (right). Border rule
under it. On the call sheets the header repeats per court page (each court is its own page).

## Mechanism — `@media print` CSS over the Export views

**Decided: `@media print` CSS layered over the existing Export-step views**, not a dedicated print
route. A **Print** button calls `window.print()`; under `@media print` the app chrome and any
prototype switcher are `display:none`, the on-screen "paper" frame drops its shadow/margins, and the
per-artifact `@page` orientation applies. Rationale: no second render tree to keep in sync with the
domain model, no new routing, one source of layout. The three artifacts are three print layouts
selectable in the Export step (each rewriting `@page`), all reading the same solved `Tournament`
state.

- **No lock-in:** if a later effort wants shareable per-artifact URLs or fully decoupled print
  layouts, a `/print` route can be added then — MVP does not need it.

## Prototype (primary source, throwaway)

[prototype/print-proto.html](prototype/print-proto.html) — all three layouts on mock data,
switchable via `?variant=A|B|C` + floating bar / arrow keys, each with its own `@media print` rules
and `@page` orientation. Served by `bun run print`; hit **Print** (Ctrl/Cmd-P) to see the artifact.
Verified rendering via [prototype/verify-print.ts](prototype/verify-print.ts) (DOM shim). Stays in
`.scratch/` as the record of the exploration.
