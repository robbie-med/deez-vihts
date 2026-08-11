/*
 * model.js - Comprehensive Mass-Balanced PBPK Vitamin D Model
 * 
 * Incorporates dual nonlinearity (Ocampo-Pelland 2016 + Sawyer 2022 / Pang Group).
 * 7 Compartment architecture, fully tracked in nmol.
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

    // Gut Absorption
    KA: 0.1, // /h
    BIOAVAIL: 1.0,

    // Skin (PreD3 -> D3)
    K_ISO: 0.03, // /h thermal isomerization (~23h half-life)
    K_PHOTO: 0.05, // /h photodegradation

    // D3 Distribution (Volumes in L, scaled to 75kg / 20% fat reference)
    V_C_D3: 15.5,
    V_P_D3_REF: 2333,
    Q_D3: 0.185, // Intercompartmental clearance L/h

    // 25OHD Distribution (Volumes in L)
    V_C_25: 4.35,
    V_P_25: 6.87,
    Q_25: 0.0507,

    // Metabolism: D3 -> 25OHD (Saturable CYP2R1)
    VMAX_25: 100, // nmol/h 
    KM_25: 50, // nmol/L

    // Metabolism: 25OHD Elimination (CYP24A1 Indirect Response + Baseline)
    CL_OTHER: 0.0075, // L/h (Non-CYP24A1 clearance, e.g. CYP3A4)
    CL_CYP24_MAX: 0.0075, // L/h (Maximal CYP24A1 clearance)
    K_OUT: 0.020, // Enzyme turnover /h (protein t1/2 ~35 h)
    H_MIN: 0.10, // Minimum relative CYP24A1 activity
    H_MAX: 1.00, // Maximum relative CYP24A1 activity
    EC_50: 55, // nmol/L (22 ng/mL) for half-max induction
    GAMMA: 2.5, // Steepness of induction curve
    
    // D3 Baseline clearance (fast, preventing 100% conversion to 25OHD)
    CL_D3: 10.0, // L/h

    // Reference values for scaling
    WEIGHT_REF: 75,
    FAT_FRAC_REF: 0.20,
    
    // Skin Synthesis rate max
    RMAX_NMOL_H: 500 * 2.5, // 500 ug/h = 1250 nmol/h peak synthesis
    SKIN_FACTORS: [1.0, 1.0, 0.85, 0.6, 0.4, 0.25]
  };

  function skinFactorForType(skinType) {
    var t = Math.max(1, Math.min(6, Math.round(skinType || 3)));
    return PARAMS.SKIN_FACTORS[t - 1];
  }

  function defaultPersona(overrides) {
    var p = {
      name: 'Persona',
      weightKg: 75,
      fatFrac: 0.20,
      lat: 40,
      sunHours: 2,
      skinFrac: 0.25,
      skinType: 3,
      dietIU: 400, // Baseline dietary/fortification intake
      supplement: { type: 'none', doseIU: 1000, hourOfDay: 8 },
      age: 40,
      envOpts: { cloudCover: 0, altitudeKm: 0, spf: 1 }
    };
    if (overrides) {
      for (var k in overrides) {
        if (k === 'supplement') {
          var s = p.supplement;
          for (var sk in overrides.supplement) s[sk] = overrides.supplement[sk];
          p.supplement = s;
        } else if (k === 'envOpts') {
          var e = p.envOpts;
          for (var ek in overrides.envOpts) e[ek] = overrides.envOpts[ek];
          p.envOpts = e;
        } else {
          p[k] = overrides[k];
        }
      }
    }
    return p;
  }

  var PRESETS = {
    outdoor: {
      name: 'Outdoor', weightKg: 75, fatFrac: 0.20, lat: 40,
      sunHours: 2, skinFrac: 0.25, skinType: 3,
      dietIU: 400, supplement: { type: 'none', doseIU: 1000, hourOfDay: 8 }
    },
    obese: {
      name: 'Obese', weightKg: 120, fatFrac: 0.40, lat: 40,
      sunHours: 2, skinFrac: 0.25, skinType: 3,
      dietIU: 400, supplement: { type: 'none', doseIU: 1000, hourOfDay: 8 }
    },
    indoor: {
      name: 'Indoor', weightKg: 75, fatFrac: 0.20, lat: 40,
      sunHours: 0, skinFrac: 0.25, skinType: 3,
      dietIU: 400, supplement: { type: 'none', doseIU: 1000, hourOfDay: 8 }
    }
  };

  function doseEvents(persona, days) {
    var supp = persona.supplement || { type: 'none' };
    var events = [];
    if (!supp.type || supp.type === 'none' || !(supp.doseIU > 0)) return events;
    var step = supp.type === 'weekly' ? 168 : 24;
    var t0 = Math.min(Math.max(supp.hourOfDay != null ? supp.hourOfDay : 8, 0), 23.999);
    var horizon = days * 24;
    for (var t = t0; t < horizon; t += step) {
      events.push({ tHours: t, iu: supp.doseIU, nmol: (supp.doseIU / PARAMS.IU_PER_UG) * PARAMS.NMOL_PER_UG });
    }
    return events;
  }

  // Generate clear-sky UV index synthesis potential
  function getSynthesisRateNmol(persona, doy, hourSolar) {
    if (persona.sunHours <= 0 || persona.skinFrac <= 0) return 0;
    var sunHalf = persona.sunHours / 2;
    if (hourSolar < 12 - sunHalf || hourSolar > 12 + sunHalf) return 0;

    var sf = skinFactorForType(persona.skinType);
    var ageScale = Math.max(0.25, 1 - 0.75 * ((persona.age || 40) - 20) / 50);
    
    // Use the updated Solar module which provides Clear-Sky UVI
    var uvi = Solar.uvIndex(persona.lat, doy, hourSolar, persona.envOpts);
    
    // Scale synthesis. Max UVI ~ 12 gives max synthesis
    var synthFactor = Math.max(0, Math.min(1, uvi / 12));
    
    return PARAMS.RMAX_NMOL_H * persona.skinFrac * sf * synthFactor * ageScale;
  }

  // Pre-run the model for 2 years to reach physiological steady state for the persona's baseline diet/sun
  function burnIn(persona, state) {
    var dt = 1.0;
    var days = 365 * 2;
    var steps = days * 24;
    var diet_nmol_h = (persona.dietIU / PARAMS.IU_PER_UG) * PARAMS.NMOL_PER_UG / 24;

    var fatRatio = (persona.weightKg * persona.fatFrac) / (PARAMS.WEIGHT_REF * PARAMS.FAT_FRAC_REF);
    var V_p_d3 = PARAMS.V_P_D3_REF * fatRatio;

    for (var i = 0; i < steps; i++) {
      var t = i * dt;
      var dayIndex = Math.floor(t / 24);
      var doy = (dayIndex % 365) + 1;
      var hourSolar = t - dayIndex * 24;

      // Diet
      state.G += diet_nmol_h * dt;

      var abs = PARAMS.KA * state.G;
      var into_d3 = abs * PARAMS.BIOAVAIL;
      state.G -= abs * dt;

      // Sun
      var synth = getSynthesisRateNmol(persona, doy, hourSolar);
      var photo_deg = PARAMS.K_PHOTO * state.S_pre * (synth > 0 ? 1 : 0);
      var skin_to_d3 = PARAMS.K_ISO * state.S_pre;
      state.S_pre += (synth - skin_to_d3 - photo_deg) * dt;

      // D3 Distribution
      var c_d3_c = state.D3_c / PARAMS.V_C_D3;
      var c_d3_p = state.D3_p / V_p_d3;
      var d3_exchange = PARAMS.Q_D3 * (c_d3_c - c_d3_p);
      
      // 25-hydroxylation and D3 clearance
      var v_25 = PARAMS.VMAX_25 * c_d3_c / (PARAMS.KM_25 + c_d3_c);
      var cl_d3_elim = PARAMS.CL_D3 * c_d3_c;

      state.D3_c += (into_d3 + skin_to_d3 - d3_exchange - v_25 - cl_d3_elim) * dt;
      state.D3_p += d3_exchange * dt;

      // 25OHD Distribution
      var c_25_c = state.C25_c / PARAMS.V_C_25;
      var c_25_p = state.C25_p / PARAMS.V_P_25;
      var c25_exchange = PARAMS.Q_25 * (c_25_c - c_25_p);

      // CYP24A1 Induction
      var S_C = PARAMS.H_MIN + (PARAMS.H_MAX - PARAMS.H_MIN) * Math.pow(c_25_c, PARAMS.GAMMA) / (Math.pow(PARAMS.EC_50, PARAMS.GAMMA) + Math.pow(c_25_c, PARAMS.GAMMA));
      var dE = PARAMS.K_OUT * (S_C - state.E);
      state.E += dE * dt;

      // Elimination
      var elim = (PARAMS.CL_CYP24_MAX * state.E + PARAMS.CL_OTHER) * c_25_c;

      state.C25_c += (v_25 - c25_exchange - elim) * dt;
      state.C25_p += c25_exchange * dt;
    }
  }

  function simulate(persona, opts) {
    var days = opts.days;
    var startDoy = opts.startDoy != null ? opts.startDoy : 1;
    var dt = days <= 7 ? 0.1 : 0.5;                 
    var sampleEvery = days <= 1 ? 5 / 60 : (days <= 7 ? 0.5 : 24); 
    if (days > 365) {
      sampleEvery = Math.max(24, Math.round(days / 180) * 24); 
    }

    // State (nmol)
    var state = {
      G: 0,
      S_pre: 0,
      D3_c: 0,
      D3_p: 0,
      C25_c: 0,
      C25_p: 0,
      E: 1.0
    };

    // Initialize to physiological steady state based on lifestyle
    burnIn(persona, state);

    var diet_nmol_h = (persona.dietIU / PARAMS.IU_PER_UG) * PARAMS.NMOL_PER_UG / 24;
    var fatRatio = (persona.weightKg * persona.fatFrac) / (PARAMS.WEIGHT_REF * PARAMS.FAT_FRAC_REF);
    var V_p_d3 = PARAMS.V_P_D3_REF * fatRatio;

    var events = doseEvents(persona, days);
    var nextDose = 0;

    var nSteps = Math.round(days * 24 / dt);
    var sampleEverySteps = Math.max(1, Math.round(sampleEvery / dt));

    var tHours = [], c25 = [], d3 = [], dailySkinUg = [];
    var currentDay = -1;
    var dailySkinTotal = 0;

    // Optional bounds arrays for uncertainty
    var c25_low = [];
    var c25_high = [];

    // Pre-calculate responder modifiers
    var lowResponderScale = 1.25; // Higher clearance -> lower levels
    var highResponderScale = 0.8; // Lower clearance -> higher levels

    for (var i = 0; i <= nSteps; i++) {
      var t = i * dt;
      var dayIndex = Math.floor(t / 24);
      
      if (dayIndex !== currentDay) {
        if (currentDay >= 0) dailySkinUg.push(dailySkinTotal / PARAMS.NMOL_PER_UG); // back to ug
        currentDay = dayIndex;
        dailySkinTotal = 0;
      }
      
      var doy = ((startDoy - 1 + dayIndex) % 365) + 1;
      var hourSolar = t - dayIndex * 24; 

      while (nextDose < events.length && events[nextDose].tHours <= t + 1e-9) {
        state.G += events[nextDose].nmol;
        nextDose++;
      }

      if (i % sampleEverySteps === 0 || i === nSteps) {
        tHours.push(t);
        var c25_ngml = (state.C25_c / PARAMS.V_C_25) / PARAMS.NMOL_PER_UG;
        c25.push(c25_ngml);
        d3.push((state.D3_c / PARAMS.V_C_D3) / PARAMS.NMOL_PER_UG);

        // Approximate uncertainty envelope (steady-state proportional shift)
        // In a true model, we would simulate 3 full states, but this is an O(1) approximation for UI
        c25_low.push(c25_ngml / lowResponderScale);
        c25_high.push(c25_ngml / highResponderScale);
      }
      
      if (i === nSteps) break;

      // Diet
      state.G += diet_nmol_h * dt;
      var abs = PARAMS.KA * state.G;
      var into_d3 = abs * PARAMS.BIOAVAIL;
      state.G -= abs * dt;

      // Sun
      var synth = getSynthesisRateNmol(persona, doy, hourSolar);
      var photo_deg = PARAMS.K_PHOTO * state.S_pre * (synth > 0 ? 1 : 0);
      var skin_to_d3 = PARAMS.K_ISO * state.S_pre;
      dailySkinTotal += skin_to_d3 * dt;
      state.S_pre += (synth - skin_to_d3 - photo_deg) * dt;

      // D3 Distribution
      var c_d3_c = state.D3_c / PARAMS.V_C_D3;
      var c_d3_p = state.D3_p / V_p_d3;
      var d3_exchange = PARAMS.Q_D3 * (c_d3_c - c_d3_p);
      
      var v_25 = PARAMS.VMAX_25 * c_d3_c / (PARAMS.KM_25 + c_d3_c);
      var cl_d3_elim = PARAMS.CL_D3 * c_d3_c;

      state.D3_c += (into_d3 + skin_to_d3 - d3_exchange - v_25 - cl_d3_elim) * dt;
      state.D3_p += d3_exchange * dt;

      // 25OHD Distribution
      var c_25_c = state.C25_c / PARAMS.V_C_25;
      var c_25_p = state.C25_p / PARAMS.V_P_25;
      var c25_exchange = PARAMS.Q_25 * (c_25_c - c_25_p);

      // CYP24A1 Induction
      var S_C = PARAMS.H_MIN + (PARAMS.H_MAX - PARAMS.H_MIN) * Math.pow(c_25_c, PARAMS.GAMMA) / (Math.pow(PARAMS.EC_50, PARAMS.GAMMA) + Math.pow(c_25_c, PARAMS.GAMMA));
      var dE = PARAMS.K_OUT * (S_C - state.E);
      state.E += dE * dt;

      // Elimination
      var elim = (PARAMS.CL_CYP24_MAX * state.E + PARAMS.CL_OTHER) * c_25_c;

      state.C25_c += (v_25 - c25_exchange - elim) * dt;
      state.C25_p += c25_exchange * dt;
    }
    
    dailySkinUg.push(dailySkinTotal / PARAMS.NMOL_PER_UG);

    return {
      tHours: tHours,
      c25: c25,
      c25_low: c25_low,
      c25_high: c25_high,
      d3: d3,
      doses: events.map(function (e) { return { tHours: e.tHours, iu: e.iu }; }),
      dailySkinUg: dailySkinUg
    };
  }

  var Model = {
    PARAMS: PARAMS,
    PRESETS: PRESETS,
    defaultPersona: defaultPersona,
    skinFactorForType: skinFactorForType,
    simulate: simulate
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Model;
  }
  global.VitaminDModel = Model;
})(typeof window !== 'undefined' ? window : globalThis);
