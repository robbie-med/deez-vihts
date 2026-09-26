/*
 * model.js - Mass-balanced compartmental Vitamin D model.
 *
 * Six state variables, all tracked in nmol (E is dimensionless):
 *   G      gut D3
 *   S_pre  cutaneous previtamin D3 reservoir
 *   D3_c   circulating D3
 *   C25_c  central (serum) 25(OH)D
 *   C25_p  peripheral 25(OH)D
 *   E      relative CYP24A1 activity
 *
 * Nonlinearities: saturable CYP2R1 25-hydroxylation (matters for large
 * boluses) and CYP24A1 induction (indirect response). Body size acts by
 * volumetric dilution (Drincic 2012). A measured starting 25(OH)D is treated
 * as a persistent individual trait, not a transient initial condition.
 */
(function (global) {
  'use strict';

  var Solar = (typeof module !== 'undefined' && typeof require !== 'undefined')
    ? require('./solar.js')
    : global.Solar;

  var PARAMS = {
    // Conversion factors
    IU_PER_UG: 40,
    NMOL_PER_UG: 2.5, // 1 ug = 2.5 nmol for D3 and 25OHD

    // Gut absorption
    KA: 0.1, // /h

    // Skin. UV dose is counted in minimal erythemal doses (MED). Previtamin D3
    // is formed from 7-DHC and photoconverted to inert lumisterol/tachysterol
    // at rates both proportional to UV dose, so the reservoir approaches a
    // plateau that is independent of UV intensity and pigmentation; darker
    // skin (higher MED) only takes longer to reach it (Clemens 1982).
    SED_PER_UVI_HOUR: 0.9, // 1 UVI = 25 mW/m2 erythemal = 0.9 SED/h
    MED_SED: [2.5, 3, 4, 5, 8, 15], // Fitzpatrick I-VI, in SED
    K_PD: 3.0, // /MED; reservoir is ~95% full after 1 MED
    S_EQ_NMOL: 1250, // whole-body plateau, young skin (~20,000 IU per 1 MED, Holick)
    K_ISO: 0.03, // /h lumped isomerization + transfer to blood (serum D3 peaks ~1 day post-UV)

    // D3 distribution and disposal (reference 75 kg adult)
    V_C_D3: 15.5, // L
    CL_D3: 10.0, // L/h non-25-hydroxylation disposal (sets ~1/6 conversion at low doses)

    // Saturable 25-hydroxylation (CYP2R1)
    VMAX_25: 100, // nmol/h
    KM_25: 50, // nmol/L

    // 25OHD distribution (L)
    V_C_25: 4.35,
    V_P_25: 6.87,
    Q_25: 0.0507, // L/h

    // 25OHD elimination: CYP24A1 indirect response + basal
    CL_OTHER: 0.0075, // L/h
    CL_CYP24_MAX: 0.0075, // L/h
    K_OUT: 0.020, // /h enzyme turnover (t1/2 ~35 h)
    H_MIN: 0.10,
    H_MAX: 1.00,
    EC_50: 55, // nmol/L (22 ng/mL)
    GAMMA: 2.5,

    // Body size: all volumes and clearances scale with body weight, so
    // steady-state concentrations scale as 1/weight and half-lives are unchanged.
    WEIGHT_REF: 75,

    // Individual response factor bounds (multiplier on the fraction of D3 that
    // is 25-hydroxylated). The upper bound is where non-hydroxylation disposal
    // would reach zero.
    RESPONSE_MIN: 0.02,
    RESPONSE_MAX: 5.5,
    EXPOSURE_MIN: 0,
    EXPOSURE_MAX: 20,

    // Interindividual variability band: low / high responders
    ENVELOPE_LOW: 0.8,
    ENVELOPE_HIGH: 1.25,

    BURN_IN_DAYS: 730
  };

  function skinTypeIndex(skinType) {
    return Math.max(1, Math.min(6, Math.round(skinType || 3))) - 1;
  }

  function ageScale(age) {
    return Math.max(0.25, 1 - 0.75 * ((age != null ? age : 40) - 20) / 50);
  }

  function doyAt(startDoy, dayIndex) {
    return ((((startDoy - 1 + dayIndex) % 365) + 365) % 365) + 1;
  }

  function defaultPersona(overrides) {
    var p = {
      name: 'Persona',
      weightKg: 75,
      lat: 40,
      sunHours: 2,
      skinFrac: 0.25,
      skinType: 3,
      dietIU: 400, // baseline dietary/fortification intake
      supplements: [{ type: 'none', doseIU: 1000, hourOfDay: 8, durationWeeks: 52 }],
      age: 40,
      envOpts: { cloudCover: 0, altitudeKm: 0, spf: 1 },
      starting25OHD: null, // measured level at the start date (ng/mL), optional
      fitMode: 'response' // how a measured level is explained: 'response' or 'exposure'
    };
    if (overrides) {
      for (var k in overrides) {
        if (k === 'supplements') {
          p.supplements = [];
          for (var i = 0; i < overrides.supplements.length; i++) {
            var s = { type: 'none', doseIU: 1000, hourOfDay: 8, durationWeeks: 52 };
            for (var sk in overrides.supplements[i]) s[sk] = overrides.supplements[i][sk];
            p.supplements.push(s);
          }
        } else if (k === 'envOpts') {
          for (var ek in overrides.envOpts) p.envOpts[ek] = overrides.envOpts[ek];
        } else {
          p[k] = overrides[k];
        }
      }
    }
    return p;
  }

  var PRESETS = {
    outdoor: {
      name: 'Outdoor', weightKg: 75, lat: 40,
      sunHours: 2, skinFrac: 0.25, skinType: 3,
      dietIU: 400, supplements: [{ type: 'none', doseIU: 1000, hourOfDay: 8, durationWeeks: 52 }]
    },
    obese: {
      name: 'Obese', weightKg: 120, lat: 40,
      sunHours: 2, skinFrac: 0.25, skinType: 3,
      dietIU: 400, supplements: [{ type: 'none', doseIU: 1000, hourOfDay: 8, durationWeeks: 52 }]
    },
    indoor: {
      name: 'Indoor', weightKg: 75, lat: 40,
      sunHours: 0, skinFrac: 0.25, skinType: 3,
      dietIU: 400, supplements: [{ type: 'none', doseIU: 1000, hourOfDay: 8, durationWeeks: 52 }]
    }
  };

  function doseEvents(persona, days) {
    var events = [];
    var supps = persona.supplements || [];
    if (supps.length === 0 && persona.supplement) {
      supps = [persona.supplement];
    }

    var currentDay = 0;
    var horizon = days * 24;

    for (var i = 0; i < supps.length; i++) {
      var s = supps[i];
      if (!s.type || s.type === 'none' || !(s.doseIU > 0)) {
        // A 'none' phase still occupies its duration in the schedule
        currentDay += s.durationWeeks ? s.durationWeeks * 7 : days;
        continue;
      }

      var step = s.type === 'weekly' ? 168 : 24;
      var t0 = currentDay * 24 + Math.min(Math.max(s.hourOfDay != null ? s.hourOfDay : 8, 0), 23.999);

      // The last phase without a duration runs to the end of the horizon
      var durationDays = (i === supps.length - 1 && !s.durationWeeks) ? days : (s.durationWeeks ? s.durationWeeks * 7 : days);
      var tEnd = Math.min((currentDay + durationDays) * 24, horizon);

      for (var t = t0; t < tEnd; t += step) {
        events.push({ tHours: t, iu: s.doseIU, nmol: (s.doseIU / PARAMS.IU_PER_UG) * PARAMS.NMOL_PER_UG });
      }

      currentDay += durationDays;
      if (currentDay * 24 >= horizon) break;
    }
    return events;
  }

  // Precompute the persona's rate constants.
  //   response: multiplier on the fraction of circulating D3 that is 25-hydroxylated
  //   exposure: multiplier on baseline diet and skin synthesis (not supplements)
  function kinetics(persona, response, exposure) {
    var w = (persona.weightKg || PARAMS.WEIGHT_REF) / PARAMS.WEIGHT_REF;
    var r = Math.max(PARAMS.RESPONSE_MIN, Math.min(PARAMS.RESPONSE_MAX, response != null ? response : 1));
    var e = exposure != null ? exposure : 1;

    // Linear-regime conversion fraction is k25 / (k25 + CL_D3); scale it by r
    // by adjusting the competing disposal pathway, which keeps mass balance.
    var k25 = PARAMS.VMAX_25 / PARAMS.KM_25;
    var fRef = k25 / (k25 + PARAMS.CL_D3);
    var clD3 = k25 * (1 / (r * fRef) - 1);

    var env = persona.envOpts || {};
    var spf = Math.max(1, env.spf || 1);
    var medSed = PARAMS.MED_SED[skinTypeIndex(persona.skinType)];

    return {
      w: w,
      response: r,
      exposure: e,
      dietRate: e * (persona.dietIU || 0) / PARAMS.IU_PER_UG * PARAMS.NMOL_PER_UG / 24,
      V_C_D3: PARAMS.V_C_D3 * w,
      CL_D3: clD3 * w,
      VMAX_25: PARAMS.VMAX_25 * w,
      V_C_25: PARAMS.V_C_25 * w,
      V_P_25: PARAMS.V_P_25 * w,
      Q_25: PARAMS.Q_25 * w,
      CL_OTHER: PARAMS.CL_OTHER * w,
      CL_CYP24_MAX: PARAMS.CL_CYP24_MAX * w,
      // Skin
      sunHours: persona.sunHours || 0,
      skinFrac: persona.skinFrac || 0,
      sEq: e * PARAMS.S_EQ_NMOL * (persona.skinFrac || 0) * ageScale(persona.age),
      medPerUviHour: PARAMS.SED_PER_UVI_HOUR / (medSed * spf),
      lat: persona.lat,
      env: env
    };
  }

  // UV drive on the skin over [hourSolar, hourSolar + dt), counting only the
  // part of the step inside the noon-centred sun window. Fills `out` with the
  // average dose rate m (MED/h) and the reachable plateau `target` (nmol).
  var drive = { m: 0, target: 0 };
  function skinDrive(k, doy, hourSolar, dt) {
    drive.m = 0;
    drive.target = 0;
    if (k.sunHours <= 0 || k.sEq <= 0) return drive;
    var half = k.sunHours / 2;
    var a = Math.max(hourSolar, 12 - half);
    var b = Math.min(hourSolar + dt, 12 + half);
    if (b <= a) return drive;
    var mid = (a + b) / 2;
    drive.m = Solar.uvIndex(k.lat, doy, mid, k.env) * k.medPerUviHour * (b - a) / dt;
    drive.target = k.sEq * Solar.previtaminFactor(k.lat, doy, mid);
    return drive;
  }

  function newState() {
    return { G: 0, S_pre: 0, D3_c: 0, C25_c: 0, C25_p: 0, E: PARAMS.H_MIN };
  }

  // Skin: dS/dt = K_PD*m*(target - S) - K_ISO*S, with m the UV dose rate
  // (MED/h), integrated exactly over the step (the photoreaction is too fast
  // for explicit Euler at dt = 1 h). Returns nmol delivered to blood.
  function skinStep(state, d, dt) {
    if (d.m <= 0 && state.S_pre <= 0) return 0;
    var a = PARAMS.K_PD * d.m;
    var lam = a + PARAMS.K_ISO;
    var sStar = a * d.target / lam;
    var decay = Math.exp(-lam * dt);
    var s0 = state.S_pre;
    state.S_pre = sStar + (s0 - sStar) * decay;
    return PARAMS.K_ISO * (sStar * dt + (s0 - sStar) * (1 - decay) / lam);
  }

  // Advance the state by dt hours. Returns nmol of skin D3 delivered to blood.
  function step(state, k, doy, hourSolar, dt) {
    // Diet
    state.G += k.dietRate * dt;
    var into_d3 = PARAMS.KA * state.G;
    state.G -= into_d3 * dt;

    var skinDelivered = skinStep(state, skinDrive(k, doy, hourSolar, dt), dt);

    // Circulating D3: 25-hydroxylation (saturable, linearized at the current
    // concentration) and competing disposal, integrated exactly over the step
    // because low response factors make this pathway fast.
    var c_d3 = state.D3_c / k.V_C_D3;
    var cl25 = k.VMAX_25 / (PARAMS.KM_25 + c_d3); // L/h
    var kel = (cl25 + k.CL_D3) / k.V_C_D3;
    var d3Decay = Math.exp(-kel * dt);
    var d3In = into_d3 * dt + skinDelivered;
    var d3New = state.D3_c * d3Decay + d3In * (1 - d3Decay) / (kel * dt);
    var v_25 = (state.D3_c + d3In - d3New) * cl25 / (cl25 + k.CL_D3) / dt;
    state.D3_c = d3New;

    // 25OHD distribution
    var c_25_c = state.C25_c / k.V_C_25;
    var c_25_p = state.C25_p / k.V_P_25;
    var c25_exchange = k.Q_25 * (c_25_c - c_25_p);

    // CYP24A1 induction
    var cg = Math.pow(c_25_c, PARAMS.GAMMA);
    var S_C = PARAMS.H_MIN + (PARAMS.H_MAX - PARAMS.H_MIN) * cg / (Math.pow(PARAMS.EC_50, PARAMS.GAMMA) + cg);
    state.E += PARAMS.K_OUT * (S_C - state.E) * dt;

    var elim = (k.CL_CYP24_MAX * state.E + k.CL_OTHER) * c_25_c;
    state.C25_c += (v_25 - c25_exchange - elim) * dt;
    state.C25_p += c25_exchange * dt;

    return skinDelivered;
  }

  function serumNgml(state, k) {
    return (state.C25_c / k.V_C_25) / PARAMS.NMOL_PER_UG;
  }

  // Run the persona's baseline lifestyle (diet + sun, no supplements) for two
  // years so the state ends on the periodic steady state at startDoy.
  function burnIn(k, startDoy) {
    var state = newState();
    var dt = 1.0;
    var steps = PARAMS.BURN_IN_DAYS * 24;
    for (var i = 0; i < steps; i++) {
      var dayIndex = Math.floor(i / 24);
      step(state, k, doyAt(startDoy, dayIndex - PARAMS.BURN_IN_DAYS), i - dayIndex * 24, dt);
    }
    return state;
  }

  // Find the individual factor that makes the persona's own lifestyle produce
  // the measured level at startDoy. Returns { state, k, fit }.
  function fitStartingLevel(persona, target, startDoy) {
    var mode = persona.fitMode === 'exposure' ? 'exposure' : 'response';
    var lo = mode === 'exposure' ? PARAMS.EXPOSURE_MIN : PARAMS.RESPONSE_MIN;
    var hi = mode === 'exposure' ? PARAMS.EXPOSURE_MAX : PARAMS.RESPONSE_MAX;
    function build(x) {
      return mode === 'exposure' ? kinetics(persona, 1, x) : kinetics(persona, x, 1);
    }

    // Steady-state level is close to proportional to either factor, so a
    // multiplicative fixed-point iteration converges in a few passes.
    var x = 1;
    var k = build(x);
    var state = burnIn(k, startDoy);
    var c = serumNgml(state, k);
    for (var iter = 0; iter < 12 && Math.abs(c - target) > 0.05; iter++) {
      if (!(c > 1e-6)) break; // lifestyle provides no input to scale
      var next = Math.max(lo, Math.min(hi, x * target / c));
      if (next === x) break; // pinned at a bound
      x = next;
      k = build(x);
      state = burnIn(k, startDoy);
      c = serumNgml(state, k);
    }

    // If the lifestyle cannot sustain the measured level even at the bound,
    // start from the measured level anyway and let the model move it.
    var limited = Math.abs(c - target) > 0.25;
    if (limited) {
      var c25c = target * PARAMS.NMOL_PER_UG;
      state.C25_c = c25c * k.V_C_25;
      state.C25_p = c25c * k.V_P_25;
      state.E = PARAMS.H_MIN + (PARAMS.H_MAX - PARAMS.H_MIN) * Math.pow(c25c, PARAMS.GAMMA) /
        (Math.pow(PARAMS.EC_50, PARAMS.GAMMA) + Math.pow(c25c, PARAMS.GAMMA));
    }
    return {
      state: state,
      k: k,
      fit: { mode: mode, factor: x, target: target, lifestyleLevel: c, limited: limited }
    };
  }

  function copyState(s) {
    return { G: s.G, S_pre: s.S_pre, D3_c: s.D3_c, C25_c: s.C25_c, C25_p: s.C25_p, E: s.E };
  }

  // Integrate forward from a given state. Returns sampled series.
  function integrate(persona, k, state, opts) {
    var days = opts.days;
    var startDoy = opts.startDoy;
    var dt = days <= 7 ? 0.1 : (days <= 30 ? 0.5 : 1.0);
    // Sample frequently enough to capture weekly dose peaks.
    var sampleEvery;
    if (days <= 1)        { sampleEvery = 5 / 60; }
    else if (days <= 7)   { sampleEvery = 0.5; }
    else if (days <= 31)  { sampleEvery = 4; }
    else if (days <= 366) { sampleEvery = 12; }
    else                  { sampleEvery = Math.max(24, Math.round(days / 180) * 24); }

    var events = doseEvents(persona, days);
    var nextDose = 0;
    var nSteps = Math.round(days * 24 / dt);
    var sampleEverySteps = Math.max(1, Math.round(sampleEvery / dt));

    // Also sample ~4 h after each dose (near the D3 peak) so peaks stay visible.
    var forced = {};
    if (days > 7) {
      for (var fi = 0; fi < events.length; fi++) {
        var ns = Math.round((events[fi].tHours + 4) / dt);
        if (ns >= 0 && ns <= nSteps) forced[ns] = true;
      }
    }

    var tHours = [], c25 = [], d3 = [], dailySkinUg = [];
    var currentDay = -1;
    var dailySkinTotal = 0;

    for (var i = 0; i <= nSteps; i++) {
      var t = i * dt;
      var dayIndex = Math.floor(t / 24 + 1e-9);

      if (dayIndex !== currentDay) {
        if (currentDay >= 0) dailySkinUg.push(dailySkinTotal / PARAMS.NMOL_PER_UG);
        currentDay = dayIndex;
        dailySkinTotal = 0;
      }

      while (nextDose < events.length && events[nextDose].tHours <= t + 1e-9) {
        state.G += events[nextDose].nmol;
        nextDose++;
      }

      if (i % sampleEverySteps === 0 || i === nSteps || forced[i]) {
        tHours.push(t);
        c25.push(serumNgml(state, k));
        d3.push((state.D3_c / k.V_C_D3) / PARAMS.NMOL_PER_UG);
      }
      if (i === nSteps) break;

      dailySkinTotal += step(state, k, doyAt(startDoy, dayIndex), t - dayIndex * 24, dt);
    }
    if (dailySkinUg.length < Math.ceil(days)) dailySkinUg.push(dailySkinTotal / PARAMS.NMOL_PER_UG);

    return { tHours: tHours, c25: c25, d3: d3, doses: events, dailySkinUg: dailySkinUg };
  }

  function simulate(persona, opts) {
    var o = { days: opts.days, startDoy: opts.startDoy != null ? opts.startDoy : 1 };
    var target = parseFloat(persona.starting25OHD);
    var hasTarget = !isNaN(target) && target > 0;

    var init, fit = null;
    if (hasTarget) {
      var f = fitStartingLevel(persona, target, o.startDoy);
      init = { k: f.k, state: f.state };
      fit = f.fit;
    } else {
      var k0 = kinetics(persona, 1, 1);
      init = { k: k0, state: burnIn(k0, o.startDoy) };
    }

    var main = integrate(persona, init.k, copyState(init.state), o);

    // Variability band: the same persona as a lower / higher responder. With a
    // measured start, the band starts at that level and fans out; without one,
    // each variant starts from its own steady state.
    var band = [PARAMS.ENVELOPE_LOW, PARAMS.ENVELOPE_HIGH].map(function (mult) {
      var kb = kinetics(persona, init.k.response * mult, init.k.exposure);
      var sb = hasTarget ? copyState(init.state) : burnIn(kb, o.startDoy);
      return integrate(persona, kb, sb, o).c25;
    });

    return {
      tHours: main.tHours,
      c25: main.c25,
      c25_low: band[0],
      c25_high: band[1],
      d3: main.d3,
      doses: main.doses.map(function (e) { return { tHours: e.tHours, iu: e.iu }; }),
      dailySkinUg: main.dailySkinUg,
      fit: fit
    };
  }

  // Daily skin D3 delivered to blood (ug/day) once repeated identical days on
  // `doy` have reached a steady state.
  function dailySkinSynthesisUg(persona, doy) {
    var k = kinetics(persona, 1, 1);
    var state = newState();
    var dt = 0.25;
    var total = 0;
    for (var day = 0; day < 10; day++) {
      total = 0;
      for (var h = 0; h < 24; h += dt) {
        total += skinStep(state, skinDrive(k, doy, h, dt), dt);
      }
    }
    return total / PARAMS.NMOL_PER_UG;
  }

  var Model = {
    PARAMS: PARAMS,
    PRESETS: PRESETS,
    defaultPersona: defaultPersona,
    simulate: simulate,
    dailySkinSynthesisUg: dailySkinSynthesisUg
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Model;
  }
  global.VitaminDModel = Model;
})(typeof window !== 'undefined' ? window : globalThis);
