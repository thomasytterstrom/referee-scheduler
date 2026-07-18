// Setup — manual roster entry (referees are NOT imported) + which courts run on the selected day.

import { useState } from "react";
import { useStore } from "../state/store.tsx";
import { useDirectory } from "../state/directory.tsx";
import { sortByName } from "../../model/directory.ts";
import { t } from "../../i18n/t.ts";
import { refColor } from "../grid/refColor.ts";
import { Button } from "@/ui/shadcn/ui/button";
import { Input } from "@/ui/shadcn/ui/input";
import { Checkbox } from "@/ui/shadcn/ui/checkbox";
import { StepHeader } from "../components/StepHeader.tsx";

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
    <div className="max-w-[760px]">
      <StepHeader title={t("wizard.setup.title")} subtitle={t("wizard.setup.subtitle")} />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <section>
          <h3 className="mb-2 text-sm text-muted-foreground">{t("wizard.setup.referees")}</h3>
          <ul className="mb-2 flex list-none flex-col gap-1.5">
            {store.tournament.referees.map((r) => (
              <li key={r.id} className="flex items-center gap-1.5">
                <span className="size-3 flex-none rounded-[3px]" style={{ background: refColor(r.id) }} aria-hidden />
                <Input
                  className="flex-1"
                  value={r.name}
                  onChange={(e) => store.renameReferee(r.id, e.target.value)}
                />
                <Button
                  variant="destructive"
                  size="icon"
                  aria-label={t("common.delete")}
                  onClick={() => store.removeReferee(r.id)}
                >
                  ×
                </Button>
              </li>
            ))}
            {store.tournament.referees.length === 0 && (
              <li className="list-none text-muted-foreground italic">{t("wizard.setup.noReferees")}</li>
            )}
          </ul>
          <div className="flex gap-1.5">
            <Input
              className="flex-1"
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
            <Button disabled={!refName.trim()} onClick={addReferee}>
              {t("wizard.setup.addReferee")}
            </Button>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm text-muted-foreground">{t("wizard.setup.courts")}</h3>
          <ul className="mb-2 flex list-none flex-col gap-1.5">
            {store.tournament.courts.map((c) => (
              <li key={c.id} className="flex items-center gap-1.5">
                <Input
                  className="flex-1"
                  value={c.name}
                  onChange={(e) => store.renameCourt(c.id, e.target.value)}
                />
                <Button
                  variant="destructive"
                  size="icon"
                  aria-label={t("common.delete")}
                  onClick={() => store.removeCourt(c.id)}
                >
                  ×
                </Button>
              </li>
            ))}
            {store.tournament.courts.length === 0 && (
              <li className="list-none text-muted-foreground italic">{t("wizard.setup.noCourts")}</li>
            )}
          </ul>
          <div className="flex gap-1.5">
            <Input
              className="flex-1"
              value={courtName}
              placeholder={t("wizard.setup.courtName")}
              onChange={(e) => setCourtName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCourt()}
            />
            <Button disabled={!courtName.trim()} onClick={addCourt}>
              {t("wizard.setup.addCourt")}
            </Button>
          </div>
        </section>
      </div>

      {day && store.tournament.courts.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-2 text-sm text-muted-foreground">
            {t("wizard.setup.courtsOnDay", { day: store.dayIndex + 1 })}
          </h3>
          <div className="flex flex-wrap gap-3">
            {store.tournament.courts.map((c) => (
              <label key={c.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
                <Checkbox
                  checked={day.availableCourtIds.includes(c.id)}
                  onCheckedChange={(v) => store.toggleCourtOnDay(store.dayIndex, c.id, v === true)}
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
