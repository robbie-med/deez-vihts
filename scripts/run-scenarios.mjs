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

function stats(r) {
  const a = r.c25;
  const min = Math.min(...a);
  const max = Math.max(...a);
  const mean = a.reduce((s, v) => s + v, 0) / a.length;
  return { min, mean, max, end: a[a.length - 1] };
}

function fmt(x, d = 1) {
  return x.toFixed(d);
}

console.log('=== Scenario A: classic 3-way comparison, full year at lat 40 N ===');
console.log('(start25 = 25 ng/mL, no supplement; outdoor/obese get 2 h midday sun, 25% skin, type III)');
for (const key of ['outdoor', 'obese', 'indoor']) {
  const p = Model.defaultPersona(Model.PRESETS[key]);
  const r = Model.simulate(p, { startDoy: 1, days: 365 });
  const s = stats(r);
  const skinYearUg = r.dailySkinUg.reduce((x, y) => x + y, 0);
  console.log(
    `${p.name.padEnd(18)} min ${fmt(s.min)}  mean ${fmt(s.mean)}  max ${fmt(s.max)}  end ${fmt(s.end)} ng/mL` +
    `  | yearly skin synthesis ${fmt(skinYearUg * IU_PER_UG / 1000, 0)}k IU`
  );
}

console.log('\n=== Scenario B: seasonal skin synthesis for the Outdoor persona (lat 40) ===');
const out = Model.defaultPersona(Model.PRESETS.outdoor);
for (const [label, doy] of [['Jan 15', 15], ['Apr 15', 105], ['Jun 21', 172], ['Oct 15', 288]]) {
  const ug = Model.dailySkinSynthesisUg(out, doy);
  console.log(`${label}: ${fmt(ug * IU_PER_UG, 0)} IU/day (${fmt(ug, 1)} ug/day)`);
}

console.log('\n=== Scenario C: dose response, 1000 IU/day for 180 days, start 20 ng/mL, no sun ===');
for (const [label, w, f] of [['Normal (75 kg, 20% fat)', 75, 0.20], ['Obese (120 kg, 40% fat)', 120, 0.40]]) {
  const dosed = Model.simulate(
    Model.defaultPersona({ weightKg: w, fatFrac: f, sunHours: 0, start25: 20, supplement: { type: 'daily', doseIU: 1000, hourOfDay: 8 } }),
    { startDoy: 1, days: 180 }
  );
  const control = Model.simulate(
    Model.defaultPersona({ weightKg: w, fatFrac: f, sunHours: 0, start25: 20 }),
    { startDoy: 1, days: 180 }
  );
  const e = dosed.c25[dosed.c25.length - 1];
  const c = control.c25[control.c25.length - 1];
  console.log(`${label}: end ${fmt(e)} ng/mL, rise vs start ${fmt(e - 20)}, dose-attributable rise vs control ${fmt(e - c)}`);
}

console.log('\n=== Scenario D: latitude/season grid of daily skin synthesis (IU/day) ===');
console.log('(2 h midday window, 25% skin exposed, Fitzpatrick III)');
const header = ['lat', 'Jan 15', 'Mar 20', 'Jun 21', 'Sep 22', 'Dec 21'];
console.log(header.join('\t'));
for (const lat of [0, 20, 35, 40, 50, 60]) {
  const p = Model.defaultPersona({ lat, sunHours: 2, skinFrac: 0.25, skinType: 3 });
  const cells = [15, 79, 172, 265, 355].map((doy) => fmt(Model.dailySkinSynthesisUg(p, doy) * IU_PER_UG, 0));
  console.log([`${lat}`, ...cells].join('\t'));
}

console.log('\n=== Scenario E: Outdoor persona year at lat 60 N (high-latitude winter) ===');
const north = Model.defaultPersona({ ...Model.PRESETS.outdoor, lat: 60, name: 'Outdoor lat 60' });
const rn = Model.simulate(north, { startDoy: 1, days: 365 });
const sn = stats(rn);
console.log(`min ${fmt(sn.min)}  mean ${fmt(sn.mean)}  max ${fmt(sn.max)}  end ${fmt(sn.end)} ng/mL`);

console.log('\n=== Scenario F: decay check (no inputs, start 32 ng/mL) ===');
const rd = Model.simulate(Model.defaultPersona({ sunHours: 0, start25: 32 }), { startDoy: 1, days: 63 });
for (const d of [0, 21, 42, 63]) {
  const idx = rd.tHours.findIndex((t) => Math.abs(t - d * 24) < 1e-6);
  console.log(`day ${d}: ${fmt(rd.c25[idx])} ng/mL`);
}

console.log('\n=== Scenario G: weekly vs daily dosing (7000 IU once weekly vs 1000 IU daily, 180 days) ===');
for (const [label, supp] of [
  ['1000 IU daily', { type: 'daily', doseIU: 1000, hourOfDay: 8 }],
  ['7000 IU weekly', { type: 'weekly', doseIU: 7000, hourOfDay: 8 }]
]) {
  const r = Model.simulate(
    Model.defaultPersona({ sunHours: 0, start25: 20, supplement: supp }),
    { startDoy: 1, days: 180 }
  );
  const s = stats(r);
  console.log(`${label}: mean ${fmt(s.mean)}  end ${fmt(s.end)} ng/mL  (post-dose swing ${fmt(s.max - s.min)} ng/mL peak-to-trough over whole run)`);
}
