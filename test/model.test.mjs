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

function run(overrides, days, startDoy = 1) {
  return Model.simulate(Model.defaultPersona(overrides), { days, startDoy });
}

function daily(doseIU, weeks = 104) {
  return [{ type: 'daily', doseIU, hourOfDay: 8, durationWeeks: weeks }];
}

function skinIU(overrides, doy) {
  return Model.dailySkinSynthesisUg(Model.defaultPersona(overrides), doy) * IU_PER_UG;
}

// --- Calibration ------------------------------------------------------------

// Heaney 2003: ~1 ng/mL per 100 IU/day. From a ~20-30 ng/mL baseline, 1000 IU/day
// for 180 days should add roughly 8-12 ng/mL over an unsupplemented control.
test('1000 IU/day for 180 days adds 8-12 ng/mL over control', () => {
  const base = { sunHours: 0, dietIU: 1500 };
  const control = last(run(base, 180).c25);
  const dosed = last(run({ ...base, supplements: daily(1000) }, 180).c25);
  const rise = dosed - control;
  assert.ok(control > 18 && control < 30, `control was ${control.toFixed(1)}`);
  assert.ok(rise >= 8 && rise <= 12, `rise was ${rise.toFixed(2)} ng/mL`);
});

// Drincic 2012: volumetric dilution, ~1/weight (75/120 = 0.63), moderated here
// by lower CYP24A1 induction at the lower concentration.
test('120 kg persona responds with 55-80% of the 75 kg rise', () => {
  function rise(weightKg) {
    const base = { weightKg, sunHours: 0 };
    return last(run({ ...base, supplements: daily(1000) }, 180).c25) - last(run(base, 180).c25);
  }
  const ratio = rise(120) / rise(75);
  assert.ok(ratio >= 0.55 && ratio <= 0.8, `ratio was ${ratio.toFixed(2)}`);
});

test('no inputs: 25(OH)D half-life is ~3-4 weeks', () => {
  const r = run({ sunHours: 0, dietIU: 0, starting25OHD: 32 }, 90);
  assert.equal(r.c25[0], 32);
  const idx = r.c25.findIndex((v) => v <= 16);
  const halfLifeDays = r.tHours[idx] / 24;
  assert.ok(halfLifeDays >= 18 && halfLifeDays <= 30, `half-life was ${halfLifeDays.toFixed(1)} days`);
  assert.ok(r.fit.limited, 'zero-input persona should be flagged as unable to sustain the level');
});

// --- Measured starting level --------------------------------------------------

test('a profoundly low starter stays low without supplements', () => {
  for (const fitMode of ['response', 'exposure']) {
    const r = run({ starting25OHD: 5, fitMode }, 730);
    assert.ok(Math.abs(r.c25[0] - 5) < 0.3, `${fitMode}: start was ${r.c25[0].toFixed(2)}`);
    const max = Math.max(...r.c25);
    assert.ok(max < 15, `${fitMode}: peaked at ${max.toFixed(1)} ng/mL`);
    assert.ok(Math.abs(last(r.c25) - 5) < 1, `${fitMode}: ended at ${last(r.c25).toFixed(1)}`);
    assert.ok(!r.fit.limited && r.fit.factor < 1);
  }
});

test('fit mode decides how a low starter responds to supplements', () => {
  const supp = { starting25OHD: 5, supplements: daily(4000) };
  const poorResponder = last(run({ ...supp, fitMode: 'response' }, 180).c25);
  const lowExposure = last(run({ ...supp, fitMode: 'exposure' }, 180).c25);
  assert.ok(lowExposure > 40, `exposure mode reached ${lowExposure.toFixed(1)}`);
  assert.ok(poorResponder < 0.7 * lowExposure, `response mode ${poorResponder.toFixed(1)} vs ${lowExposure.toFixed(1)}`);
});

test('a measured level equal to the lifestyle level fits a factor of ~1, at any season', () => {
  for (const doy of [15, 172]) {
    const own = run({}, 1, doy).c25[0];
    const r = run({ starting25OHD: own }, 1, doy);
    assert.ok(Math.abs(r.fit.factor - 1) < 0.02, `doy ${doy}: factor ${r.fit.factor.toFixed(3)}`);
  }
});

test('a level the inputs cannot sustain starts at the measurement and drifts', () => {
  const r = run({ sunHours: 0, starting25OHD: 60 }, 180);
  assert.ok(r.fit.limited);
  assert.equal(r.c25[0], 60);
  assert.ok(last(r.c25) < 40, `ended at ${last(r.c25).toFixed(1)}`);
});

// --- Skin synthesis -------------------------------------------------------------

