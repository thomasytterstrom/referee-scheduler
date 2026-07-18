# Constraint Spec — Web Referee Scheduler

Resolves ticket [03 — Constraint spec](issues/03-constraint-spec.md). Builds on
[domain-model.md](domain-model.md). Feeds Solver decision (04). Prior art:
`src/vba/mod_Score.bas` (squared-deviation × weight scoring) — rescaled from fixed 4 refs /
1 court to **N refs / M courts** with synchronized rounds, availability, and cross-day carryover.

Scoring is a weighted sum of penalties; the solver minimizes it. All soft penalties are
**squared** (one ref far off hurts more than several slightly off). Higher weight = higher
priority.

## Definitions

- **Round** — per-day integer time slot; synchronizes all courts.
- **Duty** — a ref occupying a Head *or* Assistant slot in a round. A ref has ≤1 duty per round
  (hard).
- **Active round** — a round where the ref has a duty. **Sit** — a round where the ref is
  **available but has no duty**.
- **Available rounds** `availRounds_r` — rounds ref r is available that day (per-round
  availability from the model).
- `P` — count of **Head+Assistant** matches (matches with `requiresAssistant`); the only matches
  that form pairs. Head-only matches contribute no pair.

Balance/gender/pair use **cumulative** accumulators across finalized days (see Carryover).

## Weights (descending priority)

| # | Constraint | Weight | Shape |
|---|---|---|---|
| 1 | **Rest rule** — ≤2 consecutive duties | **5000** | `Σ (streak − 2)²` over each run of >2 consecutive active rounds |
| 2 | **Head balance** | 1000 | `(actualH − targetH)²` per ref |
| 2 | **Assistant balance** | 1000 | `(actualA − targetA)²` per ref |
| 3 | **Fine gender balance** | 200 | `Σ (actual − target)²` over the 4 buckets H-W/H-M/A-W/A-M |
| 4 | **Pair variety** | 50 | `(count − cap)²` over each over-cap ordered and unordered pair |
| 5 | **≤3 consecutive sits** | 30 | `(sitStreak − 3)²` over each run of >3 consecutive sits |
| 6 | **H→A back-to-back** | 10 | +1 per violation (see below) |

Rest rule's dominant weight (5000 ≫ 1000) means it bends **only when physically forced** (too
few refs for a round), not traded away for balance.

## Constraint details

### 1. Rest rule (≤2 consecutive duties) — w=5000
A **streak** = consecutive active rounds (Head or Assist) within a day. ≤2 fine. For each streak
of length `s > 2`, add `(s − 2)²`. Unavailable rounds break a streak.

### 2. Head / Assistant balance — w=1000 each
Targets are **availability-proportional** (not flat):
```
targetH_r = totalHeadDuties_cum × (availRounds_cum_r / Σ_j availRounds_cum_j)
targetA_r = totalAsstDuties_cum × (availRounds_cum_r / Σ_j availRounds_cum_j)
```
- `totalHeadDuties` = match count; `totalAsstDuties` = count of `requiresAssistant` matches.
- `_cum` = summed over all finalized days + the day being solved (see Carryover).
- Penalty `(actual_cum_r − target_r)²`. A part-time ref gets a proportionally smaller target;
  respects capacity (a ref available R rounds can do ≤ R duties).

### 3. Fine gender balance — w=200
Same proportional formula, four buckets per ref: H-W, H-M, A-W, A-M. Each bucket's target =
(that gender-role's cumulative total) × `availRounds_cum_r / Σ availRounds_cum`. Penalty = sum of
squared deviations over the 4 buckets.

### 4. Pair variety — w=50
Pairs form only on Head+Assistant matches. With `N` = available refs and cumulative `P`:
```
cap_unordered = ceil(P_cum / (N(N−1)/2))
cap_ordered   = ceil(P_cum / (N(N−1)))
```
Penalty `(count − cap)²` for each ordered (Head→Asst) and unordered pair over its cap.
Sanity: N=4, P=16 → unordered cap 3, ordered cap 2 (reproduces the current hand-tuned constants).
Pair counts are seeded from finalized days (avoids repeating prior-day pairings).

### 5. ≤3 consecutive sits — w=30
A **sit** = available-but-unassigned round. For each run of `k > 3` consecutive sits, add
`(k − 3)²`. Unavailable rounds break the run (leaving and returning ≠ sitting through).

### 6. H→A back-to-back — w=10
Within a day: if ref is **Head** in round r and also active in round r+1, prefer that duty be
**Assistant** (not Head again). +1 per violation. Weakest nudge; rest rule dominates.

## Carryover (cross-day)

When solving day D, prior finalized days are **locked** (not re-solved). For every ref:
- Initialize balance/gender accumulators with the **sum of that ref's counts over all finalized
  days before D**; initialize the pair-count matrix likewise.
- Compute **cumulative targets** against cumulative totals + cumulative available rounds (formulas
  above with `_cum`).
- The solver places only day D's assignments, pulling cumulative actuals toward cumulative
  targets → tournament-wide totals even out for refs present multiple days.
- Refs appearing only on day D have zero carryover (target = their day-D share).

Editing a finalized day recomputes carryover live; dependent later days flagged possibly-stale.

## Validation preconditions

- **Hard fail (block solve, name the offending round):** any round where **duty demand >
  available refs**. Demand = Σ over the round's matches of (1 if Head-only, 2 if Head+Assistant).
  Subsumes "≥2 refs needed for a Head≠Assistant match." Replaces the crude global `N ≥ 2M`.
- **Warn (don't block):** rest rule likely unsatisfiable — demand equals available refs across
  ≥3 consecutive rounds (no slack to rest). Solver still runs (rest is soft); warning surfaces
  in the warnings panel.
- Availability, pins, Head ≠ Assistant, gender W/M — enforced hard by the model.

## Hard constraints (never violated)

1. One duty per ref per `(day, round)` across all courts.
2. Ref assigned only when available that day **and** round.
3. Pinned slots never overwritten.
4. Head refId ≠ Assistant refId on the same match.
