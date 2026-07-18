// Export — download the tournament as a versioned JSON envelope (`<name>_<date>.json`) and/or save it
// to the IndexedDB library. Autosave already persists continuously; "Save to library" is an explicit,
// immediate write for reassurance.

import { useState } from "react";
import { useStore } from "../state/store.tsx";
import { serialize } from "../../persistence/serialize.ts";
import { saveTournament, setLastOpenedId } from "../../persistence/db.ts";
import { t } from "../../i18n/t.ts";
import { Button } from "../components/Button.tsx";
import { StepHeader } from "../components/StepHeader.tsx";
import styles from "./Wizard.module.css";

export function ExportStep() {
  const store = useStore();
  const [saved, setSaved] = useState(false);

  const download = () => {
    const json = JSON.stringify(serialize(store.tournament), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const date = new Date().toISOString().slice(0, 10);
    const safeName = (store.name.trim() || "tournament").replace(/[^\w.-]+/g, "_");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}_${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const save = async () => {
    await saveTournament({ id: store.id, name: store.name, tournament: store.tournament });
    await setLastOpenedId(store.id);
    setSaved(true);
  };

  return (
    <div className={styles.step}>
      <StepHeader title={t("wizard.export.title")} subtitle={t("wizard.export.subtitle")} />
      <div className={styles.generateActions}>
        <Button variant="primary" onClick={download}>
          {t("wizard.export.downloadJson")}
        </Button>
        <Button onClick={save}>{t("wizard.export.saveLibrary")}</Button>
      </div>
      {saved && <p className={styles.note}>{t("wizard.export.saved")}</p>}
    </div>
  );
}
