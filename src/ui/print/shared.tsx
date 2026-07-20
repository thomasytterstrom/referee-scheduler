// Shared print atoms + lookups for the three courtside artifacts. Pure presentational, no shell deps.
// Importing the stylesheet here means any artifact carries its own print CSS when mounted.
import type { ReactNode } from "react";
import type {
  Tournament,
  Day,
  Referee,
  Court,
  Assignment,
  Gender,
} from "../../model/tournament.ts";
import { t } from "../../i18n/t.ts";
import { makeRefColorMap } from "../grid/refColor.ts";
import "./print.css";

// Common props for every artifact. Tournament carries no display name, so it comes in as a prop
// (falls back to the app name). dayIndex is 0-based into tournament.days.
export interface PrintProps {
  tournament: Tournament;
  dayIndex: number;
  generatedAt: string; // pre-formatted timestamp, rendered verbatim into the header
  tournamentName?: string;
}

// Re-export makeRefColorMap so print artifacts can build the roster color map.
export { makeRefColorMap };

export function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((x) => [x.id, x]));
}

export const assignmentsByMatch = (day: Day): Map<string, Assignment> =>
  new Map(day.assignments.map((a) => [a.matchId, a]));

// Courts used this day, in roster order (availableCourtIds is an unordered subset of the roster).
export const dayCourts = (tournament: Tournament, day: Day): Court[] =>
  tournament.courts.filter((c) => day.availableCourtIds.includes(c.id));

// Rounds in authoritative order.
export const sortedRounds = (day: Day): Day["rounds"] =>
  [...day.rounds].sort((a, b) => a.index - b.index);

// Resolve an assigned slot to a referee. null slot -> undefined; a dangling id shows itself, never
// vanishing silently.
export function slotRef(refs: Map<string, Referee>, refId: string | null): Referee | undefined {
  if (refId === null) return undefined;
  return refs.get(refId) ?? { id: refId, name: refId };
}

export function Dot({ id, colorMap }: { id: string; colorMap: Map<string, string> }): ReactNode {
  return <span className="print-dot" style={{ background: colorMap.get(id) ?? `hsl(0,0%,50%)` }} />;
}

// Referee identity: color dot + full name (name alone carries identity on a B/W laser). undefined -> em-dash.
export function RefLabel({ ref, colorMap }: { ref: Referee | undefined; colorMap: Map<string, string> }): ReactNode {
  if (!ref) return <span className="print-none">—</span>;
  return (
    <span className="print-ref">
      <Dot id={ref.id} colorMap={colorMap} />
      {ref.name}
    </span>
  );
}

// Gender as a print-safe text tag (never color-only).
export function GenderTag({ gender }: { gender: Gender }): ReactNode {
  return (
    <span className={gender === "W" ? "print-g print-gW" : "print-g print-gM"}>
      {t(gender === "W" ? "common.gender.w" : "common.gender.m")}
    </span>
  );
}

// Page header band: tournament (left) · day subtitle (middle) · generated-at (right).
export function DocHeader({
  tournamentName,
  subtitle,
  generatedAt,
}: {
  tournamentName: string;
  subtitle: string;
  generatedAt: string;
}): ReactNode {
  return (
    <header className="print-hdr">
      <span className="print-hdr-t">{tournamentName}</span>
      <span className="print-hdr-d">{subtitle}</span>
      <span className="print-hdr-g">{t("print.header.generatedAt", { timestamp: generatedAt })}</span>
    </header>
  );
}