test('vitamin D winter: negligible synthesis at high latitude in January', () => {
  const lat60 = skinIU({ lat: 60, sunHours: 4, skinType: 1 }, 15);
  assert.ok(lat60 < 50, `lat 60 January: ${lat60.toFixed(0)} IU/day`);
  const jan = skinIU({ lat: 42 }, 15);
  const jun = skinIU({ lat: 42 }, 172);
  assert.ok(jan < 0.1 * jun, `lat 42 Jan ${jan.toFixed(0)} vs Jun ${jun.toFixed(0)} IU/day`);
});

test('summer synthesis plateaus: 4 h adds little over 30 min', () => {
  const short = skinIU({ lat: 35, sunHours: 0.5 }, 172);
  const long = skinIU({ lat: 35, sunHours: 4 }, 172);
  assert.ok(short > 1000 && long < 3000, `30 min ${short.toFixed(0)}, 4 h ${long.toFixed(0)} IU/day`);
  assert.ok(long < 1.2 * short, `4 h (${long.toFixed(0)}) vs 30 min (${short.toFixed(0)})`);
});

test('darker skin needs longer exposure but reaches the same plateau', () => {
  const brief = (skinType) => skinIU({ lat: 40, sunHours: 0.25, skinType }, 172);
  const long = (skinType) => skinIU({ lat: 40, sunHours: 3, skinType }, 172);
  assert.ok(brief(6) < 0.6 * brief(1), `15 min: VI ${brief(6).toFixed(0)} vs I ${brief(1).toFixed(0)}`);
  assert.ok(long(6) > 0.9 * long(1), `3 h: VI ${long(6).toFixed(0)} vs I ${long(1).toFixed(0)}`);
});

test('sunscreen reduces synthesis', () => {
  const bare = skinIU({ sunHours: 0.5 }, 172);
  const spf30 = skinIU({ sunHours: 0.5, envOpts: { spf: 30 } }, 172);
  assert.ok(spf30 < 0.25 * bare, `SPF 30 ${spf30.toFixed(0)} vs bare ${bare.toFixed(0)} IU/day`);
});

test('outdoor persona has a seasonal cycle peaking in late summer', () => {
  const r = run({}, 365);
  const max = Math.max(...r.c25);
  const peakDay = r.tHours[r.c25.indexOf(max)] / 24;
  assert.ok(max - Math.min(...r.c25) > 10, 'expected a clear seasonal swing');
  assert.ok(peakDay > 180 && peakDay < 270, `peak on day ${peakDay.toFixed(0)}`);
});

// --- Robustness ---------------------------------------------------------------

test('no NaN or negative values, and band brackets the curve', () => {
  const cases = Object.keys(Model.PRESETS).map((k) => Model.PRESETS[k]);
  cases.push({ starting25OHD: 1 }, { starting25OHD: 150 }, { starting25OHD: 3, fitMode: 'exposure' },
    { starting25OHD: 2, supplements: [{ type: 'weekly', doseIU: 50000, hourOfDay: 8, durationWeeks: 8 }] });
  for (const c of cases) {
    const r = run(c, 365);
    for (const series of [r.c25, r.c25_low, r.c25_high, r.d3]) {
      for (const v of series) assert.ok(Number.isFinite(v) && v >= 0, `${JSON.stringify(c)}: bad value ${v}`);
    }
    for (let i = 0; i < r.c25.length; i++) {
      assert.ok(r.c25_low[i] <= r.c25[i] + 1e-9 && r.c25[i] <= r.c25_high[i] + 1e-9, `${JSON.stringify(c)}: band inverted at ${i}`);
    }
    assert.ok(r.tHours.length >= 365);
  }
});

test('with a measured start, the band starts at the measurement', () => {
  const r = run({ starting25OHD: 12 }, 90);
  assert.equal(r.c25_low[0], r.c25[0]);
  assert.equal(r.c25_high[0], r.c25[0]);
});

// --- Solar module ----------------------------------------------------------------

test('solar noon elevation: ~78.4 deg at lat 35 on June 21', () => {
  const el = Solar.elevationDeg(35, 172, 12);
  assert.ok(Math.abs(el - (90 - Math.abs(35 - 23.44))) < 0.5, `elevation was ${el.toFixed(2)}`);
});

test('UV index is zero at night and in polar night; plateau factor is 1 under high sun', () => {
  assert.equal(Solar.uvIndex(35, 172, 0), 0);
  assert.equal(Solar.uvIndex(80, 355, 12), 0);
  assert.equal(Solar.previtaminFactor(80, 355, 12), 0);
  assert.equal(Solar.previtaminFactor(20, 172, 12), 1);
  const uvi = Solar.uvIndex(0, 80, 12);
  assert.ok(uvi > 10 && uvi < 14, `equinox equator noon UVI ${uvi.toFixed(1)}`);
});
