// Read-only per-referee review. RefereeView covers ONE day: a duty timeline across the day's rounds
// plus Head/Assistant fairness bars against each ref's availability-proportional target.
// CumulativeFairness reuses those bars over every day through the selected one, to surface cross-day
// imbalance a single day hides. Pure presentational — derived from the Tournament model, never re-runs
// the schedule.

import type { Tournament } from "../../model/tournament.ts";
import { makeRefColorMap } from "../grid/refColor.ts";
import { cumulativeRows } from "./cumulative.ts";
import { t } from "../../i18n/t.ts";
import styles from "./RefereeView.module.css";

export interface RefereeViewProps {
  tournament: Tournament;
  dayIndex: number;
}

type Duty = "head" | "assistant" | "sit" | "unavailable";

const round1 = (x: number): number => Math.round(x * 10) / 10;

interface RefRow {
  id: string;
  name: string;
  color: string;
  cells: Duty[]; // one per round, in round order
  head: number;
  asst: number;
  targetHead: number;
  targetAsst: number;
}

export function RefereeView({ tournament, dayIndex }: RefereeViewProps) {
  const day = tournament.days[dayIndex];
  const rounds = [...day.rounds].sort((a, b) => a.index - b.index);
  const roundSet = new Set(rounds.map((r) => r.index));
  const colorMap = makeRefColorMap(tournament.referees.map((r) => r.id));

  // match id -> round index (every match this day).
  const matchRound = new Map<string, number>();
  for (const rnd of day.rounds) for (const m of rnd.matches) matchRound.set(m.id, rnd.index);

  // (refId:round) -> duty, scanned from the day's assignments (>=1 duty per ref per round is hard).
  const duty = new Map<string, "head" | "assistant">();
  for (const asg of day.assignments) {
    const r = matchRound.get(asg.matchId);
    if (r === undefined) continue;
    if (asg.head.refId) duty.set(`${asg.head.refId}:${r}`, "head");
    if (asg.assistant?.refId) duty.set(`${asg.assistant.refId}:${r}`, "assistant");
  }

  // Duty demand this day (available courts only) drives the proportional targets.
  const courts = new Set(day.availableCourtIds);
  let totalHead = 0;
  let totalAsst = 0;
  for (const rnd of day.rounds)
    for (const m of rnd.matches)
      if (courts.has(m.courtId)) {
        totalHead++;
        if (m.requiresAssistant) totalAsst++;
      }

  // Rounds a ref is available this day: null = all, array = listed (clamped to real rounds).
  const availRounds = (id: string): Set<number> | null => {
    const spec = day.availability[id];
    if (spec === null) return null;
    return new Set((spec ?? []).filter((rd) => roundSet.has(rd)));
  };
  const availCount = (id: string): number => {
    const a = availRounds(id);
    return a === null ? rounds.length : a.size;
  };

  // Participating refs = those with an availability entry for the day (present !== undefined).
  const shown = tournament.referees.filter((r) => day.availability[r.id] !== undefined);
  const sumAvail = shown.reduce((s, r) => s + availCount(r.id), 0);

  const rows: RefRow[] = shown.map((ref) => {
    const a = availRounds(ref.id);
    const isAvail = (idx: number): boolean => (a === null ? true : a.has(idx));
    let head = 0;
    let asst = 0;
    const cells: Duty[] = rounds.map((rnd) => {
      const d = duty.get(`${ref.id}:${rnd.index}`);
      if (d === "head") head++;
      if (d === "assistant") asst++;
      return d ?? (isAvail(rnd.index) ? "sit" : "unavailable");
    });
    const share = sumAvail > 0 ? availCount(ref.id) / sumAvail : 0;
    return {
      id: ref.id,
      name: ref.name,
      color: colorMap.get(ref.id) ?? `hsl(0, 0%, 50%)`,
      cells,
      head,
      asst,
      targetHead: totalHead * share,
      targetAsst: totalAsst * share,
    };
  });

  const maxHead = Math.max(1, ...rows.map((r) => Math.max(r.head, r.targetHead)));
  const maxAsst = Math.max(1, ...rows.map((r) => Math.max(r.asst, r.targetAsst)));

  const glyph: Record<Duty, string> = {
    head: t("refereeView.abbr.head"),
    assistant: t("refereeView.abbr.assistant"),
    sit: t("refereeView.abbr.sit"),
    unavailable: "",
  };
  const stateLabel: Record<Duty, string> = {
    head: t("common.role.head"),
    assistant: t("common.role.assistant"),
    sit: t("refereeView.resting"),
    unavailable: t("refereeView.unavailable"),
  };

  return (
    <div className={styles.root}>
      <div className={`${styles.row} ${styles.headerRow}`}>
        <div className={styles.name}>{t("refereeView.heading")}</div>
        <div className={styles.timeline}>
          {rounds.map((rnd) => (
            <div key={rnd.index} className={styles.roundHead} title={rnd.startTime}>
              {t("refereeView.round", { round: rnd.index + 1 })}
            </div>
          ))}
        </div>
        <div className={styles.fairness}>
          <span className={styles.barLabel}>{t("common.role.head")}</span>
          <span className={styles.barLabel}>{t("common.role.assistant")}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>{t("refereeView.empty")}</div>
      ) : (
        rows.map((r) => (
          <div key={r.id} className={styles.row}>
            <div className={styles.name}>
              <span className={styles.dot} style={{ background: r.color }} />
              {r.name}
            </div>
            <div className={styles.timeline}>
              {r.cells.map((d, i) => (
                <div
                  key={i}
                  className={`${styles.cell} ${styles[d]}`}
                  style={d === "head" || d === "assistant" ? { background: r.color } : undefined}
                  title={`${stateLabel[d]} — ${t("refereeView.round", { round: i + 1 })}`}
                >
                  {glyph[d]}
                </div>
              ))}
            </div>
            <div className={styles.fairness}>
              <Bar count={r.head} target={r.targetHead} max={maxHead} color={r.color} role={t("common.role.head")} />
              <Bar count={r.asst} target={r.targetAsst} max={maxAsst} color={r.color} role={t("common.role.assistant")} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

interface BarProps {
  count: number;
  target: number;
  max: number;
  color: string;
  role: string;
}

function Bar({ count, target, max, color, role }: BarProps) {
  const load = t("refereeView.load", { count, target: round1(target) });
  return (
    <div className={styles.bar} title={`${role}: ${load}`}>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${(count / max) * 100}%`, background: color }} />
        <div className={styles.tick} style={{ left: `${(target / max) * 100}%` }} />
      </div>
      <span className={styles.load}>{load}</span>
    </div>
  );
}

// Read-only cumulative fairness across the tournament so far — the day view's Head/Assistant bars,
// but counted over every day through the selected one. Catches cross-day imbalance a single day hides.
export function CumulativeFairness({ tournament, dayIndex }: RefereeViewProps) {
  const rows = cumulativeRows(tournament, dayIndex);
  const maxHead = Math.max(1, ...rows.map((r) => Math.max(r.head, r.targetHead)));
  const maxAsst = Math.max(1, ...rows.map((r) => Math.max(r.asst, r.targetAsst)));
  const colorMap = makeRefColorMap(tournament.referees.map((r) => r.id));

  return (
    <div className={styles.root}>
      <div className={`${styles.row} ${styles.headerRow}`}>
        <div className={styles.name}>{t("refereeView.cumulativeHeading", { day: dayIndex + 1 })}</div>
        <div className={styles.fairness}>
          <span className={styles.barLabel}>{t("common.role.head")}</span>
          <span className={styles.barLabel}>{t("common.role.assistant")}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>{t("refereeView.empty")}</div>
      ) : (
        rows.map((r) => {
          const color = colorMap.get(r.id) ?? `hsl(0, 0%, 50%)`;
          return (
            <div key={r.id} className={styles.row}>
              <div className={styles.name}>
                <span className={styles.dot} style={{ background: color }} />
                {r.name}
              </div>
              <div className={styles.fairness}>
                <Bar count={r.head} target={r.targetHead} max={maxHead} color={color} role={t("common.role.head")} />
                <Bar count={r.asst} target={r.targetAsst} max={maxAsst} color={color} role={t("common.role.assistant")} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
