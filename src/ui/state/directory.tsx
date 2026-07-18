// App-level referee directory (roster book) shared across tournaments. Loads from IndexedDB once,
// holds the library in memory, and write-throughs every mutation. Unique-name logic + snapshot rules
// live in the pure model/directory core; this provider is the React + persistence seam. It sits above
// the per-tournament StoreProvider so it survives switching tournaments.

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Referee } from "../../model/tournament.ts";
import { newRefId } from "../../model/tournament.ts";
import { deleteEntry, renameEntry, upsertNew } from "../../model/directory.ts";
import { deleteReferee, loadDirectory, putReferee } from "../../persistence/db.ts";

export interface Directory {
  library: Referee[];
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

  useEffect(() => {
    void loadDirectory().then(setLibrary);
  }, []);

  const directory: Directory = {
    library,
    addByName(name) {
      const { dir, ref, created } = upsertNew(library, name, newRefId);
      if (created) {
        setLibrary(dir);
        void putReferee(ref);
      }
      return { ref, created };
    },
    rename(id, name) {
      const res = renameEntry(library, id, name);
      if (res.ok) {
        setLibrary(res.dir);
        const updated = res.dir.find((r) => r.id === id);
        if (updated) void putReferee(updated);
      }
      return { ok: res.ok, reason: res.reason };
    },
    remove(id) {
      setLibrary(deleteEntry(library, id));
      void deleteReferee(id);
    },
  };

  return <DirectoryCtx.Provider value={directory}>{children}</DirectoryCtx.Provider>;
}

export function useDirectory(): Directory {
  const d = useContext(DirectoryCtx);
  if (!d) throw new Error("useDirectory must be used within a DirectoryProvider");
  return d;
}
