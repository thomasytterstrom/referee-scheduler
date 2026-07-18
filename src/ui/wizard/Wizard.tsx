// Guided-wizard shell (ui-spec): left vertical stepper Setup -> Import -> Generate -> Review ->
// Export, a persistent day switcher + editable tournament name in the top bar, and one work area per
// step. Steps are freely navigable (not a locked funnel).

import { useState } from "react";
import { useStore } from "../state/store.tsx";
import { t } from "../../i18n/t.ts";
import { DaySwitcher } from "./DaySwitcher.tsx";
import { SetupStep } from "./SetupStep.tsx";
import { ImportStep } from "./ImportStep.tsx";
import { GenerateStep } from "./GenerateStep.tsx";
import { ReviewStep } from "./ReviewStep.tsx";
import { ExportStep } from "./ExportStep.tsx";
import { useSolveController } from "../solve/solveController.ts";
import { GenerateModal } from "../solve/GenerateModal.tsx";
import styles from "./Wizard.module.css";

const STEPS = ["setup", "import", "generate", "review", "export"] as const;
type Step = (typeof STEPS)[number];

export interface WizardProps {
  /** Return to the tournament picker. */
  onExit?: () => void;
}

export function Wizard({ onExit }: WizardProps) {
  const store = useStore();
  const [step, setStep] = useState<Step>("setup");
  const solve = useSolveController();

  return (
    <div className={styles.app}>
      <aside className={styles.stepper}>
        <div className={styles.brand}>{t("common.appName")}</div>
        <nav className={styles.nav}>
          {STEPS.map((s, i) => (
            <button
              key={s}
              type="button"
              className={step === s ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
              aria-current={step === s ? "step" : undefined}
              onClick={() => setStep(s)}
            >
              <span className={styles.num}>{i + 1}</span>
              {t(`wizard.step.${s}`)}
            </button>
          ))}
        </nav>
        {onExit && (
          <button type="button" className={styles.exit} onClick={onExit}>
            {t("wizard.picker.switch")}
          </button>
        )}
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <input
            className={styles.nameInput}
            value={store.name}
            aria-label={t("wizard.nameLabel")}
            onChange={(e) => store.setName(e.target.value)}
          />
          <DaySwitcher />
        </header>
        <section className={styles.content}>
          {step === "setup" && <SetupStep />}
          {step === "import" && <ImportStep />}
          {step === "generate" && <GenerateStep onGenerate={solve.start} />}
          {step === "review" && <ReviewStep bent={solve.lastRun?.bent ?? false} />}
          {step === "export" && <ExportStep />}
        </section>
      </main>

      <GenerateModal
        state={solve.state}
        onCancel={solve.cancel}
        onClose={solve.dismiss}
        subscribeTicker={solve.subscribeTicker}
      />
    </div>
  );
}
