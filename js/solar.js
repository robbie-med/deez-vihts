/*
 * solar.js - Empirical Clear-Sky UV Index model.
 *
 * Replaces the naive power-law with an empirical UVI approximation 
 * accounting for zenith angle, altitude, and cloud cover.
 */
(function (global) {
  'use strict';

  var DEG = Math.PI / 180;

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

  /*
   * Calculate empirical Clear-Sky UV Index (UVI).
   * 
   * opts can include:
   *   - altitudeKm: +10% UVI per km altitude
   *   - cloudCover: 0 (clear) to 1 (overcast); overcast transmits ~30% UV
   *   - ozoneDU: Dobson Units (default 300)
   */
  function uvIndex(latDeg, doy, hourSolar, opts) {
    var s = Math.max(sinElevation(latDeg, doy, hourSolar), 0);
    if (s <= 0) return 0;
    
    // Empirical approximation for UVI at sea level, 300 DU ozone
    var baseUVI = 12.5 * Math.pow(s, 2.42);
    
    if (opts) {
      if (opts.altitudeKm) {
        baseUVI *= (1 + 0.10 * opts.altitudeKm);
      }
      if (opts.ozoneDU) {
        // ~1.2% increase in UVI for every 1% decrease in ozone
        baseUVI *= Math.pow(300 / opts.ozoneDU, 1.2);
      }
      if (opts.cloudCover != null) {
        // Linear interpolation: 0 clouds = 1.0 transmission, 1.0 clouds = 0.3 transmission
        var transmission = 1.0 - (0.7 * Math.max(0, Math.min(1, opts.cloudCover)));
        baseUVI *= transmission;
      }
      // Note: SPF reduces effective UV at the skin, but UVI itself is an environmental metric.
      // We apply SPF in the model's synthesis calculation, not here.
    }
    
    return baseUVI;
  }

  /*
   * Fraction of the maximal previtamin D3 photoequilibrium reachable at this
   * solar elevation. At low sun, ozone's longer slant path strips the short
   * UVB wavelengths that form previtamin D3 faster than the longer ones that
   * photoconvert it to lumisterol/tachysterol, so the plateau collapses
   * (the "vitamin D winter": none formed at 42 N Nov-Feb, Webb 1988).
   * Empirical: (sin(elevation) / 0.9)^4, capped at 1.
   */
  function previtaminFactor(latDeg, doy, hourSolar) {
    var s = sinElevation(latDeg, doy, hourSolar);
    if (s <= 0) return 0;
    return Math.min(1, Math.pow(s / 0.9, 4));
  }

  var Solar = {
    previtaminFactor: previtaminFactor,
    declinationDeg: declinationDeg,
    sinElevation: sinElevation,
    elevationDeg: elevationDeg,
    uvIndex: uvIndex
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Solar;
  }
  global.Solar = Solar;
})(typeof window !== 'undefined' ? window : globalThis);
