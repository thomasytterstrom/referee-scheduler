// Per-court call sheets — portrait, one page per court (page break between courts, in print.css).
// Chronological referee list for the court: Time · Match no · Class · Head · Assistant. No score
// column — the app assigns referees, it does not track match results.
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

export type CallSheetsProps = PrintProps;

export function CallSheets({ tournament, dayIndex, generatedAt, tournamentName }: CallSheetsProps) {
  const day = tournament.days[dayIndex];
  const refs = byId(tournament.referees);
  const courts = dayCourts(tournament, day);
  const rounds = sortedRounds(day);
  const assignments = assignmentsByMatch(day);
  const name = tournamentName ?? t("common.appName");

  return (
    <section className="print-artifact call-sheets">
      {courts.map((court) => {
        const entries = rounds.flatMap((round) => {
          const match = round.matches.find((m) => m.courtId === court.id);
          if (!match) return [];
          const a = assignments.get(match.id);
          return [
            {
              round,
              match,
              head: slotRef(refs, a?.head.refId ?? null),
              asst: slotRef(refs, a?.assistant?.refId ?? null),
            },
          ];
        });
        return (
          <section className="call-court" key={court.id}>
            <DocHeader
              tournamentName={name}
              subtitle={t("print.header.callSheet", { day: dayIndex + 1, court: court.name })}
              generatedAt={generatedAt}
            />
            <h2 className="cs-title">{court.name}</h2>
            <table className="cs-table">
              <thead>
                <tr>
                  <th>{t("print.col.time")}</th>
                  <th>{t("print.col.match")}</th>
                  <th>{t("print.col.class")}</th>
                  <th>{t("print.col.head")}</th>
                  <th>{t("print.col.assistant")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(({ round, match, head, asst }) => (
                  <tr key={match.id}>
                    <td className="cs-time">
                      {round.startTime ?? t("print.roundLabel", { round: round.index + 1 })}
                    </td>
                    <td>{match.matchNo ? `#${match.matchNo}` : "—"}</td>
                    <td>
                      <GenderTag gender={match.gender} />
                    </td>
                    <td>
                      <RefLabel ref={head} />
                    </td>
                    <td>
                      {match.requiresAssistant ? (
                        <RefLabel ref={asst} />
                      ) : (
                        <span className="print-none">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </section>
  );
}
