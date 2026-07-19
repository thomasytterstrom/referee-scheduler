// Export — download the tournament as a versioned JSON envelope (`<name>_<date>.json`) and/or save it
// to the IndexedDB library (autosave already persists continuously; "Save to library" is an explicit,
// immediate write). Below that, the three courtside print artifacts for the selected day: tabs switch
// which one is previewed (no print); the Print button emits whatever is shown. window.print() emits
// ONLY that artifact (exportPrint.css isolates it) so its own @page orientation applies. The preview
// is a fixed-ink white "paper" (print.css) — it stays light even in dark mode, matching the sheet.

import { useMemo, useState } from "react";
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
  // One timestamp per visit to this step; rendered verbatim into every artifact header.
  const generatedAt = useMemo(() => new Date().toLocaleString(), []);

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
            {/* Switch the previewed artifact (no print); the Print button emits whatever is shown. */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div
                role="tablist"
                aria-label={t("wizard.export.print")}
                className="inline-flex rounded-md border bg-muted/40 p-1"
              >
                {ARTIFACTS.map((a) => {
                  const active = a === artifact;
                  return (
                    <button
                      key={a}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={
                        "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors " +
                        (active
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground")
                      }
                      onClick={() => setArtifact(a)}
                    >
                      {t(`print.artifact.${a}`)}
                    </button>
                  );
                })}
              </div>
              <Button onClick={() => window.print()}>
                {t("wizard.export.printArtifact", { artifact: t(`print.artifact.${artifact}`) })}
              </Button>
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
