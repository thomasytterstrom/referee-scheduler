// App-level referee-directory manager (referee-directory-spec §4), shown under the tournament picker.
// Rename is uniqueness-checked; delete removes only the library entry (tournaments keep their snapshot
// copy). Rendered outside a tournament, since the directory is shared across all of them.

import { useState } from "react";
import type { Referee } from "../../model/tournament.ts";
import { sortByName } from "../../model/directory.ts";
import { useDirectory } from "../state/directory.tsx";
import { t } from "../../i18n/t.ts";
import { Button } from "../components/Button.tsx";
import styles from "./TournamentPicker.module.css";

export function RefereeLibrary() {
  const dir = useDirectory();
  const entries = sortByName(dir.library);

  return (
    <section className={styles.library}>
      <h2 className={styles.libraryTitle}>{t("library.title")}</h2>
      <p className={styles.librarySub}>{t("library.subtitle")}</p>
      {entries.length === 0 ? (
        <p className={styles.empty}>{t("library.empty")}</p>
      ) : (
        <ul className={styles.list}>
          {entries.map((r) => (
            <LibraryRow key={r.id} entry={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LibraryRow({ entry }: { entry: Referee }) {
  const dir = useDirectory();
  const [draft, setDraft] = useState(entry.name);
  const [error, setError] = useState("");

  const commit = () => {
    const name = draft.trim();
    if (!name || name === entry.name) {
      setDraft(entry.name); // revert empties / no-ops
      setError("");
      return;
    }
    const res = dir.rename(entry.id, name);
    if (res.ok) {
      setError("");
    } else {
      setError(res.reason === "duplicate" ? t("library.duplicate", { name }) : "");
      setDraft(entry.name);
    }
  };

  const remove = () => {
    if (window.confirm(t("library.confirmDelete", { name: entry.name }))) dir.remove(entry.id);
  };

  return (
    <li className={styles.row}>
      <input
        className={styles.libraryInput}
        value={draft}
        aria-label={t("library.rename")}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      {error && <span className={styles.libraryError}>{error}</span>}
      <Button variant="danger" onClick={remove}>
        {t("common.delete")}
      </Button>
    </li>
  );
}
