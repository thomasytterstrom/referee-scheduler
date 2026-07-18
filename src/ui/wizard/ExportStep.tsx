// Export — download the tournament as a versioned JSON envelope (`<name>_<date>.json`) and/or save it
// to the IndexedDB library (autosave already persists continuously; "Save to library" is an explicit,
// immediate write). Below that, the three courtside print artifacts for the selected day: pick one and
// window.print() emits ONLY that artifact (exportPrint.css isolates it) so its own @page orientation
// applies.

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store.tsx";
import { serialize } from "../../persistence/serialize.ts";
import { saveTournament, setLastOpenedId } from "../../persistence/db.ts";
import { t } from "../../i18n/t.ts";
import { Button } from "../components/Button.tsx";
import { StepHeader } from "../components/StepHeader.tsx";
import { WallGrid, DutySlips, CallSheets } from "../print/index.ts";
import styles from "./Wizard.module.css";
import "./exportPrint.css";

type Artifact = "wallGrid" | "dutySlips" | "callSheets";
const ARTIFACTS: readonly Artifact[] = ["wallGrid", "dutySlips", "callSheets"];

export function ExportStep() {
  const store = useStore();
  const [saved, setSaved] = useState(false);
  const [artifact, setArtifact] = useState<Artifact>("wallGrid");
  const printPending = useRef(false);
  // One timestamp per visit to this step; rendered verbatim into every artifact header.
  const generatedAt = useMemo(() => new Date().toLocaleString(), []);

  // Print only the chosen artifact: switch the preview, then print once the DOM reflects the change.
  useEffect(() => {
    if (!printPending.current) return;
    printPending.current = false;
    window.print();
  }, [artifact]);

  const printArtifact = (a: Artifact) => {
    if (a === artifact) window.print();
    else {
      printPending.current = true;
      setArtifact(a);
    }
  };

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

  const day = store.tournament.days[store.dayIndex];
  const printProps = {
    tournament: store.tournament,
    dayIndex: store.dayIndex,
    generatedAt,
    tournamentName: store.name,
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

      <div className={styles.printSection}>
        <h3 className={styles.sectionTitle}>{t("wizard.export.print")}</h3>
        <p className={styles.printSubtitle}>{t("wizard.export.printSubtitle")}</p>
        {day ? (
          <>
            <div className={styles.printButtons}>
              {ARTIFACTS.map((a) => (
                <Button key={a} onClick={() => printArtifact(a)}>
                  {t("wizard.export.printArtifact", { artifact: t(`print.artifact.${a}`) })}
                </Button>
              ))}
            </div>
            <div className="print-area">
              {artifact === "wallGrid" && <WallGrid {...printProps} />}
              {artifact === "dutySlips" && <DutySlips {...printProps} />}
              {artifact === "callSheets" && <CallSheets {...printProps} />}
            </div>
          </>
        ) : (
          <p className={styles.emptyHint}>{t("wizard.export.noDay")}</p>
        )}
      </div>
    </div>
  );
}
