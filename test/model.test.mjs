import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Model = require('../js/model.js');
const Solar = require('../js/solar.js');

const IU_PER_UG = 40;

function last(arr) {
  return arr[arr.length - 1];
}

// --- Calibration target 1 -------------------------------------------------
// Normal persona (75 kg, 20% fat), 1000 IU/day orally for 180 days starting
// at 20 ng/mL: serum 25(OH)D should rise by roughly 8-12 ng/mL.
test('1000 IU/day for 180 days raises 25(OH)D by 8-12 ng/mL', () => {
  const p = Model.defaultPersona({
    sunHours: 0,
    start25: 20,
    supplement: { type: 'daily', doseIU: 1000, hourOfDay: 8 }
  });
  const r = Model.simulate(p, { startDoy: 1, days: 180 });
  const rise = last(r.c25) - 20;
  assert.ok(rise >= 8 && rise <= 12, `rise was ${rise.toFixed(2)} ng/mL`);
});

// --- Calibration target 2 -------------------------------------------------
// Obese persona (120 kg, 40% fat), same dose: the dose-attributable rise
// (end level minus an unsupplemented control run) should be roughly half of
// the normal persona's (cf. Wortsman 2000, ~50% attenuation in obesity).
test('obese persona responds with roughly half the rise of the normal persona', () => {
  function endWith(persona, dosed) {
    const p = Model.defaultPersona({
      ...persona,
      sunHours: 0,
      start25: 20,
      supplement: dosed
        ? { type: 'daily', doseIU: 1000, hourOfDay: 8 }
        : { type: 'none' }
    });
    return last(Model.simulate(p, { startDoy: 1, days: 180 }).c25);
  }
  const normal = { weightKg: 75, fatFrac: 0.20 };
  const obese = { weightKg: 120, fatFrac: 0.40 };
  const riseNormal = endWith(normal, true) - endWith(normal, false);
  const riseObese = endWith(obese, true) - endWith(obese, false);
  const ratio = riseObese / riseNormal;
  assert.ok(ratio >= 0.35 && ratio <= 0.65, `ratio was ${ratio.toFixed(2)} (${riseObese.toFixed(2)} vs ${riseNormal.toFixed(2)})`);
});

// --- Calibration target 3 -------------------------------------------------
// With no inputs, 25(OH)D must decay with a ~3-week half-life.
test('no inputs: 25(OH)D decays with ~21 day half-life', () => {
  const p = Model.defaultPersona({ sunHours: 0, start25: 32 });
  const r = Model.simulate(p, { startDoy: 1, days: 42 });
  // After exactly 21 days (504 h) the level should have halved.
  const idx = r.tHours.findIndex((t) => Math.abs(t - 21 * 24) < 1e-6);
  assert.ok(idx >= 0, 'no sample at t = 21 days');
  const expected = 16;
  assert.ok(Math.abs(r.c25[idx] - expected) < 0.75, `c25 at day 21 was ${r.c25[idx].toFixed(2)}`);
  assert.ok(last(r.c25) < 9, `c25 at day 42 was ${last(r.c25).toFixed(2)}`);
});

// --- Calibration target 4 -------------------------------------------------
// Vitamin D winter: at lat 60 in January, daily skin synthesis ~ 0; and the
// equator at June noon gets more effective UVB than lat 60 at June noon.
test('vitamin D winter at lat 60 in January; equator June noon beats lat 60 June noon', () => {
  const p = Model.defaultPersona({ lat: 60, sunHours: 4, skinFrac: 0.25, skinType: 1 });
  const janUg = Model.dailySkinSynthesisUg(p, 15); // mid-January
  const janIU = janUg * IU_PER_UG;
  assert.ok(janIU < 200, `lat 60 January synthesis was ${janIU.toFixed(0)} IU/day`);

  const pSummer = Model.defaultPersona({ lat: 35, sunHours: 2, skinFrac: 0.25, skinType: 3 });
  const junUg = Model.dailySkinSynthesisUg(pSummer, 172);
  assert.ok(janUg < 0.05 * junUg, `lat 60 Jan (${janUg.toFixed(1)} ug) not negligible vs lat 35 Jun (${junUg.toFixed(1)} ug)`);

  const eqJune = Solar.uvbFactor(0, 172, 12);
  const northJune = Solar.uvbFactor(60, 172, 12);
  assert.ok(eqJune > northJune, `equator June noon uvb ${eqJune.toFixed(3)} <= lat60 ${northJune.toFixed(3)}`);
});

// --- Behavioural checks ---------------------------------------------------

test('more sun hours leads to higher 25(OH)D', () => {
  const base = { lat: 40, skinFrac: 0.25, skinType: 3, start25: 25, supplement: { type: 'none' } };
  const less = Model.simulate(Model.defaultPersona({ ...base, sunHours: 1 }), { startDoy: 172, days: 60 });
  const more = Model.simulate(Model.defaultPersona({ ...base, sunHours: 3 }), { startDoy: 172, days: 60 });
  assert.ok(last(more.c25) > last(less.c25), `3h end ${last(more.c25).toFixed(1)} <= 1h end ${last(less.c25).toFixed(1)}`);
});

test('indoor, no-supplement winter persona declines', () => {
  const p = Model.defaultPersona({ lat: 55, sunHours: 0, start25: 30, supplement: { type: 'none' } });
  const r = Model.simulate(p, { startDoy: 1, days: 90 });
  assert.ok(last(r.c25) < 30 - 1, `end was ${last(r.c25).toFixed(2)}`);
  assert.ok(last(r.c25) < 30 * Math.pow(0.5, 90 / 21) * 1.05 + 0.5, 'declines faster than pure decay plus slack');
});

test('2 h midday summer sun at lat 35 gives ~3000-6000 IU/day (type III, 25% skin)', () => {
  const p = Model.defaultPersona({ lat: 35, sunHours: 2, skinFrac: 0.25, skinType: 3 });
  const iu = Model.dailySkinSynthesisUg(p, 172) * IU_PER_UG;
  // Spec target: "on the order of 3,000-6,000 IU/day"; allow 10% headroom.
  assert.ok(iu >= 3000 && iu <= 6600, `summer synthesis was ${iu.toFixed(0)} IU/day`);
});

test('no NaN or negative values over a simulated year for all presets', () => {
  for (const key of Object.keys(Model.PRESETS)) {
    const p = Model.defaultPersona(Model.PRESETS[key]);
    const r = Model.simulate(p, { startDoy: 1, days: 365 });
    for (const series of [r.c25, r.d3, r.calcitriol]) {
      for (const v of series) {
        assert.ok(Number.isFinite(v), `${key}: non-finite value ${v}`);
        assert.ok(v >= 0, `${key}: negative value ${v}`);
      }
    }
    assert.ok(r.tHours.length >= 365, `${key}: expected daily samples, got ${r.tHours.length}`);
  }
});

// --- Solar module sanity checks ------------------------------------------

test('uvb factor is 1.0 at the normalization condition and 0 below horizon', () => {
  const noon = Solar.uvbFactor(35, 172, 12);
  assert.ok(Math.abs(noon - 1) < 1e-9, `normalization uvb was ${noon}`);
  assert.equal(Solar.uvbFactor(35, 172, 0), 0); // midnight
  assert.equal(Solar.uvbFactor(80, 355, 12), 0); // polar night
});

test('solar noon elevation: ~78.4 deg at lat 35 on June 21', () => {
  const el = Solar.elevationDeg(35, 172, 12);
  assert.ok(Math.abs(el - (90 - Math.abs(35 - 23.44))) < 0.5, `elevation was ${el.toFixed(2)}`);
});
