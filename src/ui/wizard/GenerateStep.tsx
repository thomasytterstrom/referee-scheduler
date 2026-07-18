// Generate — the prominent call-to-action. Task 5 ships an inert placeholder: the Generate/Reshuffle
// buttons call an optional onGenerate seam, disabled until Task 9 wires the solve controller + modal.

import { t } from "../../i18n/t.ts";
import { Button } from "@/ui/shadcn/ui/button";
import { StepHeader } from "../components/StepHeader.tsx";

export function GenerateStep({ onGenerate }: { onGenerate?: (mode: "generate" | "reshuffle") => void }) {
  return (
    <div className="max-w-[760px]">
      <StepHeader title={t("wizard.generate.title")} subtitle={t("wizard.generate.subtitle")} />
      <div className="mb-3 flex gap-2.5">
        {/* TODO(Task 9): replace this seam with solveController + GenerateModal wiring. */}
        <Button disabled={!onGenerate} onClick={() => onGenerate?.("generate")}>
          {t("wizard.generate.run")}
        </Button>
        <Button variant="outline" disabled={!onGenerate} onClick={() => onGenerate?.("reshuffle")}>
          {t("wizard.generate.reshuffle")}
        </Button>
      </div>
      {!onGenerate && <p className="text-muted-foreground italic">{t("wizard.generate.placeholder")}</p>}
    </div>
  );
}
