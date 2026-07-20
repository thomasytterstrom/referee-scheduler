// In-memory app store: the single mutation point for the active Tournament. Holds the tournament,
// the selected dayIndex, an id, and a display name; every mutator produces a fresh (structural-clone)
// tournament so React re-renders, then a debounced autosave (persistence.createAutosave) writes the
// whole record back under its id — which re-stamps updatedAt on each save. dayIndex/step/selection are
// UI-transient and never persisted (they are not part of the Tournament graph).
//
// When signed in, saves also go to Supabase (cloud as source of truth, issue #9). If an optimistic-
// concurrency conflict is detected the `conflict` flag is set; the UI should prompt the user to reload.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Assignment, Court, Day, Match, Referee, Tournament } from "../../model/tournament.ts";
import { newCourtId } from "../../model/tournament.ts";
import type { ImportSource, MergeResult } from "../../import/fixtures.ts";
import { mergeImport } from "../../import/fixtures.ts";
import type { SlotKind } from "../grid/Grid.tsx";
import type { Sol } from "../../domain/types.ts";
import { applySol, type RefIndexMap } from "../../model/adapter.ts";
import { createAutosave } from "../../persistence/db.ts";

export interface Store {
  id: string;
  name: string;
  tournament: Tournament;
  dayIndex: number;
  /** True when a concurrent cloud save was detected — prompt user to reload. */
  conflict: boolean;
  clearConflict(): void;

  setName(name: string): void;
  setDayIndex(i: number): void;

  // Add a referee (from the directory) to this tournament's roster; dedups by id. The name is a
  // snapshot copy — later directory/other-tournament renames do not propagate here.
  addReferee(ref: Referee): void;
  renameReferee(id: string, name: string): void;
  removeReferee(id: string): void;

  addCourt(name: string): void;
  renameCourt(id: string, name: string): void;
  removeCourt(id: string): void;

  // Per-day court selection (Day.availableCourtIds); matches on unselected courts are excluded from
  // the grid + solver but never deleted.
  toggleCourtOnDay(dayIndex: number, courtId: string, selected: boolean): void;

  // Fast-fill import overlay: merges a fixture file/paste onto the current tournament (preserving
  // referees, assignments and pins) and returns the merge report for the UI to surface.
  importMatches(inputs: ImportSource[]): MergeResult;
  // Replace the whole tournament (e.g. a loaded JSON backup); roster availability is re-normalized.
  replaceTournament(t: Tournament): void;

  // Grid callbacks — mirror the adapter's pins <-> Slot.pinned model. Picking a referee pins the slot
  // (ui-spec: an override is a lock the generator respects); clearing it unpins.
  onPin(matchId: string, slot: SlotKind, pinned: boolean): void;
  onOverride(matchId: string, slot: SlotKind, refId: string | null): void;

  // Commit a solved Sol back into a day (Task 9 solve controller). The single atomic swap point:
  // clone the tournament, write the solution onto the target day, publish + autosave.
  applySolution(dayIndex: number, sol: Sol, map: RefIndexMap): void;
}

// Make every current referee available (all rounds) on every day that does not already list them.
// The adapter treats an absent refId as unavailable, so a fresh import / newly-added ref needs this to
// become assignable and to appear in the grid's override dropdown.
function ensureAvailability(t: Tournament): void {
  for (const day of t.days)
    for (const ref of t.referees) if (!(ref.id in day.availability)) day.availability[ref.id] = null;
}

function findMatch(day: Day, matchId: string): Match | undefined {
  for (const round of day.rounds) {
    const m = round.matches.find((x) => x.id === matchId);
    if (m) return m;
  }
  return undefined;
}

function ensureAssignment(day: Day, match: Match): Assignment {
  let a = day.assignments.find((x) => x.matchId === match.id);
  if (!a) {
    a = {
      matchId: match.id,
      head: { refId: null, pinned: false },
      assistant: match.requiresAssistant ? { refId: null, pinned: false } : null,
    };
    day.assignments.push(a);
  }
  return a;
}

const StoreCtx = createContext<Store | null>(null);

export interface StoreInit {
  id: string;
  name: string;
  tournament: Tournament;
  /** Present when this tournament was loaded from cloud storage. */
  ownerId?: string;
  cloudUpdatedAt?: string;
  /** Cloud save function; when present the store calls it on each autosave. */
  onCloudSave?: (rec: {
    id: string;
    name: string;
    tournament: Tournament;
    lastKnownUpdatedAt: string | null;
  }) => Promise<{ ok: boolean; reason?: string; updatedAt?: string }>;
}

