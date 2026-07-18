# 03 — Constraint spec for N refs / M courts

Type: grilling
Status: resolved
Blocked by: 01

## Question

Formalize every scheduling constraint as math parametrized by **N** (referees) and **M** (courts)
with synchronized rounds — replacing the hardcoded `4` / single-court assumptions in
`src/vba/mod_Score.bas`.

Cover:

- **Rest rule (new #1):** ≤2 consecutive active duties (Head *or* Assist), 1-slot rest resets.
  Define penalty shape and its **weight relative to H/A balance** (must outrank it but stay soft
  so it bends only when physically impossible).
- **Head / Assistant balance:** targets = matches / N (per role), penalty shape, hard cap.
- **Fine gender balance:** per-ref H-W / H-M / A-W / A-M targets from actual gender counts / N.
- **Pair variety:** ordered (Head→Asst) and unordered caps as **formulas of N** (today: 2 / 3,
  tuned for 4 refs) — derive general forms.
- **≤3 consecutive sits:** redefine "sit" under multi-court rounds (a ref is active if on any
  court that round; sitting = idle round).
- **H→A back-to-back:** within-day preference, unchanged in spirit.
- **Cross-day carryover:** exact math for refs present **both** days — how day-1 finalized counts
  + pair history seed day-2 targets; one-day refs count only their own.
- **Hard rules:** one-ref-per-round, availability, pins.
- **Validation preconditions:** e.g. N ≥ 2M to staff a full round, N > 2M to allow rest.

Decide final priority weights. Reference `mod_Score.bas` for current shapes. Use `/grilling` +
`/domain-modeling`. Output: constraint spec section linked here. Feeds ticket 04.

## Answer

Full spec: [constraint-spec.md](../constraint-spec.md).

Resolutions:
- **Rest rule (new #1, w=5000):** `Σ(streak−2)²` over runs of >2 consecutive duties (Head or
  Assist); dominant weight so it bends only when physically forced (not lexicographic).
- **Balance (w=1000 each):** Head/Assistant targets **availability-proportional**
  (`total × availRounds_r / Σ availRounds`), not flat `n/N`.
- **Gender fine (w=200):** same proportional formula, 4 buckets H-W/H-M/A-W/A-M.
- **Pair variety (w=50):** caps as formulas — `cap_unord = ceil(P/(N(N−1)/2))`,
  `cap_ord = ceil(P/(N(N−1)))`, `P` = Head+Assistant match count. Reproduces today's 3/2 at
  N=4,P=16.
- **≤3 consecutive sits (w=30):** sit = available-but-unassigned round; unavailable breaks streak.
- **H→A back-to-back (w=10):** round-based, mild nudge.
- **Carryover:** cumulative-target model — init accumulators + pair matrix from finalized days,
  target against cumulative totals & cumulative availability; evens tournament-wide totals.
- **Validation:** hard-fail per-round when duty demand > available refs (replaces crude
  `N ≥ 2M`); warn when rest looks infeasible.
