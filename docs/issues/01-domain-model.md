# 01 — Domain model

Type: grilling
Status: resolved
Blocked by: none

## Question

Define the formal domain model / schema for the web app — the entities, their fields and
relationships, that every downstream ticket (constraints, solver, UI, persistence) builds on.

At minimum, pin down:

- **Tournament** — top-level container; two Days.
- **Day** — has a roster (may differ per day), a set of Rounds, availability.
- **Round** — integer index within a day; synchronizes time across courts.
- **Court** — **named** entity (names from import, editable); count derived from list.
- **Referee** — **named** entity; count derived from list. Per-day, per-round **availability**.
- **Match** — belongs to (day, round, court); gender (W/M); start time; optional
  "important/final" display tag; refs-per-match (configurable, default Head + 1 Assistant).
- **Assignment** — match → Head referee + Assistant referee(s); pin/lock state per slot.
- **Carryover state** — how a finalized day's counts + pair history are represented so the next
  day can read them for refs present both days.
- **Solve state** — how a partially-solved / per-day-independent tournament is stored.

Decide identity, cardinality, invariants (e.g. a ref appears ≤ once per round), and how rounds
index time. Reference the existing VBA UDTs in `src/vba/mod_Types.bas` (`tMatch`, `tAssign`,
`tRefStats`) as a starting point — but rescale from fixed 4 refs / 1 court.

Use `/domain-modeling`. Output: a domain-model doc (entities + fields + invariants) linked here.
This ticket blocks 03, 05, 06.

## Answer

Full model: [domain-model.md](../domain-model.md).

Key resolutions from grilling:
- **Identity:** Referees + Courts are tournament-wide rosters, each a stable `id` + mutable
  `name`. Pairing history + carryover key on `id`. Days reference subsets.
- **Grid:** per-day integer **Rounds** synchronize time across courts; grid is **sparse** — a
  `(day, round, court)` cell holds 0 or 1 Match; courts may sit idle.
- **Match:** `gender` W/M; `requiresAssistant` is **per-match** (Head always, Assistant 0/1 —
  never more than one of each); plus optional display fields (`startTime`, `matchNo`,
  `homeTeam`/`awayTeam`, `highlight`).
- **Assignment/Slot:** Head slot always + Assistant slot iff required; each slot independently
  **pinnable** (`refId | null`, `pinned`).
- **Availability:** per-referee, **per-round** within a day (default all rounds).
- **Days:** variable list (K ≥ 1), not hardcoded 2. Each Day `status` = draft/finalized;
  finalize **reversible**. **Carryover computed live** from finalized days' assignments (no
  stored snapshot), summed over prior finalized days, filtered to refs present in the target day.
- **Invariants:** cell uniqueness; one duty per ref per round; availability respected; Head ≠
  Assistant; pins never overwritten.
