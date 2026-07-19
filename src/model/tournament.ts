// Canonical serializable Tournament object graph (domain-model.md §Entities + §Invariants).
// Stable string ids are identity — they survive renames and distinguish same-named refs. Everything
// here is plain JSON data (no Map/Set): persistence serializes it verbatim; carryover is derived
// live (never stored). Names are mutable display labels.

export type Gender = "W" | "M";

export interface Referee {
  id: string; // identity — pairing history + carryover key on this, never `name`
  name: string;
}

export interface Court {
  id: string;
  name: string; // real court name (from import), not just "Court 1..8"
}

export interface Slot {
  refId: string | null; // assigned referee, or null when unsolved
  pinned: boolean; // per-slot lock; the solver never overwrites a pinned slot
}

export interface Assignment {
  matchId: string;
  head: Slot; // always present (invariant 4)
  assistant: Slot | null; // present iff match.requiresAssistant
}

export interface Match {
  id: string; // identity
  courtId: string; // the cell's court; day + round come from the owning Round
  gender: Gender; // no mixed
  requiresAssistant: boolean; // Head always required; Assistant only when true
  startTime?: string; // display; import snaps it -> round index
  matchNo?: string; // external match number (Excel KampNr)
  homeTeam?: string;
  awayTeam?: string;
  matchName?: string; // optional round label (e.g. "Final"); present => "important" bar, no solver logic
}

export interface Round {
  index: number; // per-day 0-based; authoritative round number for the solver
  startTime?: string; // display only
  matches: Match[]; // sparse: 1..M matches; courts may sit idle this round
}

export interface Day {
  index: number; // position in tournament.days
  availableCourtIds: string[]; // subset of the court roster used this day
  // refId -> available round indices this day. `null` = all of the day's rounds (the default);
  // an array restricts to a subset. An absent refId = not available this day.
  availability: Record<string, number[] | null>;
  rounds: Round[]; // synchronized time slots
  assignments: Assignment[]; // the day's solution; at most one per match
}

export interface Tournament {
  referees: Referee[]; // full roster
  courts: Court[]; // full roster
  days: Day[]; // ordered, length K >= 1
}

// --- id-mint helpers (uuid, prefixed by entity for readability) -------------

export const newRefId = (): string => `ref-${crypto.randomUUID()}`;
export const newCourtId = (): string => `court-${crypto.randomUUID()}`;
export const newMatchId = (): string => `match-${crypto.randomUUID()}`;
