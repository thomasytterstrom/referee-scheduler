# Warnings Panel Spec — Web Referee Scheduler

Resolves ticket [09 — Warnings panel exact contents](issues/09-warnings-panel-contents.md). The
warnings panel is one of the three readouts in the Review drawer ([ui-spec.md](ui-spec.md)). It
reports the health of the current day's schedule. Inputs it renders from:

- the scorer's **per-constraint penalty breakdown** ([constraint-spec.md](constraint-spec.md)),
- the feasibility **precheck** fails + rest-forced warning ([solver-spec.md](solver-spec.md)),
- the solve `done` **`reason`** field (`budget` | `cancelled`) from [ticket 07](issues/07-solve-progress-ui.md).

**No new Web Worker protocol fields.** Instance-level detail (which ref, which rounds) is
**recomputed on the main thread** from the solved schedule + problem — the worker still returns
only the total + per-constraint breakdown.

## Severity model — 3 levels

| Level | Dot | Meaning | User action |
|---|---|---|---|
| **Blocker** | 🔴 red | Precheck hard fail — solve cannot run. | Fix inputs before generating. |
| **Forced** | 🟠 amber | Soft constraint bent because physically impossible to satisfy (rest rule where demand == available across ≥3 consecutive rounds — precheck flags this), **or** the run stopped early (budget/cancelled). | Add a referee/availability, or Generate again. |
| **Bent** | 🟡 yellow | A soft term is nonzero but not provably forced — Reshuffle or a manual edit might clear it. | Optional; cosmetic fairness. |

Blocker is owned by the **Generate modal** (ticket 07: precheck fail → modal error, no worker). It
is **also** listed in the panel (greyed, "solve blocked") so the drawer is a complete health
readout — but when blocked there is no schedule, so the panel shows *only* the blocker.

## Which constraints surface

**All six soft constraints surface whenever their penalty is nonzero.** No numeric threshold
(squared penalties don't map to a user-meaningful cutoff, and hiding a bend would contradict the
per-referee timeline in the same drawer). Weight is expressed by **tier**, not by hiding:

- **Amber tier:** Rest rule; Head balance; Assistant balance.
  - Rest is **Forced-amber** when the precheck flagged it forced; otherwise **Bent-amber**.
- **Yellow tier:** Fine gender balance; Pair variety; ≤3 consecutive sits; H→A back-to-back.
  - All four **collapse into one expandable line** ("Minor fairness notes (n)").

Sort order in the panel: **run entry → amber (rest, then Head balance, then Assistant balance) →
yellow collapsed line.** Severity-desc, then weight-desc.

## Granularity — two-tier

Each constraint entry is a **headline with a count**; clicking expands to **per-instance lines**.
Instances are recomputed from the schedule (the actionable unit is "Anna, 14:00–15:00", not a bare
total). Per-type detail:

| Constraint | Instance line format |
|---|---|
| Rest / consecutive sits | ref + streak length + round range |
| Head / Assistant balance | ref + signed delta from target |
| Fine gender balance | ref + role |
| Pair variety | ordered pair + count vs cap |
| H→A back-to-back | ref + the two round times |

## Hints — amber only

- **Forced-rest** (short-staffed): specific, computable from the precheck —
  *"Not enough referees at {t1}–{t2} — add availability or a referee there."*
- **Other amber** (bent rest, balances): generic — *"Reshuffle or override to improve."*
- **Yellow:** no hint.

## Round naming

Strings name a round by its **start time** (`{time}`, e.g. `14:00`) — the organizer thinks in clock
time, and it matches the courtside printout. **Fall back to "round N"** when no start time is set
(pure manual build).

## Empty / clean state

- **Zero bent constraints:** 🟢 *"No issues — every referee is balanced and rested."*
  Sub-line: *"Rest, balance, and pairing all within targets."*
- **Yellow only (no amber, no blocker):** header *"Schedule looks good — a few minor fairness
  notes."* above the collapsed yellow line — reassuring, not alarming.

## String catalogue (English, `{}` = placeholder)

**Panel header (by worst tier present):**
- Clean: *"No issues — every referee is balanced and rested."* / *"Rest, balance, and pairing all within targets."*
- Yellow only: *"Schedule looks good — a few minor fairness notes."*
- Amber present: *"Some issues worth a look."*
- Blocker: *"Solve blocked — fix this before generating."*

**Run entry (amber, pinned top; clears on next complete solve):**
- Budget: *"Generating stopped at the time limit — result may not be optimal. Generate again to keep improving."*
- Cancelled: *"You stopped generating early — showing the best result so far. Generate again to continue."*

**Blocker (red):**
- *"Too many duties for the referees available at {time} — needs {demand}, have {available}. Add a referee or availability there."*

**Amber constraints** (headline → instance → hint):
- Rest (forced): *"Rest rule bent — {n} referee(s) working too long without a break"* → *"{ref}: {s} duties in a row, {t1}–{t2}"* → *"Not enough referees at {t1}–{t2} — add availability or a referee there."*
- Rest (not forced): headline + instance as above → *"Reshuffle or override to improve."*
- Head balance: *"Head duties uneven — {n} referee(s) off target"* → *"{ref}: {k} Head duties over target"* / *"{ref}: {k} Head duties under target"* → *"Reshuffle or override to improve."*
- Assistant balance: *"Assistant duties uneven — {n} referee(s) off target"* → *"{ref}: {k} Assistant duties over target"* / *"…under target"* → *"Reshuffle or override to improve."*

**Yellow (one collapsed line → expands):**
- Collapsed: *"Minor fairness notes ({n})"*
- Gender: *"{ref}: uneven gender mix in {role} duties"*
- Pair: *"{refA} → {refB} paired {count}×, above the usual {cap}"*
- Sits: *"{ref}: {k} rounds resting in a row, {t1}–{t2}"*
- H→A: *"{ref}: Head at {t1} then Head at {t2} — could alternate"*

Vocabulary rule: **no "solver" in any user-facing string** — anchor to the **Generate** button verb.