export function StoreProvider({ initial, children }: { initial: StoreInit; children: ReactNode }) {
  const [name, setName] = useState(initial.name);
  const [tournament, setTournament] = useState<Tournament>(() => {
    const t = structuredClone(initial.tournament);
    ensureAvailability(t);
    return t;
  });
  const [dayIndex, setDayIndex] = useState(0);
  const [conflict, setConflict] = useState(false);

  // Track the most recent updated_at seen from the cloud so the next save can do an optimistic check.
  const lastCloudUpdatedAt = useRef<string | null>(initial.cloudUpdatedAt ?? null);
  const pendingCloudSave = useRef<{
    id: string;
    name: string;
    tournament: Tournament;
  } | null>(null);
  const cloudSaveInFlight = useRef(false);

  const autosave = useRef(createAutosave()).current;

  const flushCloudSaves = useCallback(async () => {
    if (!initial.onCloudSave || cloudSaveInFlight.current) return;
    cloudSaveInFlight.current = true;
    try {
      while (pendingCloudSave.current) {
        const rec = pendingCloudSave.current;
        pendingCloudSave.current = null;
        const result = await initial.onCloudSave({
          ...rec,
          lastKnownUpdatedAt: lastCloudUpdatedAt.current,
        });
        if (result.ok && result.updatedAt) {
          lastCloudUpdatedAt.current = result.updatedAt;
        } else if (!result.ok && result.reason === "conflict") {
          setConflict(true);
        }
      }
    } finally {
      cloudSaveInFlight.current = false;
    }
  }, [initial.onCloudSave]);

  const queueCloudSave = useCallback(
    (rec: { id: string; name: string; tournament: Tournament }) => {
      if (!initial.onCloudSave) return;
      pendingCloudSave.current = rec;
      void flushCloudSaves();
    },
    [flushCloudSaves, initial.onCloudSave],
  );

  useEffect(() => {
    autosave({ id: initial.id, name, tournament });
    if (initial.onCloudSave) queueCloudSave({ id: initial.id, name, tournament });
  }, [autosave, initial.id, name, tournament, queueCloudSave, initial.onCloudSave]);

  const mutate = (fn: (t: Tournament) => void) =>
    setTournament((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });

  const store: Store = {
    id: initial.id,
    name,
    tournament,
    dayIndex,
    conflict,
    clearConflict: () => setConflict(false),

    setName,
    setDayIndex,

    addReferee(ref) {
      mutate((t) => {
        if (t.referees.some((r) => r.id === ref.id)) return; // already in this roster (dedup by id)
        t.referees.push({ id: ref.id, name: ref.name });
        for (const day of t.days) day.availability[ref.id] = null;
      });
    },
    renameReferee(id, refName) {
      mutate((t) => {
        const ref = t.referees.find((r) => r.id === id);
        if (ref) ref.name = refName;
      });
    },
    removeReferee(id) {
      mutate((t) => {
        t.referees = t.referees.filter((r) => r.id !== id);
        for (const day of t.days) {
          delete day.availability[id];
          for (const a of day.assignments) {
            if (a.head.refId === id) a.head = { refId: null, pinned: false };
            if (a.assistant?.refId === id) a.assistant = { refId: null, pinned: false };
          }
        }
      });
    },

    addCourt(courtName) {
      const trimmed = courtName.trim();
      if (!trimmed) return;
      mutate((t) => {
        const court: Court = { id: newCourtId(), name: trimmed };
        t.courts.push(court);
        for (const day of t.days) day.availableCourtIds.push(court.id); // default: selected every day
      });
    },
    renameCourt(id, courtName) {
      mutate((t) => {
        const court = t.courts.find((c) => c.id === id);
        if (court) court.name = courtName;
      });
    },
    removeCourt(id) {
      mutate((t) => {
        t.courts = t.courts.filter((c) => c.id !== id);
        for (const day of t.days) {
          day.availableCourtIds = day.availableCourtIds.filter((c) => c !== id);
          const gone = new Set<string>();
          for (const round of day.rounds) {
            for (const m of round.matches) if (m.courtId === id) gone.add(m.id);
            round.matches = round.matches.filter((m) => m.courtId !== id);
          }
          day.assignments = day.assignments.filter((a) => !gone.has(a.matchId));
        }
      });
    },

    toggleCourtOnDay(di, courtId, selected) {
      mutate((t) => {
        const day = t.days[di];
        if (!day) return;
        const has = day.availableCourtIds.includes(courtId);
        if (selected && !has) day.availableCourtIds.push(courtId);
        else if (!selected && has)
          day.availableCourtIds = day.availableCourtIds.filter((c) => c !== courtId);
      });
    },

    importMatches(inputs) {
      const result = mergeImport(tournament, inputs);
      ensureAvailability(result.tournament);
      setTournament(result.tournament);
      return result;
    },
    replaceTournament(t) {
      const next = structuredClone(t);
      ensureAvailability(next);
      setTournament(next);
    },

    onPin(matchId, kind, pinned) {
      const di = dayIndex;
      mutate((t) => {
        const day = t.days[di];
        if (!day) return;
        const match = findMatch(day, matchId);
        if (!match) return;
        const slot = kind === "head" ? ensureAssignment(day, match).head : ensureAssignment(day, match).assistant;
        if (slot) slot.pinned = pinned;
      });
    },
    onOverride(matchId, kind, refId) {
      const di = dayIndex;
      mutate((t) => {
        const day = t.days[di];
        if (!day) return;
        const match = findMatch(day, matchId);
        if (!match) return;
        const slot = kind === "head" ? ensureAssignment(day, match).head : ensureAssignment(day, match).assistant;
        if (!slot) return;
        slot.refId = refId;
        slot.pinned = refId !== null;
      });
    },

    applySolution(di, sol, map) {
      mutate((t) => {
        const day = t.days[di];
        if (day) applySol(day, sol, map);
      });
    },
  };

  return <StoreCtx.Provider value={store}>{children}</StoreCtx.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreCtx);
  if (!s) throw new Error("useStore must be used within a StoreProvider");
  return s;
}
