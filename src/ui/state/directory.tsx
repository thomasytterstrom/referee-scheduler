// App-level referee directory (roster book) shared across tournaments. Loads from IndexedDB once,
// holds the library in memory, and write-throughs every mutation. Unique-name logic + snapshot rules
// live in the pure model/directory core; this provider is the React + persistence seam. It sits above
// the per-tournament StoreProvider so it survives switching tournaments.

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Referee } from "../../model/tournament.ts";
import { newRefId } from "../../model/tournament.ts";
import { deleteEntry, renameEntry, upsertNew } from "../../model/directory.ts";
import {
  deleteReferee,
  loadDirectory,
  loadDirectoryRecords,
  putReferee,
  saveDirectoryRecords,
} from "../../persistence/db.ts";
import { mergeDirectoryRecords, visibleReferees } from "../../persistence/directorySync.ts";
import type { DirectoryRecord } from "../../persistence/directorySync.ts";
import {
  loadCloudDirectory,
  saveCloudDirectory,
  saveCloudReferee,
} from "../../persistence/supabaseDirectory.ts";
import { useCloudDirectory } from "./cloudDirectory.tsx";

export interface Directory {
  library: Referee[];
  syncStatus: "local" | "syncing" | "synced" | "error";
  syncError: string | null;
  cloudName: string | null;
  // Create-or-reuse by unique name; persists a newly created entry. Returns the entry to add to a roster.
  addByName(name: string): { ref: Referee; created: boolean };
  // Uniqueness-checked rename; persists on success (referee-directory-spec §4).
  rename(id: string, name: string): { ok: boolean; reason?: "duplicate" | "not-found" };
  // Removes the library entry only; tournaments keep their snapshot copy.
  remove(id: string): void;
}

const DirectoryCtx = createContext<Directory | null>(null);

export function DirectoryProvider({ children }: { children: ReactNode }) {
  const [library, setLibrary] = useState<Referee[]>([]);
  const [syncStatus, setSyncStatus] = useState<Directory["syncStatus"]>("local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const cloud = useCloudDirectory();

  useEffect(() => {
    void loadDirectory().then(setLibrary);
  }, []);

  const persistCloudRow = (row: DirectoryRecord) => {
    const client = cloud.client;
    if (!client || !cloud.session) return;
    setSyncStatus("syncing");
    void saveCloudReferee(client, row)
      .then(() => {
        setSyncStatus("synced");
        setSyncError(null);
      })
      .catch((e: unknown) => {
        setSyncStatus("error");
        setSyncError(e instanceof Error ? e.message : String(e));
      });
  };

  useEffect(() => {
    const client = cloud.client;
    if (!client || !cloud.session) {
      setSyncStatus("local");
      setSyncError(null);
      return;
    }

    let cancelled = false;
    setSyncStatus("syncing");
    void (async () => {
      const local = await loadDirectoryRecords();
      const remote = await loadCloudDirectory(client);
      const merged = mergeDirectoryRecords(local, remote);
      await saveDirectoryRecords(merged.records);
      await saveCloudDirectory(client, merged.records);
      if (cancelled) return;
      setLibrary(visibleReferees(merged.records));
      setSyncStatus("synced");
      setSyncError(null);
    })().catch((e: unknown) => {
      if (cancelled) return;
      setSyncStatus("error");
      setSyncError(e instanceof Error ? e.message : String(e));
    });

    return () => {
      cancelled = true;
    };
  }, [cloud.session, cloud.client]);

  const directory: Directory = {
    library,
    syncStatus,
    syncError,
    cloudName: cloud.session?.user.email ?? null,
    addByName(name) {
      const { dir, ref, created } = upsertNew(library, name, newRefId);
      if (created) {
        setLibrary(dir);
        void putReferee(ref).then(persistCloudRow).catch((e: unknown) => {
          setSyncStatus("error");
          setSyncError(e instanceof Error ? e.message : String(e));
        });
      }
      return { ref, created };
    },
    rename(id, name) {
      const res = renameEntry(library, id, name);
      if (res.ok) {
        setLibrary(res.dir);
        const updated = res.dir.find((r) => r.id === id);
        if (updated)
          void putReferee(updated).then(persistCloudRow).catch((e: unknown) => {
            setSyncStatus("error");
            setSyncError(e instanceof Error ? e.message : String(e));
          });
      }
      return { ok: res.ok, reason: res.reason };
    },
    remove(id) {
      setLibrary(deleteEntry(library, id));
      void deleteReferee(id).then(persistCloudRow).catch((e: unknown) => {
        setSyncStatus("error");
        setSyncError(e instanceof Error ? e.message : String(e));
      });
    },
  };

  return <DirectoryCtx.Provider value={directory}>{children}</DirectoryCtx.Provider>;
}

export function useDirectory(): Directory {
  const d = useContext(DirectoryCtx);
  if (!d) throw new Error("useDirectory must be used within a DirectoryProvider");
  return d;
}
