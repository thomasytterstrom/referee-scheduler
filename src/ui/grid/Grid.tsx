// Task 6 — dense round x court editing grid for ONE day. Pure presentational: driven entirely by
// props + callbacks, the parent owns all state. Rows = rounds, cols = the day's selected courts.
// Each cell renders its match (gender, teams, matchNo) and Head + optional Assistant slots; every
// mutation (pin / override) flows out through the callbacks.

import type {
  Assignment,
  Court,
  Match,
  Referee,
  Slot,
  Tournament,
} from "../../model/tournament.ts";
import { t } from "../../i18n/t.ts";
import { refColor } from "./refColor.ts";
import styles from "./Grid.module.css";

export type SlotKind = "head" | "assistant";

export interface GridProps {
  tournament: Tournament;
  dayIndex: number;
  onPin: (matchId: string, slot: SlotKind, pinned: boolean) => void;
  onOverride: (matchId: string, slot: SlotKind, refId: string | null) => void;
  /** Read-only mode (e.g. while generating): controls are inert. */
  disabled?: boolean;
}

// Shared placeholder for an unsolved slot — read-only in render; mutation goes through callbacks.
const EMPTY_SLOT: Slot = { refId: null, pinned: false };

export function Grid({
  tournament,
  dayIndex,
  onPin,
  onOverride,
  disabled = false,
}: GridProps) {
  const day = tournament.days[dayIndex];
  if (!day) return null;

  const refName = new Map<string, string>(
    tournament.referees.map((r) => [r.id, r.name] as const),
  );
  // The day's available referees (absent from availability = not available this day).
  const availableRefs = tournament.referees.filter((r) => r.id in day.availability);
  const courts = day.availableCourtIds
    .map((id) => tournament.courts.find((c) => c.id === id))
    .filter((c): c is Court => c !== undefined);
  const rounds = [...day.rounds].sort((a, b) => a.index - b.index);

  return (
    <div className={styles.wrap} data-disabled={disabled}>
      <table className={styles.grid}>
        <thead>
          <tr>
            <th className={styles.corner} scope="col">
              {t("grid.header.round")}
            </th>
            {courts.map((c) => (
              <th key={c.id} className={styles.courtHead} scope="col">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rounds.map((round) => (
            <tr key={round.index}>
              <th className={styles.roundHead} scope="row">
                {round.startTime ?? t("grid.roundShort", { round: round.index + 1 })}
              </th>
              {courts.map((court) => {
                const match = round.matches.find((m) => m.courtId === court.id);
                return (
                  <td
                    key={court.id}
                    className={match ? styles.cell : `${styles.cell} ${styles.idleCell}`}
                  >
                    {match ? (
                      <MatchCell
                        match={match}
                        assignment={day.assignments.find((a) => a.matchId === match.id)}
                        refName={refName}
                        availableRefs={availableRefs}
                        disabled={disabled}
                        onPin={onPin}
                        onOverride={onOverride}
                      />
                    ) : (
                      <span className={styles.idle} title={t("grid.empty")}>
                        ·
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface MatchCellProps {
  match: Match;
  assignment: Assignment | undefined;
  refName: Map<string, string>;
  availableRefs: Referee[];
  disabled: boolean;
  onPin: GridProps["onPin"];
  onOverride: GridProps["onOverride"];
}

function MatchCell({
  match,
  assignment,
  refName,
  availableRefs,
  disabled,
  onPin,
  onOverride,
}: MatchCellProps) {
  const head = assignment?.head ?? EMPTY_SLOT;
  const assistant = match.requiresAssistant ? assignment?.assistant ?? EMPTY_SLOT : null;
  const pinned = head.pinned || (assistant?.pinned ?? false);
  const teams = [match.homeTeam, match.awayTeam].filter(Boolean).join(" – ");
  const classes = [styles.match, pinned && styles.pinnedCell, match.highlight && styles.highlight]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <div className={styles.meta}>
        <span
          className={`${styles.gender} ${match.gender === "W" ? styles.genderW : styles.genderM}`}
        >
          {t(match.gender === "W" ? "common.gender.w" : "common.gender.m")}
        </span>
        {match.matchNo && (
          <span className={styles.matchNo}>{t("grid.matchLabel", { match: match.matchNo })}</span>
        )}
      </div>
      {teams && <div className={styles.teams}>{teams}</div>}
      <SlotControl
        kind="head"
        matchId={match.id}
        slot={head}
        refName={refName}
        availableRefs={availableRefs}
        disabled={disabled}
        onPin={onPin}
        onOverride={onOverride}
      />
      {assistant && (
        <SlotControl
          kind="assistant"
          matchId={match.id}
          slot={assistant}
          refName={refName}
          availableRefs={availableRefs}
          disabled={disabled}
          onPin={onPin}
          onOverride={onOverride}
        />
      )}
    </div>
  );
}

interface SlotControlProps {
  kind: SlotKind;
  matchId: string;
  slot: Slot;
  refName: Map<string, string>;
  availableRefs: Referee[];
  disabled: boolean;
  onPin: GridProps["onPin"];
  onOverride: GridProps["onOverride"];
}

function SlotControl({
  kind,
  matchId,
  slot,
  refName,
  availableRefs,
  disabled,
  onPin,
  onOverride,
}: SlotControlProps) {
  const color = slot.refId ? refColor(slot.refId) : undefined;
  const name = slot.refId ? refName.get(slot.refId) ?? slot.refId : t("grid.noReferee");

  return (
    <div className={styles.slot}>
      <span className={styles.role}>
        {t(kind === "head" ? "common.role.head" : "common.role.assistant")}
      </span>
      <span className={styles.refName} style={color ? { color } : undefined}>
        <span className={styles.dot} style={{ background: color ?? "transparent" }} aria-hidden />
        {name}
      </span>
      <button
        type="button"
        className={slot.pinned ? `${styles.pin} ${styles.pinActive}` : styles.pin}
        onClick={() => onPin(matchId, kind, !slot.pinned)}
        disabled={disabled}
        aria-pressed={slot.pinned}
        title={slot.pinned ? t("grid.unpin") : t("grid.pin")}
      >
        🔒
      </button>
      <select
        className={styles.override}
        value={slot.refId ?? ""}
        disabled={disabled}
        aria-label={t("grid.override")}
        onChange={(e) => onOverride(matchId, kind, e.target.value === "" ? null : e.target.value)}
      >
        <option value="">{t("grid.noReferee")}</option>
        {availableRefs.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </div>
  );
}
