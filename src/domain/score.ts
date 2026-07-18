// PROTOTYPE — throwaway shell, PORTABLE core. The objective function.
// Direct port of .scratch/web-referee-scheduler/constraint-spec.md, generalized to N refs / M
// courts / synchronized rounds with availability-proportional targets and cross-day carryover.
// Single source of truth for schedule quality — SA minimizes total.

import type { Problem, Sol, Carry } from "./types.ts";

export const W = {
  REST: 5000,
  HBAL: 1000,
  ABAL: 1000,
  GENDER: 200,
  PAIR: 50,
  SIT: 30,
  HA: 10,
} as const;

export interface Score {
  rest: number; // raw (squared) terms, pre-weight
  hbal: number;
  abal: number;
  gender: number;
  pair: number;
  sit: number;
  ha: number;
  total: number; // weighted sum
}

export function scoreDay(p: Problem, s: Sol, carry: Carry): Score {
  const N = p.N;
  const R = p.R;
  const duty = new Int8Array(N * R); // 0 none, 1 head, 2 asst

  const dayH = new Float64Array(N);
  const dayA = new Float64Array(N);
  const dHW = new Float64Array(N);
  const dHM = new Float64Array(N);
  const dAW = new Float64Array(N);
  const dAM = new Float64Array(N);
  const puDay = new Float64Array(N * N);
  const poDay = new Float64Array(N * N);
  let dayTotHead = 0;
  let dayTotAsst = 0;
  let dayP = 0;

  for (let m = 0; m < p.matches.length; m++) {
    const mt = p.matches[m];
    const h = s.head[m];
    const a = s.asst[m];
    if (h >= 0) {
      duty[h * R + mt.round] = 1;
      dayH[h]++;
      dayTotHead++;
      if (mt.gender === 0) dHW[h]++;
      else dHM[h]++;
    }
    if (mt.needA && a >= 0) {
      duty[a * R + mt.round] = 2;
      dayA[a]++;
      dayTotAsst++;
      if (mt.gender === 0) dAW[a]++;
      else dAM[a]++;
    }
    if (mt.needA && h >= 0 && a >= 0) {
      dayP++;
      poDay[h * N + a]++;
      const lo = h < a ? h : a;
      const hi = h < a ? a : h;
      puDay[lo * N + hi]++;
    }
  }

  // Cumulative availability + proportional-target denominator.
  const availCum = new Float64Array(N);
  let sumAvailCum = 0;
  let Neff = 0;
  for (let r = 0; r < N; r++) {
    let c = 0;
    const av = p.avail[r];
    for (let rd = 0; rd < R; rd++) c += av[rd];
    availCum[r] = carry.avail[r] + c;
    sumAvailCum += availCum[r];
    if (availCum[r] > 0) Neff++;
  }

  // 2. Head / Assistant balance (availability-proportional cumulative targets).
  const totHeadCum = carry.totalHead + dayTotHead;
  const totAsstCum = carry.totalAsst + dayTotAsst;
  let hbal = 0;
  let abal = 0;
  // 3. Fine gender balance (four buckets).
  const totHW = carry.totalHW + sum(dHW);
  const totHM = carry.totalHM + sum(dHM);
  const totAW = carry.totalAW + sum(dAW);
  const totAM = carry.totalAM + sum(dAM);
  let gender = 0;
  for (let r = 0; r < N; r++) {
    const ratio = sumAvailCum > 0 ? availCum[r] / sumAvailCum : 0;
    const aH = carry.H[r] + dayH[r];
    const aA = carry.A[r] + dayA[r];
    hbal += (aH - totHeadCum * ratio) ** 2;
    abal += (aA - totAsstCum * ratio) ** 2;
    gender += (carry.HW[r] + dHW[r] - totHW * ratio) ** 2;
    gender += (carry.HM[r] + dHM[r] - totHM * ratio) ** 2;
    gender += (carry.AW[r] + dAW[r] - totAW * ratio) ** 2;
    gender += (carry.AM[r] + dAM[r] - totAM * ratio) ** 2;
  }

  // 4. Pair variety. Caps scale with effective roster (spec sanity: N=4,P=16 -> capU 3, capO 2).
  const Pcum = carry.P + dayP;
  const capU = Neff > 1 ? Math.ceil(Pcum / ((Neff * (Neff - 1)) / 2)) : Infinity;
  const capO = Neff > 1 ? Math.ceil(Pcum / (Neff * (Neff - 1))) : Infinity;
  let pair = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i === j) continue;
      const co = carry.po[i * N + j] + poDay[i * N + j];
      if (co > capO) pair += (co - capO) ** 2;
      if (i < j) {
        const cu = carry.pu[i * N + j] + puDay[i * N + j];
        if (cu > capU) pair += (cu - capU) ** 2;
      }
    }
  }

  // 1/5/6. Streak-based terms — per ref, WITHIN this day only (streaks reset at day boundary).
  let rest = 0;
  let sit = 0;
  let ha = 0;
  for (let r = 0; r < N; r++) {
    const av = p.avail[r];
    let actStreak = 0;
    let sitStreak = 0;
    for (let rd = 0; rd < R; rd++) {
      const d = duty[r * R + rd];
      if (d > 0) {
        if (sitStreak > 3) sit += (sitStreak - 3) ** 2;
        sitStreak = 0;
        actStreak++;
      } else {
        if (actStreak > 2) rest += (actStreak - 2) ** 2;
        actStreak = 0;
        if (av[rd]) {
          sitStreak++;
        } else {
          if (sitStreak > 3) sit += (sitStreak - 3) ** 2;
          sitStreak = 0;
        }
      }
    }
    if (actStreak > 2) rest += (actStreak - 2) ** 2;
    if (sitStreak > 3) sit += (sitStreak - 3) ** 2;
    // 6. H->A back-to-back: Head at rd then Head again at rd+1 is the violation.
    for (let rd = 0; rd < R - 1; rd++) {
      if (duty[r * R + rd] === 1 && duty[r * R + rd + 1] === 1) ha++;
    }
  }

  const total =
    W.REST * rest +
    W.HBAL * hbal +
    W.ABAL * abal +
    W.GENDER * gender +
    W.PAIR * pair +
    W.SIT * sit +
    W.HA * ha;

  return { rest, hbal, abal, gender, pair, sit, ha, total };
}

function sum(a: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s;
}
