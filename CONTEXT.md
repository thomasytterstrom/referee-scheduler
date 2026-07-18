# Referee Scheduler

Assigns referees to volleyball tournament matches across multiple days, balancing load and other soft constraints while respecting availability.

## Language

**Duty**:
A single referee assignment to one match, as either Head or Assistant. A match has one Head duty and, when it requires an assistant, one Assistant duty. Load fairness is measured in duties, counted separately for Head and Assistant.
_Avoid_: match (a match is the game; a duty is one ref's role in it), assignment (the persisted record; a duty is the conceptual unit)

**Carryover**:
The cumulative duty, pairing, and availability totals a referee has accrued on all earlier days of the tournament, folded into the current day's scoring so load balances across the whole tournament, not just within one day. Derived live from earlier days' assignments — never stored.
_Avoid_: history, running total

**Head** / **Assistant**:
The two referee roles on a match. Head is always required; Assistant only when the match requires one. Balanced independently.
