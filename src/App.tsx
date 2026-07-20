// App shell: on launch, reload the last-opened tournament (lastOpenedId -> IndexedDB record) straight
// into the wizard; otherwise show the tournament picker. The picker/reload feed a StoreProvider keyed
// by tournament id so switching tournaments remounts fresh state.

import { useEffect, useState } from "react";
import { getLastOpenedId, loadTournament, setLastOpenedId } from "./persistence/db.ts";
import { StoreProvider } from "./ui/state/store.tsx";
import { CloudDirectoryProvider } from "./ui/state/cloudDirectory.tsx";
import { DirectoryProvider } from "./ui/state/directory.tsx";
import { Wizard } from "./ui/wizard/Wizard.tsx";
import { TournamentPicker } from "./ui/picker/TournamentPicker.tsx";
import { RefereeLibrary } from "./ui/picker/RefereeLibrary.tsx";
import type { Active } from "./ui/picker/TournamentPicker.tsx";

function App() {
  const [active, setActive] = useState<Active | null>(null);
  const [loading, setLoading] = useState(true);

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

  const openActive = async (a: Active) => {
    await setLastOpenedId(a.id);
    setActive(a);
  };

  if (loading) return null;

  // DirectoryProvider wraps both branches so the referee library survives switching tournaments and is
  // reachable from Setup (add existing/new) and the picker home (manage the library).
  return (
    <CloudDirectoryProvider>
      <DirectoryProvider>
        {active ? (
          <StoreProvider key={active.id} initial={active}>
            <Wizard onExit={() => setActive(null)} />
          </StoreProvider>
        ) : (
          <>
            <TournamentPicker onOpen={openActive} />
            <RefereeLibrary />
          </>
        )}
      </DirectoryProvider>
    </CloudDirectoryProvider>
  );
}

export default App;
