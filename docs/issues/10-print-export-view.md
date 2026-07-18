# 10 — Print / export view

Type: prototype
Status: resolved
Blocked by:

## Question

The Export step needs a **printable courtside layout** (browser print only for MVP — fancy PDF is
out of scope). Decide what the printed/exported artifact looks like, given the chosen UI
([ui-spec.md](../ui-spec.md)):

- **What prints**: the round×court grid, a per-referee sheet ("your duties today"), or both? One page
  per day? Per court?
- **Orientation / density**: landscape grid vs portrait per-ref list; how many rounds/courts fit;
  what's dropped for print (colors → print-safe? ref initials vs full names?).
- **Header**: tournament name, day, generated-at timestamp.
- **Mechanism**: `@media print` CSS over the existing views vs a dedicated print route. JSON export is
  already decided (persistence ticket) — this ticket is only the **human-readable** print view.

Use `/prototype` (print-CSS mockup). Output: print-view spec + mockup link.

## Answer

**Ship all three print artifacts** — they serve different courtside roles, not competing designs;
the Export step offers each and the organizer prints whichever is needed (all scoped to one day):

1. **Master wall grid** — landscape, 1 page/day; full round×court table (rounds+time down the side,
   courts across, match no + gender + Head/Assistant per cell). The desk "source of truth".
2. **Per-referee duty slips** — portrait, 2-up, `break-inside:avoid`; each ref's "your duties today"
   (Time · Court · Role · Class rows). Cut and hand out.
3. **Per-court call sheets** — portrait, 1 page/court (`break-before:page`); chronological referee
   list per court (Time · Match · Class · Head · Assistant). No results/score column — the app does
   not track match results.

**Print-safety:** full ref name + small color dot (id-based), `print-color-adjust: exact` so dots
survive color printers while names carry identity on B/W; gender as text tag; ink-light otherwise.
**Header per page:** tournament name · day · generated-at.

**Mechanism — `@media print` CSS over the existing Export-step views** (not a dedicated route). A
Print button calls `window.print()`; `@media print` hides chrome, and `@page` orientation is
rewritten per artifact (landscape grid / portrait slips+sheets). One render tree, no new routing; a
`/print` route can be added later if shareable URLs are ever wanted (no lock-in).

Chosen from a 3-variant mockup [prototype/print-proto.html](../prototype/print-proto.html)
(`bun run print`, then Print). Full spec: [print-spec.md](../print-spec.md).
