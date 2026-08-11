/*
 * solar.js - Solar geometry and vitamin-D-weighted UVB model.
 *
 * Pure logic, no DOM. Dual export: attaches to `window.Solar` in the browser
 * and to `module.exports` under Node (for tests and scenario scripts).
 *
 * All angles in degrees, all times in hours of local apparent solar time
 * (12.0 = solar noon). Day-of-year (doy) is 1..365 for a generic non-leap year.
 */
(function (global) {
  'use strict';

  var DEG = Math.PI / 180;

  // Day-of-year of the June solstice used for UVB normalization.
  var JUNE_SOLSTICE_DOY = 172;
  // Reference latitude for UVB normalization (35 deg N).
  var NORM_LAT = 35;

  // Solar declination (deg) for a given day of year.
  function declinationDeg(doy) {
    return -23.44 * Math.cos((2 * Math.PI * (doy + 10)) / 365);
  }

  // Sine of the solar elevation angle from latitude, day of year and solar time.
  function sinElevation(latDeg, doy, hourSolar) {
    var lat = latDeg * DEG;
    var dec = declinationDeg(doy) * DEG;
    var H = 15 * (hourSolar - 12) * DEG;
    return Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
  }

  // Solar elevation angle (deg), clamped to the valid asin domain.
  function elevationDeg(latDeg, doy, hourSolar) {
    var s = sinElevation(latDeg, doy, hourSolar);
    return Math.asin(Math.max(-1, Math.min(1, s))) / DEG;
  }

  // Normalization constant: value of sin(elevation)^2.5 at the reference condition.
  var NORM = Math.pow(Math.max(sinElevation(NORM_LAT, JUNE_SOLSTICE_DOY, 12), 0), 2.5);

  /*
   * Vitamin-D-weighted UVB factor.
   * opts can include:
   *   - altitudeKm: +10% UVB per km
   *   - cloudCover: 0 (clear) to 1 (overcast); overcast transmits ~30% UVB
   *   - spf: Sun Protection Factor (e.g., 1 for none, 15, 30); transmission = 1/SPF
   */
  function uvbFactor(latDeg, doy, hourSolar, opts) {
    var s = Math.max(sinElevation(latDeg, doy, hourSolar), 0);
    if (s === 0) return 0;
    
    var baseUvb = Math.pow(s, 2.5) / NORM;
    
    if (opts) {
      if (opts.altitudeKm) {
        baseUvb *= (1 + 0.10 * opts.altitudeKm);
      }
      if (opts.cloudCover != null) {
        // Linear interpolation: 0 clouds = 1.0 transmission, 1.0 clouds = 0.3 transmission
        var transmission = 1.0 - (0.7 * Math.max(0, Math.min(1, opts.cloudCover)));
        baseUvb *= transmission;
      }
      if (opts.spf && opts.spf > 1) {
        // Note: Real-world application often yields less protection than stated SPF.
        // We assume perfect application here for the physical model.
        baseUvb *= (1.0 / opts.spf);
      }
    }
    return baseUvb;
  }

  var Solar = {
    declinationDeg: declinationDeg,
    sinElevation: sinElevation,
    elevationDeg: elevationDeg,
    uvbFactor: uvbFactor,
    JUNE_SOLSTICE_DOY: JUNE_SOLSTICE_DOY,
    NORM_LAT: NORM_LAT,
    NORM: NORM
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Solar;
  }
  global.Solar = Solar;
})(typeof window !== 'undefined' ? window : globalThis);
