// Warnings panel — one of the three Review-drawer readouts. Reports the current day's schedule health
// across three severity tiers: Blocker 🔴 (precheck hard-fail, no schedule), Forced/Bent 🟠 amber
// (rest rule + Head/Assistant balance; plus a pinned run entry when the last Generate hit the budget
// or was cancelled), and 🟡 yellow (gender/pair/sits/H→A collapsed into one expandable line). Pure
// presentational: the Score breakdown decides which constraints surface, per-instance detail is
// recomputed on the main thread from the day's schedule (see recompute.ts). Every user-facing string
// comes from the i18n catalogue and is anchored to the Generate verb (per warnings-spec vocabulary).

import type { Tournament } from "../../model/tournament.ts";
import type { Score } from "../../domain/score.ts";
import { t } from "../../i18n/t.ts";
import { computeDetail, type RestInstance, type BalanceInstance } from "./recompute.ts";
import styles from "./WarningsPanel.module.css";

export interface PrecheckFailure {
  time?: string; // round start time; falls back to the round number below
  round?: number; // 1-based round number for the "round N" fallback label
  demand: number;
  available: number;
}

export interface WarningsPanelProps {
  tournament: Tournament;
  dayIndex: number;
  breakdown: Score;
  runReason?: "budget" | "cancelled" | null;
  // Round-demand hard fail from the precheck: a ready message string, or the data to format one.
  precheckFailure?: PrecheckFailure | string | null;
}

export function WarningsPanel({
  tournament,
  dayIndex,
  breakdown,
  runReason,
  precheckFailure,
}: WarningsPanelProps) {
  // Blocker owns the whole panel: with no schedule there is nothing else to report.
  if (precheckFailure) {
    const msg =
      typeof precheckFailure === "string"
        ? precheckFailure
        : t("warnings.blocker.tooManyDuties", {
            time: precheckFailure.time ?? t("common.round", { round: precheckFailure.round ?? 1 }),
            demand: precheckFailure.demand,
            available: precheckFailure.available,
          });
    return (
      <section className={`${styles.panel} ${styles.blocked}`}>
        <h3 className={styles.header}>{t("warnings.header.blocker")}</h3>
        <div className={`${styles.entry} ${styles.red}`}>
          <span className={styles.dot} aria-hidden="true">
            🔴
          </span>
          <span>{msg}</span>
        </div>
      </section>
    );
  }

  const detail = computeDetail(tournament, dayIndex);

  // A constraint surfaces only when its penalty is nonzero AND this day yields matching instances.
  const showRest = breakdown.rest > 0 && detail.rest.length > 0;
  const showHead = breakdown.hbal > 0 && detail.head.length > 0;
  const showAsst = breakdown.abal > 0 && detail.asst.length > 0;
  const showGender = breakdown.gender > 0 && detail.gender.length > 0;
  const showPair = breakdown.pair > 0 && detail.pair.length > 0;
  const showSits = breakdown.sit > 0 && detail.sits.length > 0;
  const showHa = breakdown.ha > 0 && detail.ha.length > 0;

  const minor: string[] = [];
  if (showGender)
    for (const g of detail.gender)
      minor.push(t("warnings.minor.gender", { ref: g.ref, role: t(`common.role.${g.role}`) }));
  if (showPair)
    for (const p of detail.pair)
      minor.push(t("warnings.minor.pair", { refA: p.refA, refB: p.refB, count: p.count, cap: p.cap }));
  if (showSits)
    for (const s of detail.sits)
      minor.push(t("warnings.minor.sits", { ref: s.ref, k: s.k, t1: s.t1, t2: s.t2 }));
  if (showHa)
    for (const h of detail.ha)
      minor.push(t("warnings.minor.backToBack", { ref: h.ref, t1: h.t1, t2: h.t2 }));

  const amberPresent = !!runReason || showRest || showHead || showAsst;
  const yellowPresent = minor.length > 0;

  // Green empty state — nothing bent.
  if (!amberPresent && !yellowPresent) {
    return (
      <section className={`${styles.panel} ${styles.clean}`}>
        <h3 className={styles.header}>
          <span className={styles.dot} aria-hidden="true">
            🟢
          </span>
          {t("warnings.header.clean")}
        </h3>
        <p className={styles.sub}>{t("warnings.header.cleanSub")}</p>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <h3 className={styles.header}>
        {amberPresent ? t("warnings.header.amber") : t("warnings.header.yellowOnly")}
      </h3>

      {/* Run entry — pinned top, clears on the next complete Generate. */}
      {runReason && (
        <div className={`${styles.entry} ${styles.amber}`}>
          <span className={styles.dot} aria-hidden="true">
            🟠
          </span>
          <span>{t(`warnings.run.${runReason}`)}</span>
        </div>
      )}

      {showRest && <RestEntry items={detail.rest} />}
      {showHead && <BalanceEntry kind="head" items={detail.head} />}
      {showAsst && <BalanceEntry kind="asst" items={detail.asst} />}

      {yellowPresent && (
        <details className={`${styles.entry} ${styles.yellow}`}>
          <summary className={styles.summary}>
            <span className={styles.dot} aria-hidden="true">
              🟡
            </span>
            {t("warnings.minor.collapsed", { n: minor.length })}
          </summary>
          <ul className={styles.instances}>
            {minor.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function RestEntry({ items }: { items: RestInstance[] }) {
  // Distinct forced windows get a specific short-staffed hint; any bent window gets the generic one.
  const forced = new Map<string, { t1: string; t2: string }>();
  for (const i of items) if (i.forced) forced.set(i.t1 + " → " + i.t2, { t1: i.t1, t2: i.t2 });
  const forcedHints = [...forced.values()];
  const anyBent = items.some((i) => !i.forced);
  return (
    <details className={`${styles.entry} ${styles.amber}`}>
      <summary className={styles.summary}>
        <span className={styles.dot} aria-hidden="true">
          🟠
        </span>
        {t("warnings.rest.headline", { n: items.length })}
      </summary>
      <ul className={styles.instances}>
        {items.map((i, idx) => (
          <li key={idx}>{t("warnings.rest.instance", { ref: i.ref, s: i.s, t1: i.t1, t2: i.t2 })}</li>
        ))}
      </ul>
      {forcedHints.map((w, idx) => (
        <p key={idx} className={styles.hint}>
          {t("warnings.hint.forcedRest", { t1: w.t1, t2: w.t2 })}
        </p>
      ))}
      {(anyBent || forcedHints.length === 0) && <p className={styles.hint}>{t("warnings.hint.generic")}</p>}
    </details>
  );
}

function BalanceEntry({ kind, items }: { kind: "head" | "asst"; items: BalanceInstance[] }) {
  const ns = kind === "head" ? "headBalance" : "asstBalance";
  return (
    <details className={`${styles.entry} ${styles.amber}`}>
      <summary className={styles.summary}>
        <span className={styles.dot} aria-hidden="true">
          🟠
        </span>
        {t(`warnings.${ns}.headline`, { n: items.length })}
      </summary>
      <ul className={styles.instances}>
        {items.map((i, idx) => (
          <li key={idx}>{t(`warnings.${ns}.${i.over ? "over" : "under"}`, { ref: i.ref, k: i.k })}</li>
        ))}
      </ul>
      <p className={styles.hint}>{t("warnings.hint.generic")}</p>
    </details>
  );
}
