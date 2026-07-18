# 05 — UI/UX prototype

Type: prototype
Status: resolved
Blocked by: 01

## Question

Design the app's screens and interactions, then build a rough clickable/HTML prototype to react
to. Cover:

- **Round × court editable grid** (primary) — rows = rounds, cols = courts; each cell shows the
  match + its Head/Assistant. Pin/lock and manual override happen here.
- **Per-referee view** — rows = refs, cols = rounds; shows each ref's duty (Head / Assist /
  rest). Makes the rest rule visible.
- **Summary stats** — per-ref totals, gender split, pair matrix, fairness check.
- **Warnings panel** — lists bent soft constraints (e.g. rest rule bent when short-staffed).
- **Entry** — roster (names), courts (names), per-ref availability, refs-per-match; plus import.
- **Controls** — Generate, Reshuffle, pin/override, day switcher (day 1 / day 2 independent).

Decide layout, per-referee color coding (today's Excel uses a fixed palette by ref index — now
N refs), and how Generate/Reshuffle/pin surface. UI language **English**.

Use `/prototype`. Output: UI spec + prototype link.

## Answer

**Chosen direction: Variant C (guided wizard) shell + Variant A's dense round×court grid as the
editing surface + Variant B's per-referee timeline and fairness bars in the review drawer.** Full
design in [ui-spec.md](../ui-spec.md).

- **Shell:** left stepper Setup → Import → Generate → Review → Export; single focused work area;
  non-technical-friendly; persistent day switcher (Day 1/Day 2 independent).
- **Review:** per-round overview cards (readable) with a **toggle to a dense grid** (rows=rounds,
  cols=courts) for fast pin/override editing. Pin = outlined cell + 🔒; override = ref-chip dropdown.
  Finals = generic pinning, optional display tag.
- **Drawer:** per-referee timeline (H/A/rest colored → rest rule visible), fairness bars +
  gender/pair summary, warnings list. Per-ref color by stable `id`.

**Prototype:** [prototype/ui-proto.html](../prototype/ui-proto.html) — three explored variants
(A spreadsheet, B dashboard, C wizard) switchable via `?variant=` + floating bar / ← → keys, mock
data, `bun run ui`. Rendering verified with a DOM shim ([prototype/verify-ui.ts](../prototype/verify-ui.ts));
all three render with no runtime error. Full variant set kept in `.scratch/` as the exploration
record; the winning combination is captured in the spec. (Browser screenshots skipped — `agent-browser`
CLI not installed / hung on first-run download; a UI prototype is judged by flipping it in a browser
anyway.)

**Graduated fog → new tickets:** unblocks **07** (solve-progress UI); graduates **09** (warnings
panel exact contents) and **10** (print/export view).
