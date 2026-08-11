/*
 * model.js - PBPK-lite Vitamin D pharmacokinetic model.
 *
 * Pure logic, no DOM. Dual export: attaches to `window.VitaminDModel` in the
 * browser and to `module.exports` under Node.
 */
(function (global) {
  'use strict';

  var Solar = (typeof module !== 'undefined' && typeof require !== 'undefined')
    ? require('./solar.js')
    : global.Solar;

  var PARAMS = {
    KA: 0.25,              // gut absorption rate constant, /h
    BIOAVAIL: 1.0,         // oral bioavailability into blood D3
    
    // Adipose partition
    KP_FAT: 1.0,           // partition coefficient (adipose : blood)
    Q_FAT_FRAC: 0.05,      // fraction of cardiac output to fat
    CARDIAC_OUT_L_H: 300,  // 5 L/min * 60 = 300 L/h
    
    // 25-hydroxylation (MM)
    VMAX25: 3.4,           // ng/mL/h of 25OHD max production
    KM25: 15,              // ng/mL D3 for half-max
    
    // CYP24A1 (Elimination & Induction)
    KE_IN: 0.02,           // /h
    KE_OUT: 0.02,          // /h
    KELIM0: 0.00055,       // basal elim rate /h (ln(2)/(21*24))
    IND_MAX: 5,            // max fold induction
    
    // Calcitriol
    VMAX1A: 5,             // pg/mL/h
    KM1A: 40,              // ng/mL 25OHD
    K_ELIM1: 0.07,         // half-life ~ 10h
    
    // Previtamin D3 & Skin
    K_CONV: 0.08,          // to D3 ~ 8h half-life
    K_PHOTO: 0.1,          // photodegradation by UV
    RMAX_UG_H: 500,        // peak full-body skin synthesis rate, ug/h (20,000 IU/h)
    
    IU_PER_UG: 40,
    FAT_REF_KG: 15,
    SKIN_FACTORS: [1.0, 1.0, 0.85, 0.6, 0.4, 0.25],
    BLOOD_FRAC: 0.075      // blood volume as a fraction of body weight, L/kg
  };

  // Kept for UI compatibility, though actual elimination is dynamic
  var KELIM = PARAMS.KELIM0;

  function skinFactorForType(skinType) {
    var t = Math.max(1, Math.min(6, Math.round(skinType || 3)));
    return PARAMS.SKIN_FACTORS[t - 1];
  }

  // Effective distribution volume (L) for 25(OH)D.
  function distributionVolumeL(weightKg, fatFrac) {
    return 0.25 * weightKg * (1 + 1.5 * fatFrac);
  }

  // Blood volume (L)
  function bloodVolumeL(weightKg) {
    return PARAMS.BLOOD_FRAC * weightKg;
  }

  function defaultPersona(overrides) {
    var p = {
      name: 'Persona',
      weightKg: 75,
      fatFrac: 0.20,
      lat: 40,                // degrees, negative = southern hemisphere
      sunHours: 2,            // h/day, window centered on solar noon
      skinFrac: 0.25,         // fraction of skin surface exposed
      skinType: 3,            // Fitzpatrick I..VI
      supplement: { type: 'none', doseIU: 1000, hourOfDay: 8 }, // none|daily|weekly
      start25: 25,            // initial serum 25(OH)D, ng/mL
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
      supplement: { type: 'none', doseIU: 1000, hourOfDay: 8 }, start25: 25
    },
    obese: {
      name: 'Obese, same sun', weightKg: 120, fatFrac: 0.40, lat: 40,
      sunHours: 2, skinFrac: 0.25, skinType: 3,
      supplement: { type: 'none', doseIU: 1000, hourOfDay: 8 }, start25: 25
    },
    indoor: {
      name: 'Indoor', weightKg: 75, fatFrac: 0.20, lat: 40,
      sunHours: 0, skinFrac: 0.25, skinType: 3,
      supplement: { type: 'none', doseIU: 1000, hourOfDay: 8 }, start25: 25
    }
  };

  function calcitriolPgMl(c25) {
    // Dynamic now, but we keep this stub just in case UI relies on it outside simulate
    var pthIndex = 1 + Math.max(0, (30 - c25) / 30);
    var v = 45 * pthIndex * c25 / (c25 + 15);
    return Math.max(10, Math.min(80, v));
  }

  function doseEvents(persona, days) {
    var supp = persona.supplement || { type: 'none' };
    var events = [];
    if (!supp.type || supp.type === 'none' || !(supp.doseIU > 0)) return events;
    var step = supp.type === 'weekly' ? 168 : 24;
    var t0 = Math.min(Math.max(supp.hourOfDay != null ? supp.hourOfDay : 8, 0), 23.999);
    var horizon = days * 24;
    for (var t = t0; t < horizon; t += step) {
      events.push({ tHours: t, iu: supp.doseIU, ug: supp.doseIU / PARAMS.IU_PER_UG });
    }
    return events;
  }

  // Exposed for tests
  function dailySkinSynthesisUg(persona, doy) {
    if (persona.sunHours <= 0 || persona.skinFrac <= 0) return 0;
    var dt = 5 / 60;
    var half = persona.sunHours / 2;
    var sf = skinFactorForType(persona.skinType);
    var ageScale = Math.max(0.25, 1 - 0.75 * ((persona.age || 40) - 20) / 50);
    
    var total = 0;
    var Prev = 0;
    
    for (var h = 12 - half; h < 12 + half; h += dt) {
      var uvb = Solar.uvbFactor(persona.lat, doy, h, persona.envOpts);
      var synth = PARAMS.RMAX_UG_H * persona.skinFrac * sf * uvb * ageScale;
      
      var dPrev = synth - PARAMS.K_CONV * Prev - PARAMS.K_PHOTO * Prev * Math.max(0, uvb);
      Prev += dPrev * dt;
      total += (PARAMS.K_CONV * Prev) * dt;
    }
    // plus the residual Prev converting over the next 24 hours (simplified)
    total += Prev;
    return total;
  }

  /*
   * Run the simulation (PBPK version).
   */
  function simulate(persona, opts) {
    var days = opts.days;
    var startDoy = opts.startDoy != null ? opts.startDoy : 1;
    var dt = days <= 7 ? 0.1 : 0.25;                 
    var sampleEvery = days <= 1 ? 5 / 60 : (days <= 7 ? 0.5 : 24); 
    if (days > 365) {
      sampleEvery = Math.max(24, Math.round(days / 180) * 24); 
    }

    var Vblood = bloodVolumeL(persona.weightKg);
    var Vd = distributionVolumeL(persona.weightKg, persona.fatFrac);
    var Q_fat = PARAMS.CARDIAC_OUT_L_H * PARAMS.Q_FAT_FRAC * (persona.weightKg * persona.fatFrac / PARAMS.FAT_REF_KG);
    var sf = skinFactorForType(persona.skinType);
    var sunHalf = persona.sunHours / 2;
    var ageScale = Math.max(0.25, 1 - 0.75 * ((persona.age || 40) - 20) / 50);

    // State
    var G = 0;                 // gut D3, ug
    var Prev = 0;              // previtamin D3, ug
    var D3 = 0;                // blood D3 amount, ug
    var A = 0;                 // adipose D3 store, ug
    var C25 = persona.start25; // serum 25(OH)D, ng/mL
    var E = 1.0;               // CYP24A1 relative activity (1 = basal)
    var C1 = 45;               // Calcitriol pg/mL

    // Heuristic: D3 is ~5% of 25OHD conc normally
    D3 = Vblood * (C25 * 0.05); 
    A = (D3 / Vblood) * PARAMS.KP_FAT * (persona.weightKg * persona.fatFrac);

    var dailySkinTotal = 0;
    var events = doseEvents(persona, days);
    var nextDose = 0;

    var nSteps = Math.round(days * 24 / dt);
    var sampleEverySteps = Math.max(1, Math.round(sampleEvery / dt));

    var tHours = [], c25 = [], d3 = [], cal = [], dailySkinUg = [];
    var currentDay = -1;

    for (var i = 0; i <= nSteps; i++) {
      var t = i * dt;
      var dayIndex = Math.floor(t / 24);
      if (dayIndex !== currentDay) {
        if (currentDay >= 0) dailySkinUg.push(dailySkinTotal);
        currentDay = dayIndex;
        dailySkinTotal = 0;
      }
      var doy = ((startDoy - 1 + dayIndex) % 365) + 1;
      var hourSolar = t - dayIndex * 24; 

      while (nextDose < events.length && events[nextDose].tHours <= t + 1e-9) {
        G += events[nextDose].ug;
        nextDose++;
      }

      if (i % sampleEverySteps === 0 || i === nSteps) {
        tHours.push(t);
        c25.push(C25);
        d3.push(D3 / Vblood);
        cal.push(C1);
      }
      if (i === nSteps) break;

      var uvb = 0;
      var synth = 0;
      if (sunHalf > 0 && hourSolar >= 12 - sunHalf && hourSolar < 12 + sunHalf && persona.skinFrac > 0) {
        uvb = Solar.uvbFactor(persona.lat, doy, hourSolar, persona.envOpts);
        synth = PARAMS.RMAX_UG_H * persona.skinFrac * sf * uvb * ageScale;
      }

      var dPrev = synth - PARAMS.K_CONV * Prev - PARAMS.K_PHOTO * Prev * Math.max(0, uvb);
      var skinToD3 = PARAMS.K_CONV * Prev;
      dailySkinTotal += skinToD3 * dt;

      var absorbed = PARAMS.KA * G;
      var intoBlood = PARAMS.BIOAVAIL * absorbed;
      var dG = -absorbed;

      // Adipose exchange
      var c_blood = D3 / Vblood; // ug/L = ng/mL
      var c_adipose = A / Math.max(1, persona.weightKg * persona.fatFrac); // ug/kg
      var dA = Q_fat * (c_blood - c_adipose / PARAMS.KP_FAT);

      // 25-hydroxylation (MM)
      var dC25_prod = PARAMS.VMAX25 * c_blood / (PARAMS.KM25 + c_blood);
      var dC25_elim = PARAMS.KELIM0 * E * C25;
      var dC25 = dC25_prod - dC25_elim;

      // CYP24A1 induction (by calcitriol)
      var ind = PARAMS.IND_MAX * C1 / (C1 + 45); 
      var dE = PARAMS.KE_IN * (1 + ind) - PARAMS.KE_OUT * E;

      // Calcitriol and PTH
      var ca_eff = 9.5 + 0.1 * (C1 - 45); 
      var pth = 65 * Math.pow(9.5 / ca_eff, 4) * (1 / (1 + C1/100)); 
      var dC1_prod = PARAMS.VMAX1A * C25 / (PARAMS.KM1A + C25) * (pth/65);
      var dC1_elim = PARAMS.K_ELIM1 * E * C1; 
      var dC1 = dC1_prod - dC1_elim;

      // D3 mass loss (ug/h) = dC25_prod (ng/mL/h) * Vd (L)
      var dD3 = intoBlood + skinToD3 - dA - (dC25_prod * Vd);

      G += dG * dt;
      Prev += dPrev * dt;
      D3 += dD3 * dt;
      A += dA * dt;
      C25 += dC25 * dt;
      E += dE * dt;
      C1 += dC1 * dt;

      if (G < 0) G = 0;
      if (Prev < 0) Prev = 0;
      if (D3 < 0) D3 = 0;
      if (A < 0) A = 0;
      if (C25 < 0) C25 = 0;
      if (E < 1) E = 1; 
      if (C1 < 0) C1 = 0;
    }
    dailySkinUg.push(dailySkinTotal);

    return {
      tHours: tHours,
      c25: c25,
      d3: d3,
      calcitriol: cal,
      doses: events.map(function (e) { return { tHours: e.tHours, iu: e.iu }; }),
      dailySkinUg: dailySkinUg
    };
  }

  var Model = {
    PARAMS: PARAMS,
    KELIM: KELIM,
    PRESETS: PRESETS,
    defaultPersona: defaultPersona,
    skinFactorForType: skinFactorForType,
    distributionVolumeL: distributionVolumeL,
    bloodVolumeL: bloodVolumeL,
    calcitriolPgMl: calcitriolPgMl,
    dailySkinSynthesisUg: dailySkinSynthesisUg,
    simulate: simulate
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Model;
  }
  global.VitaminDModel = Model;
})(typeof window !== 'undefined' ? window : globalThis);
