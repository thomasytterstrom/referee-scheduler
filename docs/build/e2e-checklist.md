# Manual E2E Checklist — Referee Scheduler

Click-through smoke test for the assembled wizard (Task 11). Run against a dev build
(`npm run dev`) in a Chromium browser. The automated companion —
[`src/e2e.pipeline.test.ts`](../../src/e2e.pipeline.test.ts) — proves the DOM-free chain
(import → solve → validate → persist); this checklist covers the UI wiring that test cannot see.

Sample data: [`docs/reference/federation-export-sample.tsv`](../reference/federation-export-sample.tsv)
(2 days, 3 courts, 38 matches).

| # | Action | Expected result |
|---|--------|-----------------|
| 1 | **Launch** the app (`npm run dev`, open the local URL). | Tournament picker appears (or the last-opened tournament reloads straight into the wizard). |
| 2 | Click **New tournament**. | Wizard opens on the **Setup** step; left stepper shows Setup · Import · Generate · Review · Export; top bar has an editable name + (once days exist) a day switcher. |
| 3 | On **Setup**, add referees (at least ~8 for a 3-court day) via **Add referee**; add courts via **Add court** (or rely on Import to bring courts in). | Each referee/court appears as a row with its identity color swatch. |
| 4 | Go to **Import**. **Upload** the sample `.tsv`/`.xlsx`, or **paste** its contents into the paste box. | Import summary shows matches imported, plus any `added` / `moved` / `removed` counts and row warnings/errors. Courts and 2 days now exist; the day switcher shows **Day 1 / Day 2**. |
| 5 | Confirm the roster survived import. | Referees added in step 3 are still listed (import never replaces referees — it overlays matches). |
| 6 | Select **Day 1** in the top-bar day switcher. | Setup court selection and the Review grid now target Day 1. |
| 7 | Go to **Generate**, click **Generate**. | Progress modal appears for ≥ 600 ms with a live best-score / iterations / elapsed ticker and a **Cancel** button; on completion it closes and the schedule is applied. |
| 7a | (Feasibility) If a round has more duties than available referees, Generate instead shows a **blocker** error modal naming the short round — no schedule is produced. Add referees/availability and retry. | Error modal with "Too many duties…" message + Close & fix; no partial apply. |
| 8 | Go to **Review**. | Dense round×court **grid** for Day 1: each cell shows match no, gender (W/M), Head + Assistant chips in referee colors. Below the grid, the **review drawer**: per-referee **timeline** (H / A / · per round, rest visible at a glance) + **fairness bars**, and the **warnings** panel. |
| 9 | **Pin** a slot: click a 🔒 on any Head/Assistant chip. | Cell shows the pinned/outlined state; the lock button reads pressed. |
| 10 | **Override** a slot: pick a different referee from a slot's dropdown. | Chip updates to the chosen referee and the slot becomes pinned (an override is a lock). |
| 11 | Back on **Generate**, click **Generate** again (incremental). | New solve keeps every pinned/overridden slot; unpinned slots may change. Modal shows, then applies. |
| 12 | Click **Reshuffle**. | New seed: pinned slots stay put, the rest are re-drawn for variety. |
| 13 | Return to **Review** and read the **warnings** panel. | Green empty state when nothing is bent; otherwise amber (rest / Head / Assistant balance, plus a run note after generating) and a collapsible yellow group of minor fairness notes. A bent run also shows the amber banner above the grid. No user-facing text says "solver". |
| 14 | Switch to **Day 2** and repeat Generate + Review. | Day 2 solves independently; its drawer reflects Day 2 only. If Day 1 was finalized, Day 2's fairness targets account for Day 1 via live carryover. |
| 15 | Go to **Export**, click **Download JSON**. | A `<name>_<date>.json` file downloads (a versioned envelope). |
| 16 | Click **Save to library**. | "Saved to this browser's library." note appears (explicit IndexedDB write; autosave also runs continuously). |
| 17 | In the **Print** section, click **Print Master wall grid**. | Browser print dialog opens showing ONLY the wall grid (landscape, one page/day) — no wizard chrome, stepper, or buttons on the sheet. |
| 18 | Click **Print Referee duty slips**. | Print dialog shows only the duty slips (portrait, 2-up, one slip per referee). |
| 19 | Click **Print Court call sheets**. | Print dialog shows only the call sheets (portrait, one page per court). |
| 20 | Cancel the print dialog; use the stepper to jump **back to Setup**. | Navigation is free (not a locked funnel); prior state (roster, schedule, pins) is intact. |
| 21 | Click **Switch tournament** (bottom of stepper), then reopen the tournament from the picker. | It reloads with the schedule, pins, and roster preserved (reload from IndexedDB via `lastOpenedId`). |

**Pass criteria:** every step matches, the print sheets contain only the chosen artifact with the
correct orientation, and no user-facing string contains the word "solver".
