// Per-referee duty slips — portrait, 2-up, one slip per referee. Each slip is that ref's personal
// "your duties today": header (name + count) then chronological Time · Court · Role · Class rows.
// break-inside: avoid (in print.css) keeps a slip whole across the page fold. Cut and hand out.
import type { Gender } from "../../model/tournament.ts";
import { t } from "../../i18n/t.ts";
import {
  DocHeader,
  GenderTag,
  Dot,
  byId,
  assignmentsByMatch,
  sortedRounds,
} from "./shared.tsx";
import type { PrintProps } from "./shared.tsx";

export type DutySlipsProps = PrintProps;

interface Duty {
  time: string;
  court: string;
  role: string;
  gender: Gender;
}

export function DutySlips({ tournament, dayIndex, generatedAt, tournamentName }: DutySlipsProps) {
  const day = tournament.days[dayIndex];
  const courts = byId(tournament.courts);
  const rounds = sortedRounds(day);
  const assignments = assignmentsByMatch(day);
  const name = tournamentName ?? t("common.appName");

  // refId -> chronological duties (rounds already ordered).
  const dutiesByRef = new Map<string, Duty[]>();
  for (const ref of tournament.referees) dutiesByRef.set(ref.id, []);
  for (const round of rounds) {
    const time = round.startTime ?? t("print.roundLabel", { round: round.index + 1 });
    for (const match of round.matches) {
      const a = assignments.get(match.id);
      if (!a) continue;
      const court = courts.get(match.courtId)?.name ?? match.courtId;
      const add = (refId: string | null, role: string): void => {
        if (refId === null) return;
        dutiesByRef.get(refId)?.push({ time, court, role, gender: match.gender });
      };
      add(a.head.refId, t("common.role.head"));
      if (a.assistant) add(a.assistant.refId, t("common.role.assistant"));
    }
  }

  return (
    <section className="print-artifact duty-slips">
      <DocHeader
        tournamentName={name}
        subtitle={t("print.header.dutySlips", { day: dayIndex + 1 })}
        generatedAt={generatedAt}
      />
      <div className="ds-grid">
        {tournament.referees.map((ref) => {
          const duties = dutiesByRef.get(ref.id) ?? [];
          return (
            <article className="slip" key={ref.id}>
              <div className="slip-hdr">
                <Dot id={ref.id} />
                <span className="slip-name">{ref.name}</span>
                <span className="slip-count">{t("print.slip.dutyCount", { count: duties.length })}</span>
              </div>
              {duties.length === 0 ? (
                <div className="slip-free">{t("print.slip.none")}</div>
              ) : (
                <>
                  <div className="slip-sub">{t("print.slip.title")}</div>
                  <table className="slip-table">
                    <thead>
                      <tr>
                        <th>{t("print.col.time")}</th>
                        <th>{t("print.col.court")}</th>
                        <th>{t("print.col.role")}</th>
                        <th>{t("print.col.class")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {duties.map((d, i) => (
                        <tr key={i}>
                          <td className="ds-time">{d.time}</td>
                          <td>{d.court}</td>
                          <td className="ds-role">{d.role}</td>
                          <td>
                            <GenderTag gender={d.gender} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
