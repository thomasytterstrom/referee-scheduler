# Domain Model — Web Referee Scheduler

Resolves ticket [01 — Domain model](issues/01-domain-model.md). Feeds Constraint spec (03),
UI/UX (05), Persistence (06). Prior art: VBA `src/vba/mod_Types.bas` (`tMatch`, `tAssign`,
`tRefStats`), rescaled from fixed 4 refs / 1 court / 2 days to N refs / M courts / K days with
synchronized rounds.

Status: **settled**.

## Core shape

A **Tournament** owns two roster lists — **Referees** and **Courts** — and an ordered list of
**Days**. Each Day references subsets of those rosters, is solved **independently**, and (once
finalized) contributes **carryover** to later days. Time within a day is a sequence of
synchronized **Rounds**; a **Match** lives in a unique `(day, round, court)` cell. The solver
produces an **Assignment** per match: a Head slot and (when required) an Assistant slot.

## Entities

### Referee
| field | type | notes |
|---|---|---|
| `id` | stable id (uuid/slug) | **identity** — survives rename, distinguishes same-named refs |
| `name` | string (mutable) | display label, from import or manual entry |

Tournament-wide roster. Pairing history + carryover key on `id`, never `name`.

### Court
| field | type | notes |
|---|---|---|
| `id` | stable id | identity |
| `name` | string (mutable) | real court name (from import; not just "Court 1..8") |

Tournament-wide roster.

### Tournament
| field | type | notes |
|---|---|---|
| `referees` | Referee[] | full roster |
| `courts` | Court[] | full roster |
| `days` | Day[] | ordered, length **K ≥ 1** (variable; not hardcoded 2) |

No `assistantsPerMatch` — assistant need is **per match** (see Match).

### Day
| field | type | notes |
|---|---|---|
| `index` | int | position in `tournament.days` |
| `status` | `draft \| finalized` | finalize is **reversible** → back to draft |
| `availableCourtIds` | id[] | subset of court roster used this day |
| `availability` | `{ refId → availableRounds }` | available refs this day; each optionally restricted to a subset of the day's round indices (**default = all rounds**). Absent refId = not available this day |
| `rounds` | Round[] | synchronized time slots (see Round) |

Solved independently; roster may differ per day. Finalizing a day makes it a carryover source
for later days; re-opening (→ draft) flags dependent later days as **possibly stale**.

### Round
| field | type | notes |
|---|---|---|
| `index` | int | per-day integer; synchronizes time across courts |
| `matches` | Match[] | **sparse**: 1..M matches; courts may sit idle this round |

`startTime?` may annotate a round for display; the **index is authoritative** for the solver.

### Match
Lives in a unique `(day, round, court)` cell — at most one match per cell.

| field | type | notes |
|---|---|---|
| `id` | stable id | identity |
| `courtId` | id | the cell's court (day+round from its Round) |
| `gender` | `W \| M` | no mixed |
| `requiresAssistant` | boolean | Head always required; Assistant needed only when true. Varies per match |
| `startTime?` | string | display; import snaps it → round index |
| `matchNo?` | string | external match number (Excel `KampNr`); display + import key |
| `homeTeam?` / `awayTeam?` | string | team labels, display only |
| `highlight?` | boolean | optional "final/important" display tag — **no solver logic** |

**Never more than one Head and one Assistant.**

### Assignment (per match)
| field | type | notes |
|---|---|---|
| `matchId` | id | |
| `head` | Slot | always present |
| `assistant` | Slot \| null | present iff `match.requiresAssistant` |

### Slot
| field | type | notes |
|---|---|---|
| `refId` | id \| null | assigned referee, or empty when unsolved |
| `pinned` | boolean | per-slot lock; solver works around pinned slots |

### Carryover (derived, not stored)
Computed **live** from finalized days' assignments — assignments are the single source of truth.
For a target Day D, per referee present in D's availability, sum over **all finalized days
before D**:
- `HCount`, `ACount` (Head / Assistant duty totals)
- gender splits `HW, HM, AW, AM`
- ordered + unordered **pair counts** (Head→Asst and unordered co-assignment)

Refs appearing only from Day D start at zero. Editing a finalized day recomputes carryover; its
dependents are flagged possibly-stale.

## Invariants

1. `(day, round, court)` unique → at most one match per cell.
2. A referee appears **at most once per `(day, round)`** across all courts (hard: one duty/round).
3. A slot's `refId` must be a referee available that **day and round**.
4. Head slot always exists; Assistant slot exists **iff** `requiresAssistant`.
5. Head `refId` ≠ Assistant `refId` on the same match.
6. Pinned slots are never overwritten by the solver.
7. Staffing feasibility (validation, not a stored invariant): a round needs enough available
   refs to cover its matches' duties; rest-rule wants slack. (Exact preconditions → ticket 03.)

## Notes for downstream tickets

- **Constraints (03):** duty = Head **or** Assistant occupancy of a round; "sit" = idle round.
  Carryover stats above seed day targets. Balance targets scale by count of available refs.
- **UI (05):** grid cell = `(round, court)`; empty cells allowed; per-ref color by `id`.
- **Persistence (06):** everything above is plain serializable data keyed by stable ids; carryover
  is recomputed, not persisted.
