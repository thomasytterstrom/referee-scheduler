# Carryover folds every earlier day automatically; no finalize step

The original design gated [[carryover]] on a per-day `finalized` status: a day counted toward later days' load balancing only once explicitly finalized. That status was specced and typed but never wired into the UI — no action ever set a day to `finalized`, so `carryoverFor` always returned an empty carry and every day was solved blind of earlier days' duty load (a referee heavy on day 1 stayed heavy on day 2).

We removed the gate and the `status`/`DayStatus` field entirely. Carryover now folds every day with a lower index than the target; unassigned slots are skipped, so partial days fold safely.

## Considered Options

- **Wire the missing Finalize action** — keep the explicit lock as designed. Rejected: adds a concept and a required click the users didn't expect, to protect against an edge (editing an earlier day after later days are generated) that carryover already handles by recomputing live on the next generate.
- **Auto-fold, drop the status (chosen)** — matches the expectation that generating a later day "just takes earlier days into account."

## Consequences

- Editing an earlier day after a later day is generated leaves the later day's assignments computed against stale carryover until it is regenerated. No stale warning exists; regenerating re-folds fresh. Accepted as out of scope.
- Persisted backups from before this change carry an inert `status` field on each day; nothing reads it. No schema bump — it will be stripped opportunistically if the schema is ever versioned up for another reason.
