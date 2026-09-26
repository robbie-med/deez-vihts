# Vitamin D Pharmacokinetic Simulator

An interactive, browser-based compartmental pharmacokinetic simulator of cutaneous synthesis and oral supplementation of Vitamin D.

**Live Demo:** [https://robbie-med.github.io/deez-vihts/](https://robbie-med.github.io/deez-vihts/)

![Simulator Interface](https://via.placeholder.com/800x400.png?text=Vitamin+D+Simulator+Screenshot)

## 📌 Overview

Vitamin D status is determined by the interplay of ultraviolet-B (UVB)-driven cutaneous synthesis, oral intake, body size, and slow whole-body kinetics. This project is a deterministic, mass-balanced compartmental model of vitamin D3 (cholecalciferol) and serum 25(OH)D, implemented as a dependency-free static web application.

### Key Features

- **A measured level is a trait, not a transient:** enter a measured starting 25(OH)D and the model fits one persistent individual factor so the persona's own diet and sun sustain that level at the start date's season. A profoundly low starter stays low unless treated. You choose whether the gap reflects *dose response* (supplements blunted too) or *sun + diet only* (supplements at full strength).
- **Saturating skin synthesis:** the previtamin D3 reservoir approaches a photo-equilibrium within about one minimal erythemal dose (MED). Skin type and sunscreen slow the approach but do not lower the ceiling. Low winter sun lowers the ceiling itself, which reproduces the vitamin D winter.
- **Volumetric dilution:** all volumes and clearances scale with body weight, so a larger body reaches a lower level from the same input (Drincic 2012).
- **Nonlinear metabolism:** saturable CYP2R1 25-hydroxylation (relevant for large boluses) and CYP24A1 induction (an indirect-response model).
- **Mass-balanced engine:** six state variables in nmol (gut, skin previtamin D3, blood D3, central and peripheral 25(OH)D) plus relative CYP24A1 activity. The fast skin and D3 steps are integrated exactly.
- **Season-aware initialization:** a two-year burn-in of the persona's baseline lifestyle ends on the chosen start date.
- **Variability band:** the shaded region re-runs the persona as a 0.8× and 1.25× responder.

## 🚀 Usage

The simulator allows up to four "personas" to be compared side by side. 

You can configure:
- **Biometrics**: Age, Weight, optional measured 25(OH)D at the start date
- **Location**: Latitude, Cloud Cover, Altitude
- **Lifestyle**: Dietary baseline, Supplement regimen (Daily/Weekly), Time of Day
- **Sun Exposure**: Hours in the sun, % Skin exposed, Fitzpatrick Skin Type, Sunscreen SPF

The UI computes the dynamics over the chosen horizon (1 day up to a decade) and plots serum 25(OH)D with a low/high-responder band.

## 🛠️ Tech Stack & Architecture

This is a vanilla HTML/JS/CSS application requiring no build steps or backend.
- `index.html` / `css/style.css`: The frontend UI (built with a modern glassmorphism design system).
- `js/app.js`: DOM manipulation, persona management, and Chart.js integration.
- `js/model.js`: The compartmental model, initialization and starting-level fit.
- `js/solar.js`: Solar geometry, clear-sky UV index and the previtamin plateau factor.

### Running Locally

You can run the app locally using any static file server:

```bash
# Using Node.js
npx serve .

# Using Python
python -m http.server
```

### Running Tests

The test suite checks calibration (dose response, body size, half-life), starting-level behavior, skin synthesis and robustness:

```bash
npm test                 # no dependencies needed
npm run scenarios        # reproduces every number in paper.md
npm install && npm run build   # regenerate explanation.html from paper.md
```

## ⚠️ Disclaimer

This is a **semi-empirical educational tool**, not a clinically validated predictor, and should **not** be used for medical advice or diagnostic purposes. While it replicates first-order homeostatic defenses and benchmarks well against literature averages, individual metabolic variation (such as GC genotype polymorphisms) is highly complex.

## 📖 Further Reading

For a deep dive into the mathematics, calibration, and structural equations powering the model, please read the included [`paper.md`](paper.md) or the [`explanation.html`](explanation.html) interactive guide.
