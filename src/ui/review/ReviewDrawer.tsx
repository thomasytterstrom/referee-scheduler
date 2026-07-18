// Review drawer (ui-spec §Review drawer) — the docked readout beside/under the editing grid: the
// per-referee duty timeline + fairness bars (RefereeView) and the schedule-health warnings
// (WarningsPanel) for the selected day. The day's Score breakdown is recomputed here on the main
// thread from the current schedule — the same objective the generator minimizes — so it stays live as
// slots are pinned/overridden, and it decides which warnings surface.

import type { Tournament } from "../../model/tournament.ts";
import { toProblem } from "../../model/adapter.ts";
import { carryoverFor } from "../../model/carryover.ts";
import { scoreDay } from "../../domain/score.ts";
import { RefereeView } from "../referee-view/RefereeView.tsx";
import { WarningsPanel } from "../warnings/WarningsPanel.tsx";
import styles from "./ReviewDrawer.module.css";

export interface ReviewDrawerProps {
  tournament: Tournament;
  dayIndex: number;
  // The last Generate's termination reason — pinned as a run entry in the warnings panel.
  runReason?: "budget" | "cancelled" | null;
}

export function ReviewDrawer({ tournament, dayIndex, runReason }: ReviewDrawerProps) {
  const { problem, sol } = toProblem(tournament, dayIndex);
  const breakdown = scoreDay(problem, sol, carryoverFor(tournament, dayIndex));

  return (
    <section className={styles.drawer}>
      <div className={styles.timeline}>
        <RefereeView tournament={tournament} dayIndex={dayIndex} />
      </div>
      <div className={styles.warnings}>
        <WarningsPanel
          tournament={tournament}
          dayIndex={dayIndex}
          breakdown={breakdown}
          runReason={runReason}
        />
      </div>
    </section>
  );
}
