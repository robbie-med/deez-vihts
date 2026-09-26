/*
 * run-scenarios.mjs - Reproducible scenario runs for the paper (paper.md).
 *
 * Every quantitative claim in the paper comes from this script. Run with:
 *   node scripts/run-scenarios.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Model = require('../js/model.js');

const IU_PER_UG = 40;

function run(overrides, days, startDoy = 1) {
  return Model.simulate(Model.defaultPersona(overrides), { days, startDoy });
}
function daily(doseIU, weeks = 104) {
  return [{ type: 'daily', doseIU, hourOfDay: 8, durationWeeks: weeks }];
}
function stats(r) {
  const a = r.c25;
  return {
    min: Math.min(...a),
    mean: a.reduce((s, v) => s + v, 0) / a.length,
    max: Math.max(...a),
    end: a[a.length - 1]
  };
}
function at(r, day) {
  const i = r.tHours.findIndex((t) => t >= day * 24);
  return r.c25[i < 0 ? r.c25.length - 1 : i];
}
function skinIU(overrides, doy) {
  return Model.dailySkinSynthesisUg(Model.defaultPersona(overrides), doy) * IU_PER_UG;
}
const f = (x, d = 1) => x.toFixed(d);

console.log('=== Scenario A: classic 3-way comparison, full year at lat 40 N from Jan 1 ===');
console.log('(no supplement, 400 IU/d diet; outdoor/obese get 2 h midday sun, 25% skin, type III, age 40)');
for (const key of ['outdoor', 'obese', 'indoor']) {
  const r = run(Model.PRESETS[key], 365);
  const s = stats(r);
  const skinYear = r.dailySkinUg.reduce((x, y) => x + y, 0) * IU_PER_UG;
  console.log(`${key.padEnd(8)} min ${f(s.min)}  mean ${f(s.mean)}  max ${f(s.max)}  end ${f(s.end)} ng/mL  | skin ${f(skinYear / 1000, 0)}k IU/yr`);
}

console.log('\n=== Scenario B: measured starting level of 5 ng/mL (outdoor persona, Jan 1) ===');
for (const [label, extra] of [
  ['no supplement, response fit', { fitMode: 'response' }],
  ['no supplement, exposure fit', { fitMode: 'exposure' }],
  ['4000 IU/d, response fit', { fitMode: 'response', supplements: daily(4000) }],
  ['4000 IU/d, exposure fit', { fitMode: 'exposure', supplements: daily(4000) }]
]) {
  const r = run({ starting25OHD: 5, ...extra }, 730);
  const cells = [0, 90, 180, 270, 365, 730].map((d) => `d${d} ${f(at(r, d))}`).join('  ');
  console.log(`${label.padEnd(30)} factor ${f(r.fit.factor, 2)}  | ${cells}`);
}

console.log('\n=== Scenario C: dose response, 1000 IU/day for 180 days, no sun ===');
for (const [label, w, diet] of [['75 kg, 1500 IU/d diet', 75, 1500], ['75 kg, 400 IU/d diet', 75, 400], ['120 kg, 400 IU/d diet', 120, 400]]) {
  const base = { weightKg: w, sunHours: 0, dietIU: diet };
  const c = run(base, 180).c25.at(-1);
  const e = run({ ...base, supplements: daily(1000) }, 180).c25.at(-1);
  console.log(`${label.padEnd(24)} control ${f(c)}  dosed ${f(e)}  dose-attributable rise ${f(e - c)} ng/mL`);
}

console.log('\n=== Scenario D: daily skin synthesis (IU/day) by latitude and date ===');
console.log('(2 h midday window, 25% skin, type III, age 40, repeated daily)');
console.log(['lat', 'Jan 15', 'Mar 20', 'Jun 21', 'Sep 22', 'Dec 21'].join('\t'));
for (const lat of [0, 20, 35, 40, 50, 60]) {
  console.log([`${lat}`, ...[15, 79, 172, 265, 355].map((doy) => f(skinIU({ lat }, doy), 0))].join('\t'));
}

console.log('\n=== Scenario E: exposure time, skin type and sunscreen (lat 40, Jun 21) ===');
console.log('minutes\t' + [1, 3, 6].map((t) => `type ${t}`).join('\t') + '\ttype III SPF 15');
for (const min of [10, 20, 30, 60, 120, 240]) {
  const h = min / 60;
  console.log([min, ...[1, 3, 6].map((t) => f(skinIU({ sunHours: h, skinType: t }, 172), 0)),
    f(skinIU({ sunHours: h, envOpts: { spf: 15 } }, 172), 0)].join('\t'));
}

console.log('\n=== Scenario F: decay (no inputs, measured 32 ng/mL) ===');
const rd = run({ sunHours: 0, dietIU: 0, starting25OHD: 32 }, 63);
console.log([0, 21, 42, 63].map((d) => `day ${d}: ${f(at(rd, d))}`).join('  '));

console.log('\n=== Scenario G: loading then maintenance (50,000 IU weekly x 8 wk, then 1000 IU/d), start 12 ng/mL indoor ===');
const rl = run({
  sunHours: 0, starting25OHD: 12, fitMode: 'exposure',
  supplements: [
    { type: 'weekly', doseIU: 50000, hourOfDay: 8, durationWeeks: 8 },
    { type: 'daily', doseIU: 1000, hourOfDay: 8, durationWeeks: 44 }
  ]
}, 365);
console.log([0, 28, 56, 90, 180, 365].map((d) => `day ${d}: ${f(at(rl, d))}`).join('  '));
