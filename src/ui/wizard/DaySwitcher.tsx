// Persistent Day 1 / Day 2 / … selector. Days are solved independently; this only drives which day
// the Setup court-selection and Review grid operate on. Hidden when there are no days yet.

import { useStore } from "../state/store.tsx";
import { t } from "../../i18n/t.ts";

export function DaySwitcher() {
  const store = useStore();
  const days = store.tournament.days;
  if (days.length === 0) return null;
  if (days.length === 1)
    return <span className="font-semibold text-muted-foreground">{t("common.day", { day: 1 })}</span>;

  return (
    <div
      className="inline-flex shrink-0 gap-1 rounded-lg bg-muted p-0.5"
      role="tablist"
      aria-label={t("wizard.step.setup")}
    >
      {days.map((_, i) => {
        const active = store.dayIndex === i;
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={active}
            className={
              "rounded-md px-3 py-1.5 font-medium transition-colors " +
              (active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
            onClick={() => store.setDayIndex(i)}
          >
            {t("common.day", { day: i + 1 })}
          </button>
        );
      })}
    </div>
  );
}
