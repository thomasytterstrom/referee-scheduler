// Review drawer (ui-spec §Review drawer) — the docked readout beside/under the editing grid: the
// per-referee duty timeline + fairness bars (RefereeView) and the schedule-health warnings
// (WarningsPanel) for the selected day. The day's Score breakdown is recomputed here on the main
// thread from the current schedule — the same objective the generator minimizes — so it stays live as
// slots are pinned/overridden, and it decides which warnings surface.

import type { Tournament } from "../../model/tournament.ts";
import { toProblem } from "../../model/adapter.ts";
import { carryoverFor } from "../../model/carryover.ts";
import { scoreDay } from "../../domain/score.ts";
import { RefereeView, CumulativeFairness } from "../referee-view/RefereeView.tsx";
import { WarningsPanel } from "../warnings/WarningsPanel.tsx";

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
    <section className="mt-5 flex flex-col gap-5 border-t pt-4">
      <div className="min-w-0">
        <RefereeView tournament={tournament} dayIndex={dayIndex} />
        <CumulativeFairness tournament={tournament} dayIndex={dayIndex} />
      </div>
      <div>
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
