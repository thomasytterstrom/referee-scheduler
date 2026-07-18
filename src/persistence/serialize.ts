// The one serialize/deserialize pair over the canonical Tournament graph (persistence-spec §0, §3).
// serialize wraps the object in a thin versioned envelope; deserialize applies the version policy
// (via migrate) and confirms the payload really is a Tournament before returning it. Carryover is
// never part of the graph, so it is inherently never serialized; UI-transient state lives elsewhere.

import type { Tournament } from "../model/tournament.ts";
import { migrate, SCHEMA_VERSION } from "./migrate.ts";

export const APP_VERSION = "0.1.0";

// The JSON export/IndexedDB envelope. schemaVersion is a plain number (not the v1 literal) because
// migrate must read envelopes of any version, including ones newer than this app.
export interface Envelope {
  schemaVersion: number;
  exportedAt: string; // ISO-8601
  appVersion: string;
  tournament: Tournament;
}

export function serialize(t: Tournament): Envelope {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    tournament: t,
  };
}

// Load an envelope object (already JSON-parsed) back into a Tournament. migrate owns envelope +
// version validation; here we add the payload-shape guard so we never half-load a garbage tournament.
export function deserialize(obj: unknown): Tournament {
  const t = migrate(obj);
  if (!Array.isArray(t.referees) || !Array.isArray(t.courts) || !Array.isArray(t.days))
    throw new Error("Malformed backup: tournament is missing referees/courts/days.");
  return t;
}
