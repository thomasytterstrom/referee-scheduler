// Generate — the prominent call-to-action. Task 5 ships an inert placeholder: the Generate/Reshuffle
// buttons call an optional onGenerate seam, disabled until Task 9 wires the solve controller + modal.

import { t } from "../../i18n/t.ts";
import { Button } from "../components/Button.tsx";
import { StepHeader } from "../components/StepHeader.tsx";
import styles from "./Wizard.module.css";

export function GenerateStep({ onGenerate }: { onGenerate?: (mode: "generate" | "reshuffle") => void }) {
  return (
    <div className={styles.step}>
      <StepHeader title={t("wizard.generate.title")} subtitle={t("wizard.generate.subtitle")} />
      <div className={styles.generateActions}>
        {/* TODO(Task 9): replace this seam with solveController + GenerateModal wiring. */}
        <Button variant="primary" disabled={!onGenerate} onClick={() => onGenerate?.("generate")}>
          {t("wizard.generate.run")}
        </Button>
        <Button disabled={!onGenerate} onClick={() => onGenerate?.("reshuffle")}>
          {t("wizard.generate.reshuffle")}
        </Button>
      </div>
      {!onGenerate && <p className={styles.note}>{t("wizard.generate.placeholder")}</p>}
    </div>
  );
}
