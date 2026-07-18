// PROTOTYPE — throwaway. Portable core types for the referee solver.
// Mirrors .scratch/web-referee-scheduler/domain-model.md, flattened to indices for speed.

export type Gender = 0 | 1; // 0 = W, 1 = M

export interface Match {
  court: number; // court index within the day
  round: number; // round index within the day
  gender: Gender;
  needA: boolean; // requiresAssistant
  matchNo?: string;
}

// One day's problem, ready for the solver.
export interface Problem {
  N: number; // roster size (ref indices 0..N-1, tournament-wide)
  R: number; // rounds this day
  matches: Match[];
  avail: Uint8Array[]; // [ref] length R, 1 = available that round
  roundMatches: number[][]; // round -> match indices (sparse: <= M per round)
}

// A day's assignment. Arrays aligned with problem.matches[].
export interface Sol {
  head: Int32Array; // head[m] = ref index, or -1
  asst: Int32Array; // asst[m] = ref index, or -1 (unassigned / no assistant)
  headPin: Uint8Array; // 1 = pinned (solver must not move)
  asstPin: Uint8Array;
}

// Cumulative accumulators from all FINALIZED days before the one being solved.
// pu/po are N*N flattened; pu keyed [min*N+max] (unordered), po keyed [head*N+asst].
export interface Carry {
  N: number;
  H: Float64Array;
  A: Float64Array;
  HW: Float64Array;
  HM: Float64Array;
  AW: Float64Array;
  AM: Float64Array;
  avail: Float64Array; // cumulative available rounds per ref
  pu: Float64Array;
  po: Float64Array;
  totalHead: number;
  totalAsst: number;
  totalHW: number;
  totalHM: number;
  totalAW: number;
  totalAM: number;
  P: number; // cumulative pair-forming (needA) matches
}

export function emptyCarry(N: number): Carry {
  return {
    N,
    H: new Float64Array(N),
    A: new Float64Array(N),
    HW: new Float64Array(N),
    HM: new Float64Array(N),
    AW: new Float64Array(N),
    AM: new Float64Array(N),
    avail: new Float64Array(N),
    pu: new Float64Array(N * N),
    po: new Float64Array(N * N),
    totalHead: 0,
    totalAsst: 0,
    totalHW: 0,
    totalHM: 0,
    totalAW: 0,
    totalAM: 0,
    P: 0,
  };
}

export function emptySol(m: number): Sol {
  return {
    head: new Int32Array(m).fill(-1),
    asst: new Int32Array(m).fill(-1),
    headPin: new Uint8Array(m),
    asstPin: new Uint8Array(m),
  };
}

export function cloneSol(s: Sol): Sol {
  return {
    head: s.head.slice(),
    asst: s.asst.slice(),
    headPin: s.headPin.slice(),
    asstPin: s.asstPin.slice(),
  };
}
