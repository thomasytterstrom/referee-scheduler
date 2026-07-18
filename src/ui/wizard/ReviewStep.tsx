// Review — the dense round×court grid for the selected day (wired to the store's pin/override) plus
// the docked review drawer (per-referee timeline + fairness bars + warnings). Day is chosen via the
// top-bar DaySwitcher; the drawer recomputes the day's Score breakdown live from the schedule.

import { useStore } from "../state/store.tsx";
import { t } from "../../i18n/t.ts";
import { Grid } from "../grid/Grid.tsx";
import { ReviewDrawer } from "../review/ReviewDrawer.tsx";
import { StepHeader } from "../components/StepHeader.tsx";
import styles from "./Wizard.module.css";

export function ReviewStep({
  bent = false,
  runReason = null,
}: {
  bent?: boolean;
  runReason?: "budget" | "cancelled" | null;
}) {
  const store = useStore();
  const day = store.tournament.days[store.dayIndex];

  return (
    <div className={styles.step}>
      <StepHeader title={t("wizard.review.title")} subtitle={t("wizard.review.subtitle")} />
      {bent && <div className={styles.bentBanner}>{t("wizard.generate.bentBanner")}</div>}
      {day ? (
        <>
          <Grid
            tournament={store.tournament}
            dayIndex={store.dayIndex}
            onPin={store.onPin}
            onOverride={store.onOverride}
          />
          <ReviewDrawer
            tournament={store.tournament}
            dayIndex={store.dayIndex}
            runReason={runReason}
          />
        </>
      ) : (
        <p className={styles.emptyHint}>{t("wizard.review.empty")}</p>
      )}
    </div>
  );
}
