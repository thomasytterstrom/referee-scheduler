// Local IndexedDB library of N tournaments (persistence-spec §2), a thin idb wrapper. Store
// `tournaments` keyed by tournament id; each record is the canonical Tournament plus the envelope
// fields {id, name, updatedAt} so the picker can list without deserializing every record. A tiny
// `meta` store holds lastOpenedId. Autosave debounces writes (~500ms) and bumps updatedAt on save.
//
// NOT unit-tested for MVP (no fake-indexeddb): the browser provides IndexedDB. The solver (Web
// Worker) never touches this layer — it only sees the deserialized Tournament object.

import { openDB } from "idb";
import type { DBSchema, IDBPDatabase } from "idb";
import type { Referee, Tournament } from "../model/tournament.ts";

// Envelope fields duplicated out of the record for cheap listing.
export interface TournamentMeta {
  id: string;
  name: string;
  updatedAt: string; // ISO-8601
}

// One IndexedDB record: the meta fields (in-line key on `id`) + the full tournament graph.
export interface StoredTournament extends TournamentMeta {
  tournament: Tournament;
}

interface SchedulerDB extends DBSchema {
  tournaments: { key: string; value: StoredTournament };
  meta: { key: string; value: string };
  // App-level referee directory (roster book), keyed by referee id; shared across tournaments and
  // excluded from tournament JSON export (referee-directory-spec.md).
  referees: { key: string; value: Referee };
}

const DB_NAME = "referee-scheduler";
// v2 adds the `referees` store; the guarded creates make upgrade idempotent for fresh + existing DBs.
const DB_VERSION = 2;
const LAST_OPENED = "lastOpenedId";

let dbPromise: Promise<IDBPDatabase<SchedulerDB>> | undefined;

function db(): Promise<IDBPDatabase<SchedulerDB>> {
  return (dbPromise ??= openDB<SchedulerDB>(DB_NAME, DB_VERSION, {
    upgrade(d) {
      if (!d.objectStoreNames.contains("tournaments"))
        d.createObjectStore("tournaments", { keyPath: "id" });
      if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta");
      if (!d.objectStoreNames.contains("referees"))
        d.createObjectStore("referees", { keyPath: "id" });
    },
  }));
}

// Write the whole tournament back under its id, stamping a fresh updatedAt (§2.2: every edit saves).
export async function saveTournament(rec: {
  id: string;
  name: string;
  tournament: Tournament;
}): Promise<void> {
  const record: StoredTournament = { ...rec, updatedAt: new Date().toISOString() };
  await (await db()).put("tournaments", record);
}

export async function loadTournament(id: string): Promise<StoredTournament | undefined> {
  return (await db()).get("tournaments", id);
}

export async function listTournaments(): Promise<TournamentMeta[]> {
  const all = await (await db()).getAll("tournaments");
  return all.map(({ id, name, updatedAt }) => ({ id, name, updatedAt }));
}

export async function deleteTournament(id: string): Promise<void> {
  await (await db()).delete("tournaments", id);
}

// --- Referee directory (app-level roster book; unique names live in the pure model/directory core) ---

export async function loadDirectory(): Promise<Referee[]> {
  return (await db()).getAll("referees");
}

export async function putReferee(ref: Referee): Promise<void> {
  await (await db()).put("referees", ref);
}

export async function deleteReferee(id: string): Promise<void> {
  await (await db()).delete("referees", id);
}

export async function getLastOpenedId(): Promise<string | undefined> {
  return (await db()).get("meta", LAST_OPENED);
}

export async function setLastOpenedId(id: string): Promise<void> {
  await (await db()).put("meta", id, LAST_OPENED);
}

// Debounced autosave: coalesce a burst of edits into one write ~`delayMs` after the last change.
// Returns a `(rec) => void` to call on every mutation; the final call in a burst wins.
export function createAutosave(
  delayMs = 500,
): (rec: { id: string; name: string; tournament: Tournament }) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (rec) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void saveTournament(rec);
    }, delayMs);
  };
}
