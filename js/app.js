/*
 * app.js - UI wiring for the Vitamin D PK Simulator.
 * Depends on globals: VitaminDModel (js/model.js), Solar (js/solar.js), Chart (CDN).
 */
(function () {
  'use strict';

  var Model = window.VitaminDModel;

  var COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea'];
  var MAX_PERSONAS = 4;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTH_LEN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // non-leap year
  var ROMAN = [
    { text: 'I 🏻', bg: '#fbe2cc' },
    { text: 'II 🏼', bg: '#e5c298' },
    { text: 'III 🏽', bg: '#d39965' },
    { text: 'IV 🏽', bg: '#9d5926' },
    { text: 'V 🏾', bg: '#5f3312' },
    { text: 'VI 🏿', bg: '#2a1608' }
  ];

  // ---- State ---------------------------------------------------------------

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function classicThreeWay() {
    return ['outdoor', 'obese', 'indoor'].map(function (k) {
      return Model.defaultPersona(clone(Model.PRESETS[k]));
    });
  }

  var state = {
    viewDays: 365,
    startDate: todayStr(),
    personas: classicThreeWay()
  };

  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function doyFromDateStr(s) {
    var d = new Date(s + 'T12:00:00');
    if (isNaN(d)) return 172;
    var start = new Date(d.getFullYear(), 0, 1);
    var doy = Math.round((d - start) / 86400000) + 1;
    return Math.max(1, Math.min(365, doy));
  }

  function doyToLabel(doy) {
    var m = 0;
    while (m < 11 && doy > MONTH_LEN[m]) { doy -= MONTH_LEN[m]; m++; }
    return MONTHS[m] + ' ' + doy;
  }

  // ---- Persona card rendering ----------------------------------------------

  var cardsEl = document.getElementById('cards');

  function field(label, prop, attrs) {
    return '<div class="field"><label>' + label + '</label>' +
      '<input data-prop="' + prop + '" ' + attrs + '></div>';
  }

  function renderCards() {
    cardsEl.innerHTML = '';
    state.personas.forEach(function (p, i) {
      var color = COLORS[i];
      var card = document.createElement('div');
      card.className = 'persona-card glass';
      card.style.borderLeftColor = color;
      card.dataset.index = i;

      var supps = p.supplements || [];
      if (supps.length === 0 && p.supplement) {
        supps = [p.supplement];
        p.supplements = supps;
      }
      
      var suppHtml = '';
      supps.forEach(function(supp, idx) {
        var typeOpts = ['none', 'daily', 'weekly'].map(function (t) {
          return '<option value="' + t + '"' + (supp.type === t ? ' selected' : '') + '>' + t + '</option>';
        }).join('');
        
        suppHtml += '<div class="supp-row" style="margin-top: 8px;">' +
          '<div class="field"><label>Supplement ' + (idx + 1) + '</label><select data-prop="supp.' + idx + '.type">' + typeOpts + '</select></div>' +
          field('Dose (IU)', 'supp.' + idx + '.doseIU', 'type="number" min="0" max="100000" step="100" value="' + supp.doseIU + '"' + (supp.type === 'none' ? ' disabled' : '')) +
          field('Duration (wks)', 'supp.' + idx + '.durationWeeks', 'type="number" min="1" max="1040" step="1" value="' + (supp.durationWeeks || 52) + '"' + (supp.type === 'none' ? ' disabled' : '')) +
          (idx > 0 ? '<button class="small danger remove-supp" data-idx="' + idx + '" style="align-self: flex-end; margin-bottom: 4px; flex: none;">X</button>' : '') +
        '</div>';
      });
      
      if (supps.length < 3) {
        suppHtml += '<div class="supp-row" style="justify-content: flex-end; margin-top: 4px;"><button class="small add-supp">+ Add Phase</button></div>';
      }
      var skinOpts = ROMAN.map(function (r, k) {
        var style = 'background-color:' + r.bg + '; color:' + (k > 2 ? '#fff' : '#000');
        return '<option value="' + (k + 1) + '" style="' + style + '"' + (p.skinType === k + 1 ? ' selected' : '') + '>' + r.text + '</option>';
      }).join('');

      card.innerHTML =
        '<div class="card-head">' +
          '<input class="name" data-prop="name" value="' + escapeHtml(p.name) + '" maxlength="24">' +
          '<div>' +
            '<button class="small" data-action="duplicate" title="Duplicate persona">Copy</button>' +
            '<button class="small danger" data-action="remove" title="Remove persona" style="margin-left: 4px;">Remove</button>' +
          '</div>' +
        '</div>' +
        '<div class="grid">' +
          field('Age', 'age', 'type="number" min="1" max="120" step="1" value="' + (p.age || 40) + '"') +
          field('Weight (kg)', 'weightKg', 'type="number" min="30" max="300" step="1" value="' + p.weightKg + '"') +
          field('Body fat (%)', 'fatPct', 'type="number" min="3" max="70" step="1" value="' + Math.round(p.fatFrac * 100) + '"') +
          field('Latitude (deg, S negative)', 'lat', 'type="number" min="-90" max="90" step="1" value="' + p.lat + '"') +
          field('Sun (h/day, centered on noon)', 'sunHours', 'type="number" min="0" max="12" step="0.25" value="' + p.sunHours + '"') +
          field('Skin exposed (fraction)', 'skinFrac', 'type="number" min="0" max="1" step="0.05" value="' + p.skinFrac + '"') +
          '<div class="field"><label>Fitzpatrick skin type</label><select data-prop="skinType">' + skinOpts + '</select></div>' +
          field('Dietary base (IU/d)', 'dietIU', 'type="number" min="0" max="10000" step="100" value="' + (p.dietIU != null ? p.dietIU : 400) + '"') +
          field('Starting 25(OH)D (ng/mL)', 'starting25OHD', 'type="number" min="1" max="300" step="0.5" placeholder="Auto (Diet+Sun)" value="' + (p.starting25OHD || '') + '"') +
        '</div>' +
        '<details class="advanced-params"><summary>Advanced Environmental Parameters</summary>' +
        '<div class="grid" style="margin-top: 0.5rem;">' +
          field('Cloud Cover (0-1)', 'envOpts.cloudCover', 'type="number" min="0" max="1" step="0.1" value="' + (p.envOpts?.cloudCover || 0) + '"') +
          field('Altitude (km)', 'envOpts.altitudeKm', 'type="number" min="0" max="8.8" step="0.1" value="' + (p.envOpts?.altitudeKm || 0) + '"') +
          field('Sunscreen SPF', 'envOpts.spf', 'type="number" min="1" max="100" step="1" value="' + (p.envOpts?.spf || 1) + '"') +
        '</div></details>' +
        suppHtml +
        '<div class="preset-row">' +
          '<button class="small" data-preset="outdoor">Outdoor (2h midday sun)</button>' +
          '<button class="small" data-preset="obese">Obese, same sun</button>' +
          '<button class="small" data-preset="indoor">Indoor (no sun)</button>' +
          '<button class="small" data-action="reset">Reset</button>' +
        '</div>';
      cardsEl.appendChild(card);
    });
    document.getElementById('btn-add').disabled = state.personas.length >= MAX_PERSONAS;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  // One delegated listener for all card inputs and buttons.
  cardsEl.addEventListener('input', function (ev) {
    var card = ev.target.closest('.persona-card');
    if (!card) return;
    var p = state.personas[Number(card.dataset.index)];
    var prop = ev.target.dataset.prop;
    if (!prop) return;
    
    if (!p.envOpts) p.envOpts = { cloudCover: 0, altitudeKm: 0, spf: 1 };

    if (prop === 'name') { p.name = ev.target.value; }
    else if (prop === 'fatPct') { p.fatFrac = clampNum(ev.target.value, 3, 70, 20) / 100; }
    else if (prop.indexOf('supp.') === 0) {
      var parts = prop.split('.');
      var idx = parseInt(parts[1], 10);
      var subProp = parts[2];
      if (subProp === 'type') {
        p.supplements[idx].type = ev.target.value;
        renderCards(); // enable/disable inputs
      } else if (subProp === 'doseIU') {
        p.supplements[idx].doseIU = clampNum(ev.target.value, 0, 100000, 0);
      } else if (subProp === 'durationWeeks') {
        p.supplements[idx].durationWeeks = clampNum(ev.target.value, 1, 1040, 52);
      }
    }
    else if (prop === 'skinType') { p.skinType = parseInt(ev.target.value, 10) || 3; }
    else if (prop === 'envOpts.cloudCover') { p.envOpts.cloudCover = clampNum(ev.target.value, 0, 1, 0); }
    else if (prop === 'envOpts.altitudeKm') { p.envOpts.altitudeKm = clampNum(ev.target.value, 0, 8.8, 0); }
    else if (prop === 'envOpts.spf') { p.envOpts.spf = clampNum(ev.target.value, 1, 100, 1); }
    else { p[prop] = parseFloat(ev.target.value); }
    scheduleRun();
  });

  cardsEl.addEventListener('click', function (ev) {
    var btn = ev.target.closest('button');
    if (!btn) return;
    var card = btn.closest('.persona-card');
    var i = card ? Number(card.dataset.index) : -1;
    var p = i >= 0 ? state.personas[i] : null;

    if (btn.classList.contains('add-supp') && p) {
      p.supplements.push({ type: 'none', doseIU: 1000, hourOfDay: 8, durationWeeks: 52 });
      renderCards();
      scheduleRun();
      return;
    }
    if (btn.classList.contains('remove-supp') && p) {
      var idx = parseInt(btn.dataset.idx, 10);
      p.supplements.splice(idx, 1);
      renderCards();
      scheduleRun();
      return;
    }

    if (btn.dataset.preset) {
      var preset = clone(Model.PRESETS[btn.dataset.preset]);
      var old = state.personas[i];
      preset.lat = old.lat; // keep the user's latitude when applying a body/exposure preset
      state.personas[i] = Model.defaultPersona(preset);
      renderCards();
      scheduleRun();
    } else if (btn.dataset.action === 'reset') {
      state.personas[i] = Model.defaultPersona({ name: 'Persona ' + (i + 1) });
      renderCards();
      scheduleRun();
    } else if (btn.dataset.action === 'duplicate') {
      if (state.personas.length < MAX_PERSONAS) {
        var copy = JSON.parse(JSON.stringify(state.personas[i]));
        copy.name = copy.name + ' (Copy)';
        state.personas.splice(i + 1, 0, copy);
        renderCards();
        scheduleRun();
      } else {
        alert("Maximum of " + MAX_PERSONAS + " personas allowed.");
      }
    } else if (btn.dataset.action === 'remove' && state.personas.length > 1) {
      state.personas.splice(i, 1);
      renderCards();
      scheduleRun();
    }
  });

  function clampNum(v, lo, hi, fallback) {
    var n = parseFloat(v);
    if (!isFinite(n)) return fallback;
    return Math.max(lo, Math.min(hi, n));
  }

  // ---- Toolbar --------------------------------------------------------------

  var viewNumEl = document.getElementById('view-num');
  var viewUnitEl = document.getElementById('view-unit');
  
  function updateDuration() {
    var num = parseFloat(viewNumEl.value) || 1;
    var unit = parseFloat(viewUnitEl.value) || 365;
    state.viewDays = num * unit;
    
    scheduleRun();
  }

  viewNumEl.addEventListener('input', updateDuration);
  viewUnitEl.addEventListener('change', updateDuration);

  var startDateEl = document.getElementById('start-date');
  startDateEl.value = state.startDate;
  startDateEl.addEventListener('input', function () {
    state.startDate = startDateEl.value;
    scheduleRun();
  });

  document.getElementById('btn-classic').addEventListener('click', function () {
    state.personas = classicThreeWay();
    renderCards();
    scheduleRun();
  });

  document.getElementById('btn-add').addEventListener('click', function () {
    if (state.personas.length >= MAX_PERSONAS) return;
    state.personas.push(Model.defaultPersona({ name: 'Persona ' + (state.personas.length + 1) }));
    renderCards();
    scheduleRun();
  });

  // ---- Status bands plugin (year view) --------------------------------------

  var bandsPlugin = {
    id: 'statusBands',
    beforeDraw: function (chart, args, opts) {
      if (!opts || !opts.enabled) return;
      var y = chart.scales.y;
      var area = chart.chartArea;
      var ctx = chart.ctx;
      function pix(v) { return Math.max(area.top, Math.min(area.bottom, y.getPixelForValue(v))); }
      var bands = [
        [0, 20, 'rgba(220, 38, 38, 0.08)', 'deficient <20'],
        [20, 30, 'rgba(202, 138, 4, 0.10)', 'insufficient 20-30'],
        [30, 50, 'rgba(22, 163, 74, 0.08)', 'sufficient 30-50']
      ];
      ctx.save();
      bands.forEach(function (b) {
        var yTop = pix(b[1]);
        var yBot = pix(b[0]);
        ctx.fillStyle = b[2];
        ctx.fillRect(area.left, yTop, area.right - area.left, yBot - yTop);
        ctx.fillStyle = 'rgba(91, 100, 112, 0.8)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(b[3], area.right - 4, yTop + 11);
      });
      if (y.max >= 100) {
        var yc = pix(100);
        ctx.strokeStyle = 'rgba(220, 38, 38, 0.4)';
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(area.left, yc);
        ctx.lineTo(area.right, yc);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(220, 38, 38, 0.7)';
        ctx.textAlign = 'left';
        ctx.fillText('upper caution 100', area.left + 4, yc - 3);
      }
      ctx.restore();
    }
  };

  // ---- Simulation and chart --------------------------------------------------

  var chart = null;
  var chipsEl = document.getElementById('chips');
  var axisNoteEl = document.getElementById('axis-note');

  function viewParams() {
    return { days: state.viewDays, startDoy: doyFromDateStr(state.startDate) };
  }

  function buildLabels(result, vp) {
    var startDoy = vp.startDoy;
    return result.tHours.map(function (t) {
      var dayIdx = Math.floor(t / 24);
      var doy = ((startDoy - 1 + dayIdx) % 365) + 1;
      
      if (vp.days > 7) {
        // Just show date/month for long views
        var y = Math.floor(dayIdx / 365);
        var lbl = doyToLabel(doy);
        return y > 0 ? lbl + ' (Y' + (y+1) + ')' : lbl;
      }
      
      var h = t - dayIdx * 24;
      var hh = String(Math.floor(h)).padStart(2, '0');
      var mm = String(Math.round((h % 1) * 60)).padStart(2, '0');
      if (vp.days <= 1) return hh + ':' + mm;
      return doyToLabel(doy) + ' ' + hh + ':' + mm;
    });
  }

  function getCssColor(varName) {
    var el = document.createElement('div');
    el.style.color = 'var(' + varName + ')';
    document.body.appendChild(el);
    var color = getComputedStyle(el).color;
    document.body.removeChild(el);
    return color;
  }

  function run() {
    var vp = viewParams();
    var results = state.personas.map(function (p) { return Model.simulate(p, vp); });
    var labels = buildLabels(results[0], vp);

    var textColor = getCssColor('--text');
    var gridColor = getCssColor('--border');

    var datasets = [];
    state.personas.forEach(function (p, i) {
      var color = COLORS[i];
      var r = results[i];
      var name = p.name || 'Persona ' + (i + 1);

      datasets.push({
        label: name + ' — 25(OH)D (ng/mL)',
        data: r.c25,
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        pointRadius: 0,
        yAxisID: 'y',
        tension: 0.15
      });

      // Uncertainty envelopes
      if (r.c25_high && r.c25_high.length) {
        datasets.push({
          label: name + ' (Upper)',
          data: r.c25_high,
          borderColor: 'transparent',
          backgroundColor: color + '33', // 20% opacity
          fill: '+1',
          pointRadius: 0,
          borderWidth: 0,
          yAxisID: 'y',
          tension: 0.15
        });
        datasets.push({
          label: name + ' (Lower)',
          data: r.c25_low,
          borderColor: 'transparent',
          backgroundColor: 'transparent',
          fill: false,
          pointRadius: 0,
          borderWidth: 0,
          yAxisID: 'y',
          tension: 0.15
        });
      }

      if (vp.days < 30) {
        datasets.push({
          label: name + ' — serum D3 (ng/mL)',
          data: r.d3,
          borderColor: color,
          backgroundColor: color,
          borderWidth: 1.25,
          borderDash: [5, 3],
          pointRadius: 0,
          yAxisID: 'y1',
          tension: 0.15
        });
        if (r.doses.length) {
          datasets.push({
            label: name + ' — dose',
            type: 'scatter',
            data: r.doses.map(function (d) {
              var idx = r.tHours.findIndex(function(t) { return t >= d.tHours; });
              if (idx === -1) idx = r.tHours.length - 1;
              return { x: idx, y: 1 };
            }),
            borderColor: color,
            backgroundColor: color,
            pointStyle: 'triangle',
            radius: 7,
            yAxisID: 'yDose'
          });
        }
      }
    });

    var scales;
    if (vp.days >= 30) {
      var dataMax = 0;
      results.forEach(function (r) { r.c25.forEach(function (v) { if (v > dataMax) dataMax = v; }); });
      scales = {
        x: { ticks: { autoSkip: true, maxTicksLimit: 14, color: textColor }, grid: { display: false } },
        y: {
          min: 0,
          max: Math.max(60, Math.ceil(dataMax / 10) * 10),
          title: { display: true, text: 'Serum 25(OH)D (ng/mL)', color: textColor },
          ticks: { color: textColor },
          grid: { color: gridColor }
        }
      };
    } else {
      scales = {
        x: { ticks: { autoSkip: true, maxTicksLimit: 16, color: textColor }, grid: { display: false } },
        y: { min: 0, position: 'left', title: { display: true, text: '25(OH)D (ng/mL)', color: textColor }, ticks: { color: textColor }, grid: { color: gridColor } },
        y1: { min: 0, position: 'right', title: { display: true, text: 'D3 (ng/mL)', color: textColor }, ticks: { color: textColor }, grid: { drawOnChartArea: false } },
        yDose: { display: false, min: 0, max: 1.04 }
      };
    }

    if (chart) chart.destroy();
    chart = new Chart(document.getElementById('chart'), {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: { labels: { boxWidth: 14, font: { size: 11 }, color: textColor } },
          statusBands: { enabled: vp.days >= 30 },
          tooltip: {
            callbacks: {
              label: function (item) {
                var v = item.parsed.y;
                return item.dataset.yAxisID === 'yDose'
                  ? item.dataset.label
                  : item.dataset.label + ': ' + (v != null && v.toFixed ? v.toFixed(1) : v);
              }
            }
          }
        },
        scales: scales
      },
      plugins: [bandsPlugin]
    });

    renderChips(results, vp);
    axisNoteEl.textContent = vp.days >= 30
      ? 'Bands: <20 ng/mL deficient, 20-30 insufficient, 30-50 sufficient; dashed line at 100 ng/mL (upper caution). 1 ng/mL = 2.5 nmol/L. Shaded regions represent 50% interindividual variability.'
      : 'Serum 25(OH)D (solid) and cholecalciferol D3 (dashed) in ng/mL (1 ng/mL = 2.5 nmol/L). Triangles mark supplement doses.';
  }

  function renderChips(results, vp) {
    if (vp.days < 30) { chipsEl.innerHTML = ''; return; }
    chipsEl.innerHTML = '';
    results.forEach(function (r, i) {
      var a = r.c25;
      var min = Math.min.apply(null, a);
      var max = Math.max.apply(null, a);
      var mean = a.reduce(function (s, v) { return s + v; }, 0) / a.length;
      var end = a[a.length - 1];
      var chip = document.createElement('div');
      chip.className = 'chip';
      chip.innerHTML =
        '<span class="dot" style="background:' + COLORS[i] + '"></span>' +
        '<b>' + escapeHtml(state.personas[i].name) + '</b>' +
        '<span class="vals">min ' + min.toFixed(1) + ' / mean ' + mean.toFixed(1) +
        ' / max ' + max.toFixed(1) + ' / end ' + end.toFixed(1) + ' ng/mL</span>';
      chipsEl.appendChild(chip);
    });
  }

  // ---- Debounce ---------------------------------------------------------------

  var timer = null;
  function scheduleRun() {
    clearTimeout(timer);
    timer = setTimeout(run, 150);
  }

  // ---- Boot ---------------------------------------------------------------------

  renderCards();
  run();
})();
