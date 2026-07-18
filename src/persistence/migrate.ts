// Version-policy seam (persistence-spec §3.2). Given a raw (JSON-parsed) envelope, dispatch on
// schemaVersion: newer than this app -> refuse; older-known -> run vN->vN+1 upgraders in sequence;
// equal -> pass through. A malformed/missing envelope throws — never half-load. MVP ships only v1, so
// UPGRADERS is empty today, but the dispatch table exists so old backups never become unreadable.

import type { Envelope } from "./serialize.ts";
import type { Tournament } from "../model/tournament.ts";

export const SCHEMA_VERSION = 1;

// vN -> vN+1, keyed by source version. Each entry rewrites an envelope up one schema step.
// e.g. 1: (e) => ({ ...e, schemaVersion: 2, tournament: upgradeV1toV2(e.tournament) })
const UPGRADERS: Record<number, (e: Envelope) => Envelope> = {};

export function migrate(obj: unknown): Tournament {
  let env = asEnvelope(obj);
  if (env.schemaVersion > SCHEMA_VERSION)
    throw new Error(
      `Backup was exported by a newer version (schema ${env.schemaVersion} > ${SCHEMA_VERSION}) — update the app.`,
    );
  while (env.schemaVersion < SCHEMA_VERSION) {
    const up = UPGRADERS[env.schemaVersion];
    if (!up) throw new Error(`No migration path from schema ${env.schemaVersion}.`);
    env = up(env);
  }
  return env.tournament;
}

function asEnvelope(obj: unknown): Envelope {
  if (typeof obj !== "object" || obj === null) throw new Error("Malformed backup: not an object.");
  const e = obj as Record<string, unknown>;
  if (typeof e.schemaVersion !== "number")
    throw new Error("Malformed backup: missing numeric schemaVersion.");
  if (typeof e.tournament !== "object" || e.tournament === null)
    throw new Error("Malformed backup: missing tournament.");
  return obj as Envelope;
}
