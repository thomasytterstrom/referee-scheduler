// Persistent Day 1 / Day 2 / … selector. Days are solved independently; this only drives which day
// the Setup court-selection and Review grid operate on. Hidden when there are no days yet.

import { useStore } from "../state/store.tsx";
import { t } from "../../i18n/t.ts";
import styles from "./Wizard.module.css";

export function DaySwitcher() {
  const store = useStore();
  const days = store.tournament.days;
  if (days.length === 0) return null;
  if (days.length === 1) return <span className={styles.dayLabel}>{t("common.day", { day: 1 })}</span>;

  return (
    <div className={styles.daySwitcher} role="tablist" aria-label={t("wizard.step.setup")}>
      {days.map((_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={store.dayIndex === i}
          className={store.dayIndex === i ? `${styles.dayTab} ${styles.dayTabActive}` : styles.dayTab}
          onClick={() => store.setDayIndex(i)}
        >
          {t("common.day", { day: i + 1 })}
        </button>
      ))}
    </div>
  );
}
