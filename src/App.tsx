// App shell: on launch, reload the last-opened tournament (lastOpenedId -> IndexedDB record) straight
// into the wizard; otherwise show the tournament picker. The picker/reload feed a StoreProvider keyed
// by tournament id so switching tournaments remounts fresh state.
//
// When signed in (Supabase session available), tournaments are stored in the cloud (issue #9). A
// CloudTournamentsProvider wraps the picker so the cloud list is available and saves are dual-written.

import { useEffect, useState } from "react";
import { getLastOpenedId, listTournaments, loadTournament, setLastOpenedId } from "./persistence/db.ts";
import { StoreProvider } from "./ui/state/store.tsx";
import { CloudDirectoryProvider, useCloudDirectory } from "./ui/state/cloudDirectory.tsx";
import { CloudTournamentsProvider } from "./ui/state/cloudTournaments.tsx";
import { DirectoryProvider } from "./ui/state/directory.tsx";
import { Wizard } from "./ui/wizard/Wizard.tsx";
import { TournamentPicker } from "./ui/picker/TournamentPicker.tsx";
import { RefereeLibrary } from "./ui/picker/RefereeLibrary.tsx";
import type { Active } from "./ui/picker/TournamentPicker.tsx";
import { migrateLocalTournamentsToCloud } from "./persistence/supabaseTournaments.ts";
import { saveCloudTournament } from "./persistence/supabaseTournaments.ts";

function AppInner() {
  const { session, client } = useCloudDirectory();
  const [active, setActive] = useState<Active | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrationDone, setMigrationDone] = useState(false);

  // Re-run when auth state changes so the picker refreshes.
  useEffect(() => {
    void (async () => {
      const id = await getLastOpenedId();
      if (id) {
        const rec = await loadTournament(id);
        if (rec) setActive({ id: rec.id, name: rec.name, tournament: rec.tournament });
      }
      setLoading(false);
    })();
  }, []);

  // First-sign-in migration: upload local tournaments to cloud once per session.
  useEffect(() => {
    if (!session || !client || migrationDone) return;
    setMigrationDone(true);
    void (async () => {
      try {
        const localMetas = await listTournaments();
        const locals = await Promise.all(
          localMetas.map(async (m) => {
            const rec = await loadTournament(m.id);
            return rec ? { id: rec.id, name: rec.name, tournament: rec.tournament } : null;
          }),
        );
        const toUpload = locals.filter(Boolean) as Array<{
          id: string;
          name: string;
          tournament: import("./model/tournament.ts").Tournament;
        }>;
        await migrateLocalTournamentsToCloud(client, toUpload, session.user.id);
      } catch {
        // Silent: local data is safe.
      }
    })();
  }, [session, client, migrationDone]);

  const openActive = async (a: Active) => {
    await setLastOpenedId(a.id);
    setActive(a);
  };

  if (loading) return null;

  // Build a cloud save callback when signed in.
  const cloudSave =
    session && client
      ? async (rec: {
          id: string;
          name: string;
          tournament: import("./model/tournament.ts").Tournament;
          lastKnownUpdatedAt: string | null;
        }) => {
          const result = await saveCloudTournament(client, rec, session.user.id);
          return result;
        }
      : undefined;

  const storeInitial = active
    ? {
        ...active,
        ownerId: active.ownerId,
        cloudUpdatedAt: active.cloudUpdatedAt,
        onCloudSave: cloudSave,
      }
    : null;

  return (
    <DirectoryProvider>
      {active && storeInitial ? (
        <StoreProvider key={active.id} initial={storeInitial}>
          <Wizard onExit={() => setActive(null)} />
        </StoreProvider>
      ) : (
        <>
          <TournamentPicker onOpen={openActive} />
          <RefereeLibrary />
        </>
      )}
    </DirectoryProvider>
  );
}

function App() {
  return (
    <CloudDirectoryProvider>
      <AppWithCloud />
    </CloudDirectoryProvider>
  );
}

function AppWithCloud() {
  const { session, client } = useCloudDirectory();

  if (session && client) {
    return (
      <CloudTournamentsProvider client={client} userId={session.user.id}>
        <AppInner />
      </CloudTournamentsProvider>
    );
  }

  return <AppInner />;
}

export default App;
