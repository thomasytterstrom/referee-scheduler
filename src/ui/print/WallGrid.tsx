// Master wall grid — landscape, one page per day. Rounds down the side, courts across the top; each
// cell shows match no + gender + Head + Assistant. The single "source of truth" sheet at the desk.
import { t } from "../../i18n/t.ts";
import {
  DocHeader,
  GenderTag,
  RefLabel,
  byId,
  assignmentsByMatch,
  dayCourts,
  sortedRounds,
  slotRef,
} from "./shared.tsx";
import type { PrintProps } from "./shared.tsx";

export type WallGridProps = PrintProps;

export function WallGrid({ tournament, dayIndex, generatedAt, tournamentName }: WallGridProps) {
  const day = tournament.days[dayIndex];
  const refs = byId(tournament.referees);
  const courts = dayCourts(tournament, day);
  const rounds = sortedRounds(day);
  const assignments = assignmentsByMatch(day);
  const name = tournamentName ?? t("common.appName");

  return (
    <section className="print-artifact wall-grid">
      <DocHeader
        tournamentName={name}
        subtitle={t("print.header.allCourts", { day: dayIndex + 1 })}
        generatedAt={generatedAt}
      />
      <table className="wg-table">
        <thead>
          <tr>
            <th className="wg-corner">{t("print.col.round")}</th>
            {courts.map((c) => (
              <th key={c.id}>{c.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rounds.map((round) => (
            <tr key={round.index}>
              <td className="wg-rh">
                {t("print.roundLabel", { round: round.index + 1 })}
                {round.startTime && <div className="wg-time">{round.startTime}</div>}
              </td>
              {courts.map((court) => {
                const match = round.matches.find((m) => m.courtId === court.id);
                if (!match) return <td key={court.id} className="wg-idle">—</td>;
                const a = assignments.get(match.id);
                const head = slotRef(refs, a?.head.refId ?? null);
                const asst = slotRef(refs, a?.assistant?.refId ?? null);
                return (
                  <td key={court.id}>
                    <div className="wg-top">
                      {match.matchNo && <span className="wg-mno">#{match.matchNo}</span>}
                      <GenderTag gender={match.gender} />
                    </div>
                    <div className="wg-role">
                      <span className="wg-k">{t("print.roleShort.head")}</span>
                      <RefLabel ref={head} />
                    </div>
                    {match.requiresAssistant && (
                      <div className="wg-role">
                        <span className="wg-k">{t("print.roleShort.assistant")}</span>
                        <RefLabel ref={asst} />
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
