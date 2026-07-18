# 09 — Warnings panel exact contents

Type: grilling
Status: resolved
Blocked by:

## Question

The UI has a warnings panel showing **bent soft constraints** and pre-solve hard failures
([ui-spec.md](../ui-spec.md)). The scorer already returns a per-constraint penalty breakdown
([constraint-spec.md](../constraint-spec.md)) and the feasibility precheck returns fails + warnings
([solver-spec.md](../solver-spec.md)). Decide exactly **what surfaces and how**:

- **Which** violations to list: all six soft constraints when bent, or only the high-weight ones
  (rest, balance)? A threshold (only show a soft term above some penalty)?
- **Granularity**: one line per bent constraint (e.g. "rest rule bent") vs per-referee /
  per-round detail ("Anna: 3 consecutive duties, rounds 6–8").
- **Severity model**: hard-fail (block solve) vs bent-soft (informational) vs forced-bent (rest rule
  bent because short-staffed — the precheck warned). How many severity levels, what wording/colors.
- **Wording**: exact English strings, referee/court/round naming, actionability ("add a referee to
  round 6" hints?).
- **Empty state**: what shows when the schedule is clean.

Use `/grilling`. Output: warnings-panel content spec (list rules + copy).

## Answer

Full spec: [warnings-spec.md](../warnings-spec.md). Decided via `/grilling`:

- **Severity: 3 levels** — Blocker (🔴, precheck hard fail, solve can't run), Forced (🟠, soft
  constraint physically impossible to satisfy, or budget/cancelled run), Bent (🟡, nonzero but not
  provably forced). Blocker owned by the Generate modal but also listed greyed in the panel.
- **Which:** all six soft constraints surface when nonzero — **no numeric threshold**. Weight shown
  by tier, not by hiding. Amber = rest + Head balance + Assistant balance; yellow = gender + pair +
  sits + H→A, **collapsed into one expandable "Minor fairness notes (n)" line**.
- **Granularity: two-tier** — headline count → expand to per-instance lines (ref + rounds/delta),
  **recomputed on the main thread from the solved schedule** (no new worker-protocol fields).
- **Hints: amber only** — specific staffing hint for forced-rest (computed from the precheck),
  generic "Reshuffle or override" for other amber, none for yellow.
- **Run entry:** one amber entry pinned at the top for `reason: budget | cancelled`, clears on next
  complete solve.
- **Round naming:** by **start time**, fall back to "round N" when no time is set.
- **Empty state:** 🟢 "No issues — every referee is balanced and rested." Yellow-only gets a
  reassuring header above the minor-notes line.
- **Wording:** full English string catalogue in the spec; **no "solver" in any user-facing string**
  — anchored to the **Generate** verb.

No new tickets graduated; no other tickets invalidated. Print/export (ticket 10) may reference
whether warnings appear on the printout, but that is its own decision.
