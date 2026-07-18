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
import { Button } from "@/ui/shadcn/ui/button";
import { StepHeader } from "../components/StepHeader.tsx";
import { WallGrid, DutySlips, CallSheets } from "../print/index.ts";
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
    <div className="max-w-[760px]">
      <StepHeader title={t("wizard.export.title")} subtitle={t("wizard.export.subtitle")} />
      <div className="mb-3 flex gap-2.5">
        <Button onClick={download}>
          {t("wizard.export.downloadJson")}
        </Button>
        <Button variant="outline" onClick={save}>{t("wizard.export.saveLibrary")}</Button>
      </div>
      {saved && <p className="text-muted-foreground italic">{t("wizard.export.saved")}</p>}

      <div className="mt-6 border-t pt-5">
        <h3 className="mb-2 text-sm text-muted-foreground">{t("wizard.export.print")}</h3>
        <p className="mb-3 text-muted-foreground">{t("wizard.export.printSubtitle")}</p>
        {day ? (
          <>
            <div className="mb-4 flex flex-wrap gap-2.5">
              {ARTIFACTS.map((a) => (
                <Button key={a} variant="outline" onClick={() => printArtifact(a)}>
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
          <p className="text-muted-foreground italic">{t("wizard.export.noDay")}</p>
        )}
      </div>
    </div>
  );
}
