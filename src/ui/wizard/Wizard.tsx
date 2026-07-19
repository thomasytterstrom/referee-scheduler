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
import { Button } from "@/ui/shadcn/ui/button";
import { Input } from "@/ui/shadcn/ui/input";
import { ThemeToggle } from "../theme.tsx";

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
    <div className="flex min-h-screen items-stretch text-left">
      <aside className="flex w-52 shrink-0 flex-col gap-2 border-r bg-muted/40 p-3">
        <div className="px-2 pt-1 pb-3 text-base font-bold">{t("common.appName")}</div>
        <nav className="flex flex-col gap-1">
          {STEPS.map((s, i) => {
            const active = step === s;
            return (
              <button
                key={s}
                type="button"
                className={
                  "flex items-center gap-2 rounded-md px-2.5 py-2 text-left font-medium transition-colors " +
                  (active
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-foreground/70 hover:bg-accent hover:text-accent-foreground")
                }
                aria-current={active ? "step" : undefined}
                onClick={() => setStep(s)}
              >
                <span
                  className={
                    "grid size-5 shrink-0 place-items-center rounded-full border text-xs " +
                    (active ? "border-primary bg-primary text-primary-foreground" : "bg-card")
                  }
                >
                  {i + 1}
                </span>
                {t(`wizard.step.${s}`)}
              </button>
            );
          })}
        </nav>
        {onExit && (
          <Button variant="outline" size="sm" className="mt-auto" onClick={onExit}>
            {t("wizard.picker.switch")}
          </Button>
        )}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b px-5 py-3">
          <Input
            className="h-9 flex-1 border-transparent bg-transparent text-lg font-semibold shadow-none hover:border-input focus-visible:border-input"
            value={store.name}
            aria-label={t("wizard.nameLabel")}
            onChange={(e) => store.setName(e.target.value)}
          />
          <DaySwitcher />
          <ThemeToggle />
        </header>
        <section className="min-h-0 flex-1 overflow-auto p-5">
          {step === "setup" && <SetupStep />}
          {step === "import" && <ImportStep />}
          {step === "generate" && <GenerateStep onGenerate={solve.start} />}
          {step === "review" && (
            <ReviewStep
              bent={solve.lastRun?.bent ?? false}
              runReason={solve.lastRun?.reason === "converged" ? null : (solve.lastRun?.reason ?? null)}
            />
          )}
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
