// Task 9 — the blocking Generate modal (issues/07-solve-progress-ui.md, Variant B). One scrim over
// the whole app; two states:
//   • solving → indeterminate spinner + a live ticker (best score / iterations / elapsed) patched in
//     place from the worker's progress ticks, and a single Cancel button (keep best-so-far).
//   • error   → red banner naming the short-staffed round(s) + the shortfall, a "Close & fix" button,
//     no spinner. Blocking, so the organizer must acknowledge before generating.
// Presentational only — all logic lives in solveController. Idle renders nothing.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { t } from "../../i18n/t.ts";
import { Button } from "@/ui/shadcn/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/ui/shadcn/ui/dialog";
import type { PrecheckFailure, SolveState, Ticker } from "./solveController.ts";

export interface GenerateModalProps {
  state: SolveState;
  onCancel: () => void;
  onClose: () => void;
  subscribeTicker: (cb: (t: Ticker) => void) => () => void;
}

const ZERO: Ticker = { bestScore: Infinity, iters: 0, elapsedMs: 0 };

export function GenerateModal({ state, onCancel, onClose, subscribeTicker }: GenerateModalProps) {
  const solving = state.phase === "solving";

  // Blocking: no Esc / outside-click / X dismissal — the organizer must Cancel or Close & fix.
  const block = (e: Event) => e.preventDefault();

  return (
    <Dialog open={state.phase !== "idle"} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={block}
        onInteractOutside={block}
        className="items-center text-center sm:max-w-md"
      >
        {solving ? (
          <Solving onCancel={onCancel} subscribeTicker={subscribeTicker} />
        ) : (
          <ErrorState failures={state.phase === "error" ? state.failures : []} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
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
      <DialogHeader className="items-center">
        <Loader2 className="size-10 animate-spin text-primary motion-reduce:[animation-duration:2s]" aria-hidden />
        <DialogTitle>{t("wizard.generate.inProgress")}</DialogTitle>
        <DialogDescription className="sr-only">{t("wizard.generate.subtitle")}</DialogDescription>
      </DialogHeader>
      <dl className="flex gap-5">
        <Stat label={t("wizard.generate.stat.score")} value={score} />
        <Stat label={t("wizard.generate.stat.iters")} value={tick.iters.toLocaleString()} />
        <Stat label={t("wizard.generate.stat.elapsed")} value={elapsed} />
      </dl>
      <Button variant="outline" onClick={onCancel}>
        {t("wizard.generate.cancel")}
      </Button>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-16 flex-col gap-0.5">
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="text-lg font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function ErrorState({ failures, onClose }: { failures: PrecheckFailure[]; onClose: () => void }) {
  return (
    <>
      <DialogHeader className="items-center">
        <DialogTitle className="text-destructive">{t("wizard.generate.blockedTitle")}</DialogTitle>
        <DialogDescription className="sr-only">{t("wizard.generate.blockedTitle")}</DialogDescription>
      </DialogHeader>
      <div
        className="w-full rounded-md border border-destructive/30 bg-destructive/10 p-3 text-left text-sm text-destructive"
        role="alert"
      >
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
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
      <Button onClick={onClose}>{t("wizard.generate.closeFix")}</Button>
    </>
  );
}
