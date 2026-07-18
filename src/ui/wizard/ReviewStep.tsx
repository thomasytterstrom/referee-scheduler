// Review — the dense round×court grid for the selected day, wired to the store's pin/override. Day is
// chosen via the top-bar DaySwitcher. Task 11 adds the referee-view + warnings drawer around this.

import { useStore } from "../state/store.tsx";
import { t } from "../../i18n/t.ts";
import { Grid } from "../grid/Grid.tsx";
import { StepHeader } from "../components/StepHeader.tsx";
import styles from "./Wizard.module.css";

export function ReviewStep() {
  const store = useStore();
  const day = store.tournament.days[store.dayIndex];

  return (
    <div className={styles.step}>
      <StepHeader title={t("wizard.review.title")} subtitle={t("wizard.review.subtitle")} />
      {day ? (
        <Grid
          tournament={store.tournament}
          dayIndex={store.dayIndex}
          onPin={store.onPin}
          onOverride={store.onOverride}
        />
      ) : (
        <p className={styles.emptyHint}>{t("wizard.review.empty")}</p>
      )}
    </div>
  );
}
