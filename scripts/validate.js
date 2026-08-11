const Model = require('../js/model.js');

function runTest(name, persona, days) {
  const vp = { days: days, startDoy: 1 };
  const res = Model.simulate(persona, vp);
  const start = res.c25[0];
  const end = res.c25[res.c25.length - 1];
  console.log(`[${name}] Start: ${start.toFixed(1)} ng/mL, End: ${end.toFixed(1)} ng/mL, Delta: ${(end - start).toFixed(1)} ng/mL`);
  return end;
}

console.log("=== Validation Benchmarks ===");

// 1. Oral dose response: 1000 IU/day for 180 days, no sun, start 20 ng/mL
const normal = Model.defaultPersona({
  weightKg: 75,
  fatFrac: 0.20,
  sunHours: 0,
  skinFrac: 0,
  start25: 20,
  dietIU: 0,
  supplement: { type: 'daily', doseIU: 1000, hourOfDay: 8 }
});
runTest("1000 IU/d Normal (90d)", normal, 90);

// 2. Obesity attenuation: 1000 IU/day for 90 days, obese (120kg, 40% fat)
const obese = Model.defaultPersona({
  weightKg: 120,
  fatFrac: 0.40,
  sunHours: 0,
  skinFrac: 0,
  start25: 20,
  dietIU: 0,
  supplement: { type: 'daily', doseIU: 1000, hourOfDay: 8 }
});
runTest("1000 IU/d Obese (90d)", obese, 90);

// 3. Elimination Half-Life test (start 40 ng/mL, 0 input)
const decay = Model.defaultPersona({
  weightKg: 75,
  fatFrac: 0.20,
  sunHours: 0,
  skinFrac: 0,
  start25: 40,
  dietIU: 0,
  supplement: { type: 'none', doseIU: 0, hourOfDay: 8 }
});
runTest("Decay from 40  (21d)", decay, 21);
runTest("Decay from 40  (42d)", decay, 42);

// 4. Steady State Baseline with 400 IU/d diet
const baseline = Model.defaultPersona({
  weightKg: 75,
  fatFrac: 0.20,
  sunHours: 0,
  skinFrac: 0,
  start25: 20,
  dietIU: 400,
  supplement: { type: 'none', doseIU: 0, hourOfDay: 8 }
});
runTest("400 IU/d Maintenance", baseline, 180);

console.log("Done.");
