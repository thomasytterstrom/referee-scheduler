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
import type { DirectoryRecord } from "./directorySync.ts";

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
  // excluded from tournament JSON export (referee-directory-spec.md). v3 adds sync metadata and
  // tombstones; old `{id,name}` records are upgraded lazily on read.
  referees: { key: string; value: StoredReferee };
}

const DB_NAME = "referee-scheduler";
// v2 adds the `referees` store; v3 stores sync metadata/tombstones in that store.
const DB_VERSION = 3;
const LAST_OPENED = "lastOpenedId";
const LEGACY_DIRECTORY_UPDATED_AT = "1970-01-01T00:00:00.000Z";

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

export interface StoredReferee extends Referee {
  updatedAt?: string;
  deletedAt?: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function asDirectoryRecord(ref: StoredReferee): DirectoryRecord {
  return {
    id: ref.id,
    name: ref.name,
    updatedAt: ref.updatedAt ?? LEGACY_DIRECTORY_UPDATED_AT,
    deletedAt: ref.deletedAt ?? null,
  };
}

export async function loadDirectory(): Promise<Referee[]> {
  const rows = await loadDirectoryRecords();
  return rows.filter((r) => !r.deletedAt).map(({ id, name }) => ({ id, name }));
}

export async function loadDirectoryRecords(): Promise<DirectoryRecord[]> {
  const rows = await (await db()).getAll("referees");
  return rows.map(asDirectoryRecord);
}

export async function saveDirectoryRecords(rows: DirectoryRecord[]): Promise<void> {
  const database = await db();
  const tx = database.transaction("referees", "readwrite");
  await Promise.all(
    rows.map((row) =>
      tx.store.put({
        id: row.id,
        name: row.name,
        updatedAt: row.updatedAt,
        deletedAt: row.deletedAt ?? null,
      }),
    ),
  );
  await tx.done;
}

export async function putReferee(ref: Referee, updatedAt = nowIso()): Promise<DirectoryRecord> {
  const record: DirectoryRecord = { id: ref.id, name: ref.name, updatedAt, deletedAt: null };
  await (await db()).put("referees", record);
  return record;
}

export async function deleteReferee(id: string, updatedAt = nowIso()): Promise<DirectoryRecord> {
  const existing = await (await db()).get("referees", id);
  const record: DirectoryRecord = {
    id,
    name: existing?.name ?? "",
    updatedAt,
    deletedAt: updatedAt,
  };
  await (await db()).put("referees", record);
  return record;
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
