// Setup — manual roster entry (referees are NOT imported) + which courts run on the selected day.

import { useState } from "react";
import { useStore } from "../state/store.tsx";
import { useDirectory } from "../state/directory.tsx";
import { sortByName } from "../../model/directory.ts";
import { t } from "../../i18n/t.ts";
import { refColor } from "../grid/refColor.ts";
import { Button } from "../components/Button.tsx";
import { StepHeader } from "../components/StepHeader.tsx";
import styles from "./Wizard.module.css";

export function SetupStep() {
  const store = useStore();
  const dir = useDirectory();
  const [refName, setRefName] = useState("");
  const [courtName, setCourtName] = useState("");
  const day = store.tournament.days[store.dayIndex];

  // Suggest directory referees not already in this roster (add-existing); a new name creates one.
  const rosterIds = new Set(store.tournament.referees.map((r) => r.id));
  const suggestions = sortByName(dir.library).filter((r) => !rosterIds.has(r.id));

  const addReferee = () => {
    const name = refName.trim();
    if (!name) return;
    const { ref } = dir.addByName(name); // create-or-reuse in the directory (auto-upsert)
    store.addReferee(ref); // add the snapshot to this tournament's roster
    setRefName("");
  };
  const addCourt = () => {
    if (courtName.trim()) {
      store.addCourt(courtName);
      setCourtName("");
    }
  };

  return (
    <div className={styles.step}>
      <StepHeader title={t("wizard.setup.title")} subtitle={t("wizard.setup.subtitle")} />

      <div className={styles.rosters}>
        <section>
          <h3 className={styles.sectionTitle}>{t("wizard.setup.referees")}</h3>
          <ul className={styles.roster}>
            {store.tournament.referees.map((r) => (
              <li key={r.id} className={styles.rosterRow}>
                <span className={styles.swatch} style={{ background: refColor(r.id) }} aria-hidden />
                <input
                  className={styles.rowInput}
                  value={r.name}
                  onChange={(e) => store.renameReferee(r.id, e.target.value)}
                />
                <Button
                  variant="danger"
                  aria-label={t("common.delete")}
                  onClick={() => store.removeReferee(r.id)}
                >
                  ×
                </Button>
              </li>
            ))}
            {store.tournament.referees.length === 0 && (
              <li className={styles.emptyHint}>{t("wizard.setup.noReferees")}</li>
            )}
          </ul>
          <div className={styles.addRow}>
            <input
              className={styles.rowInput}
              value={refName}
              list="referee-library"
              placeholder={t("wizard.setup.refereeName")}
              onChange={(e) => setRefName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addReferee()}
            />
            <datalist id="referee-library">
              {suggestions.map((r) => (
                <option key={r.id} value={r.name} />
              ))}
            </datalist>
            <Button variant="primary" disabled={!refName.trim()} onClick={addReferee}>
              {t("wizard.setup.addReferee")}
            </Button>
          </div>
        </section>

        <section>
          <h3 className={styles.sectionTitle}>{t("wizard.setup.courts")}</h3>
          <ul className={styles.roster}>
            {store.tournament.courts.map((c) => (
              <li key={c.id} className={styles.rosterRow}>
                <input
                  className={styles.rowInput}
                  value={c.name}
                  onChange={(e) => store.renameCourt(c.id, e.target.value)}
                />
                <Button
                  variant="danger"
                  aria-label={t("common.delete")}
                  onClick={() => store.removeCourt(c.id)}
                >
                  ×
                </Button>
              </li>
            ))}
            {store.tournament.courts.length === 0 && (
              <li className={styles.emptyHint}>{t("wizard.setup.noCourts")}</li>
            )}
          </ul>
          <div className={styles.addRow}>
            <input
              className={styles.rowInput}
              value={courtName}
              placeholder={t("wizard.setup.courtName")}
              onChange={(e) => setCourtName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCourt()}
            />
            <Button variant="primary" disabled={!courtName.trim()} onClick={addCourt}>
              {t("wizard.setup.addCourt")}
            </Button>
          </div>
        </section>
      </div>

      {day && store.tournament.courts.length > 0 && (
        <section className={styles.courtSelect}>
          <h3 className={styles.sectionTitle}>
            {t("wizard.setup.courtsOnDay", { day: store.dayIndex + 1 })}
          </h3>
          <div className={styles.checkRow}>
            {store.tournament.courts.map((c) => (
              <label key={c.id} className={styles.check}>
                <input
                  type="checkbox"
                  checked={day.availableCourtIds.includes(c.id)}
                  onChange={(e) => store.toggleCourtOnDay(store.dayIndex, c.id, e.target.checked)}
                />
                {c.name}
              </label>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
