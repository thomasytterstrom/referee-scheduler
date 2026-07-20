// Cloud tournament state provider (issue #9).
// When signed in, this context owns the cloud tournament list and exposes CRUD / share operations.
// Anonymous users never reach this code; all operations are no-ops or throw.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { SchedulerSupabaseClient } from "../../persistence/supabaseClient.ts";
import type { TournamentStatus } from "../../persistence/db.ts";
import { listTournaments } from "../../persistence/db.ts";
import type {
  CloudEditorRecord,
  CloudTournamentMeta,
  SaveResult,
} from "../../persistence/supabaseTournaments.ts";
import {
  addCloudEditor,
  deleteCloudTournament,
  listCloudEditors,
  listCloudTournaments,
  loadCloudTournament,
  migrateLocalTournamentsToCloud,
  removeCloudEditor,
  saveCloudTournament,
  setCloudTournamentStatus,
} from "../../persistence/supabaseTournaments.ts";
import type { Tournament } from "../../model/tournament.ts";

export interface CloudTournamentsState {
  /** List of cloud tournaments for the signed-in user (own + shared). */
  list: CloudTournamentMeta[];
  loading: boolean;
  error: string | null;

  refresh(): Promise<void>;

  save(
    rec: { id: string; name: string; tournament: Tournament; lastKnownUpdatedAt: string | null },
    ownerId: string,
  ): Promise<SaveResult>;

  remove(id: string): Promise<void>;
  setStatus(id: string, status: TournamentStatus): Promise<void>;

  listEditors(tournamentId: string): Promise<CloudEditorRecord[]>;
  addEditor(tournamentId: string, email: string): Promise<void>;
  removeEditor(tournamentId: string, email: string): Promise<void>;
}

const CloudTournamentsCtx = createContext<CloudTournamentsState | null>(null);

export function CloudTournamentsProvider({
  client,
  userId,
  children,
}: {
  client: SchedulerSupabaseClient;
  userId: string;
  children: ReactNode;
}) {
  const [list, setList] = useState<CloudTournamentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [migrated, setMigrated] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listCloudTournaments(client);
      setList(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  // On first mount, run once: migrate local tournaments that aren't in the cloud yet.
  useEffect(() => {
    if (migrated) return;
    setMigrated(true);
    void (async () => {
      try {
        const local = await listTournaments();
        await migrateLocalTournamentsToCloud(
          client,
          local.map((m) => ({
            id: m.id,
            name: m.name,
            // We don't have the full tournament object here; load from IndexedDB is done in migrate.
            // Pass an empty placeholder — the migration layer will skip already-uploaded ids anyway.
            tournament: { referees: [], courts: [], days: [] } as Tournament,
          })),
          userId,
        );
      } catch {
        // Silent migration failure — local data is intact.
      }
      await refresh();
    })();
  }, [client, userId, migrated, refresh]);

  const state: CloudTournamentsState = {
    list,
    loading,
    error,
    refresh,
    async save(rec, ownerId) {
      const result = await saveCloudTournament(client, rec, ownerId);
      if (result.ok) {
        setList((prev) =>
          prev.map((m) =>
            m.id === rec.id ? { ...m, name: rec.name, updatedAt: result.updatedAt } : m,
          ),
        );
      }
      return result;
    },
    async remove(id) {
      await deleteCloudTournament(client, id);
      setList((prev) => prev.filter((m) => m.id !== id));
    },
    async setStatus(id, status) {
      await setCloudTournamentStatus(client, id, status);
      setList((prev) => prev.map((m) => (m.id === id ? { ...m, status } : m)));
    },
    listEditors: (tid) => listCloudEditors(client, tid),
    addEditor: (tid, email) => addCloudEditor(client, tid, email),
    removeEditor: (tid, email) => removeCloudEditor(client, tid, email),
  };

  return <CloudTournamentsCtx.Provider value={state}>{children}</CloudTournamentsCtx.Provider>;
}

export function useCloudTournaments(): CloudTournamentsState {
  const ctx = useContext(CloudTournamentsCtx);
  if (!ctx) throw new Error("useCloudTournaments must be used within a CloudTournamentsProvider");
  return ctx;
}

// Hook for loading a single cloud tournament (used when opening).
export async function fetchCloudTournament(
  client: SchedulerSupabaseClient,
  id: string,
) {
  return loadCloudTournament(client, id);
}
