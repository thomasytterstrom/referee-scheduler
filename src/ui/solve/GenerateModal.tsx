// Task 9 — the blocking Generate modal (issues/07-solve-progress-ui.md, Variant B). One scrim over
// the whole app; two states:
//   • solving → indeterminate spinner + a live ticker (best score / iterations / elapsed) patched in
//     place from the worker's progress ticks, and a single Cancel button (keep best-so-far).
//   • error   → red banner naming the short-staffed round(s) + the shortfall, a "Close & fix" button,
//     no spinner. Blocking, so the organizer must acknowledge before generating.
// Presentational only — all logic lives in solveController. Idle renders nothing.

import { useEffect, useState } from "react";
import { t } from "../../i18n/t.ts";
import { Button } from "../components/Button.tsx";
import type { PrecheckFailure, SolveState, Ticker } from "./solveController.ts";
import styles from "./GenerateModal.module.css";

export interface GenerateModalProps {
  state: SolveState;
  onCancel: () => void;
  onClose: () => void;
  subscribeTicker: (cb: (t: Ticker) => void) => () => void;
}

const ZERO: Ticker = { bestScore: Infinity, iters: 0, elapsedMs: 0 };

export function GenerateModal({ state, onCancel, onClose, subscribeTicker }: GenerateModalProps) {
  if (state.phase === "idle") return null;

  return (
    <div className={styles.scrim} role="dialog" aria-modal="true" aria-label={t("wizard.generate.title")}>
      <div className={styles.card}>
        {state.phase === "solving" ? (
          <Solving onCancel={onCancel} subscribeTicker={subscribeTicker} />
        ) : (
          <ErrorState failures={state.failures} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function Solving({
  onCancel,
  subscribeTicker,
}: Pick<GenerateModalProps, "onCancel" | "subscribeTicker">) {
  // Local state so progress ticks (~120 ms cadence) re-render only the ticker, never the wizard.
  const [tick, setTick] = useState<Ticker>(ZERO);
  useEffect(() => {
    setTick(ZERO);
    return subscribeTicker(setTick);
  }, [subscribeTicker]);

  const score = Number.isFinite(tick.bestScore) ? Math.round(tick.bestScore).toLocaleString() : "—";
  const elapsed = `${(tick.elapsedMs / 1000).toFixed(1)}s`;

  return (
    <>
      <div className={styles.spinner} aria-hidden="true" />
      <h2 className={styles.title}>{t("wizard.generate.inProgress")}</h2>
      <dl className={styles.ticker}>
        <div className={styles.stat}>
          <dt>{t("wizard.generate.stat.score")}</dt>
          <dd>{score}</dd>
        </div>
        <div className={styles.stat}>
          <dt>{t("wizard.generate.stat.iters")}</dt>
          <dd>{tick.iters.toLocaleString()}</dd>
        </div>
        <div className={styles.stat}>
          <dt>{t("wizard.generate.stat.elapsed")}</dt>
          <dd>{elapsed}</dd>
        </div>
      </dl>
      <Button variant="default" onClick={onCancel}>
        {t("wizard.generate.cancel")}
      </Button>
    </>
  );
}

function ErrorState({ failures, onClose }: { failures: PrecheckFailure[]; onClose: () => void }) {
  return (
    <>
      <h2 className={`${styles.title} ${styles.errorTitle}`}>{t("wizard.generate.blockedTitle")}</h2>
      <div className={styles.errorBanner} role="alert">
        <ul className={styles.failList}>
          {failures.map((f, i) => (
            <li key={i}>
              {t("warnings.blocker.tooManyDuties", {
                time: f.time ?? t("common.round", { round: f.round }),
                demand: f.demand,
                available: f.available,
              })}
            </li>
          ))}
        </ul>
      </div>
      <Button variant="primary" onClick={onClose}>
        {t("wizard.generate.closeFix")}
      </Button>
    </>
  );
}
