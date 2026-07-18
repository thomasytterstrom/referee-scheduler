// App shell: on launch, reload the last-opened tournament (lastOpenedId -> IndexedDB record) straight
// into the wizard; otherwise show the tournament picker. The picker/reload feed a StoreProvider keyed
// by tournament id so switching tournaments remounts fresh state.

import { useEffect, useState } from "react";
import { getLastOpenedId, loadTournament, setLastOpenedId } from "./persistence/db.ts";
import { StoreProvider } from "./ui/state/store.tsx";
import { Wizard } from "./ui/wizard/Wizard.tsx";
import { TournamentPicker } from "./ui/picker/TournamentPicker.tsx";
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
  if (!active) return <TournamentPicker onOpen={openActive} />;

  return (
    <StoreProvider key={active.id} initial={active}>
      <Wizard onExit={() => setActive(null)} />
    </StoreProvider>
  );
}

export default App;
