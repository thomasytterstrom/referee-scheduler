// Launch picker (shown when there is no lastOpenedId): the IndexedDB library of tournaments with
// open / delete, plus "New tournament". A new tournament is persisted immediately so it appears in the
// library and reload works.

import { useEffect, useState } from "react";
import type { Tournament } from "../../model/tournament.ts";
import type { TournamentMeta } from "../../persistence/db.ts";
import {
  deleteTournament,
  listTournaments,
  loadTournament,
  saveTournament,
} from "../../persistence/db.ts";
import { t } from "../../i18n/t.ts";
import { Button } from "../components/Button.tsx";
import styles from "./TournamentPicker.module.css";

export interface Active {
  id: string;
  name: string;
  tournament: Tournament;
}

const emptyTournament = (): Tournament => ({ referees: [], courts: [], days: [] });
const newId = (): string => `tourn-${crypto.randomUUID()}`;

export function TournamentPicker({ onOpen }: { onOpen: (a: Active) => void | Promise<void> }) {
  const [list, setList] = useState<TournamentMeta[]>([]);

  const refresh = () =>
    listTournaments().then((l) =>
      setList([...l].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
    );
  useEffect(() => {
    void refresh();
  }, []);

  const create = async () => {
    const rec: Active = { id: newId(), name: t("wizard.picker.defaultName"), tournament: emptyTournament() };
    await saveTournament(rec);
    await onOpen(rec);
  };

  const open = async (id: string) => {
    const rec = await loadTournament(id);
    if (rec) await onOpen({ id: rec.id, name: rec.name, tournament: rec.tournament });
  };

  const remove = async (id: string) => {
    await deleteTournament(id);
    await refresh();
  };

  return (
    <div className={styles.picker}>
      <h1 className={styles.title}>{t("common.appName")}</h1>
      <Button variant="primary" className={styles.newBtn} onClick={create}>
        {t("wizard.picker.new")}
      </Button>

      {list.length === 0 ? (
        <p className={styles.empty}>{t("wizard.picker.empty")}</p>
      ) : (
        <ul className={styles.list}>
          {list.map((m) => (
            <li key={m.id} className={styles.row}>
              <button type="button" className={styles.openBtn} onClick={() => open(m.id)}>
                <span className={styles.name}>{m.name}</span>
                <span className={styles.date}>
                  {t("wizard.picker.updated", { date: new Date(m.updatedAt).toLocaleString() })}
                </span>
              </button>
              <Button variant="danger" onClick={() => remove(m.id)}>
                {t("common.delete")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
