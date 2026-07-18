// PROTOTYPE — throwaway harness. Answers ticket 04's quantitative questions:
//   (1) valid schedules?  (2) low weighted penalty, rest-first?  (3) in-browser time budget?
//   (4) incremental re-solve around pins?  (5) reshuffle variation?
// Run: bun bench.ts   (or: bun run bench)

import { makeTournament } from "./src/fixture.ts";
import { emptyCarry, cloneSol, type Sol, type Problem, type Carry } from "./src/types.ts";
import { solve, greedy } from "./src/solver.ts";
import { makeRng } from "./src/rng.ts";
import { scoreDay, W } from "./src/score.ts";
import { validate, feasibility } from "./src/validate.ts";
import { accumulate } from "./src/carry.ts";

const CASES = [
  { name: "small   N8  M4  R10", N: 8, M: 4, R: 10, needARate: 0.75 },
  { name: "mid     N10 M5  R10", N: 10, M: 5, R: 10, needARate: 0.8 },
  { name: "large   N12 M6  R12", N: 12, M: 6, R: 12, needARate: 0.8 },
  { name: "wide    N12 M4  R10", N: 12, M: 4, R: 10, needARate: 0.7 },
  { name: "saturat N8  M4  R8 ", N: 8, M: 4, R: 8, needARate: 1.0 }, // 2M=N, no idle -> rest forced to bend
];

const BUDGET = 2000; // ms per day-solve

function brk(p: Problem, s: Sol, c: Carry): string {
  const sc = scoreDay(p, s, c);
  return (
    `total=${fmt(sc.total)}  [rest ${W.REST}*${sc.rest}=${fmt(W.REST * sc.rest)} | ` +
    `Hbal ${fmt(W.HBAL * sc.hbal)} | Abal ${fmt(W.ABAL * sc.abal)} | ` +
    `gender ${fmt(W.GENDER * sc.gender)} | pair ${fmt(W.PAIR * sc.pair)} | ` +
    `sit ${fmt(W.SIT * sc.sit)} | ha ${fmt(W.HA * sc.ha)}]`
  );
}
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

let seed = 12345;

for (const cs of CASES) {
  console.log(`\n=== ${cs.name}  (budget ${BUDGET}ms/day) ===`);
  const days = makeTournament({ N: cs.N, M: cs.M, R: cs.R, days: 2, needARate: cs.needARate, dropRefPerDay: true, seed: seed++ });

  let carry = emptyCarry(cs.N);
  const solutions: Sol[] = [];
  for (let d = 0; d < days.length; d++) {
    const p = days[d];
    const feas = feasibility(p);
    const g = scoreDay(p, greedy(p, carry, makeRng(seed)), carry).total;
    const res = solve(p, carry, { budgetMs: BUDGET, seed: seed++ });
    if (d === 0) console.log(`   greedy seed total=${fmt(g)} -> annealed total=${fmt(res.score)}  (${(((g - res.score) / g) * 100).toFixed(1)}% better)`);
    const problems = validate(p, res.sol);
    console.log(
      `day ${d + 1}: ${problems.length === 0 ? "VALID  " : "INVALID"}  ` +
        `${res.iters.toLocaleString()} iters, ${((res.accepts / res.iters) * 100).toFixed(0)}% acc, ${res.ms}ms`,
    );
    if (feas.failures.length) console.log(`   feasibility FAIL: ${feas.failures.join("; ")}`);
    if (feas.warnings.length) console.log(`   warn: ${feas.warnings.join("; ")}`);
    if (problems.length) console.log(`   HARD VIOLATIONS: ${problems.slice(0, 5).join("; ")}`);
    console.log(`   ${brk(p, res.sol, carry)}`);
    solutions.push(res.sol);
    carry = accumulate(carry, p, res.sol);
  }

  // (4) Incremental re-solve: pin ~30% of day-1 slots, warm-start, confirm pins held.
  const p0 = days[0];
  const pinned = cloneSol(solutions[0]);
  let pinCount = 0;
  const rng = ((x) => () => ((x = (x * 1103515245 + 12345) & 0x7fffffff), x / 0x7fffffff))(999);
  for (let m = 0; m < p0.matches.length; m++) {
    if (rng() < 0.3) {
      pinned.headPin[m] = 1;
      pinCount++;
    }
    if (p0.matches[m].needA && rng() < 0.3) {
      pinned.asstPin[m] = 1;
      pinCount++;
    }
  }
  const inc = solve(p0, emptyCarry(cs.N), { budgetMs: BUDGET, seed: seed++, warmStart: pinned });
  let held = true;
  for (let m = 0; m < p0.matches.length; m++) {
    if (pinned.headPin[m] && inc.sol.head[m] !== pinned.head[m]) held = false;
    if (pinned.asstPin[m] && inc.sol.asst[m] !== pinned.asst[m]) held = false;
  }
  console.log(`incremental: ${pinCount} pins, ${validate(p0, inc.sol).length === 0 ? "VALID" : "INVALID"}, pins ${held ? "HELD" : "BROKEN"}, ${brk(p0, inc.sol, emptyCarry(cs.N))}`);

  // (5) Reshuffle: two seeds, fresh solves -> compare difference + score spread.
  const rA = solve(p0, emptyCarry(cs.N), { budgetMs: BUDGET, seed: 1 });
  const rB = solve(p0, emptyCarry(cs.N), { budgetMs: BUDGET, seed: 2 });
  let diff = 0;
  for (let m = 0; m < p0.matches.length; m++) {
    if (rA.sol.head[m] !== rB.sol.head[m]) diff++;
    if (rA.sol.asst[m] !== rB.sol.asst[m]) diff++;
  }
  const slots = p0.matches.length + p0.matches.filter((x) => x.needA).length;
  console.log(`reshuffle: seed1 total=${fmt(scoreDay(p0, rA.sol, emptyCarry(cs.N)).total)}  seed2 total=${fmt(scoreDay(p0, rB.sol, emptyCarry(cs.N)).total)}  differ ${diff}/${slots} slots (${((diff / slots) * 100).toFixed(0)}%)`);

  // (3) Budget scaling: does more wall-clock buy better scores (graceful degradation)?
  const budgets = [100, 500, 2000];
  const line = budgets.map((b) => `${b}ms=${fmt(solve(p0, emptyCarry(cs.N), { budgetMs: b, seed: 7 }).score)}`).join("  ");
  console.log(`budget scaling (day1): ${line}`);
}

console.log("");
