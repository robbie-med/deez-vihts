# Vitamin D Pharmacokinetic Simulator

An interactive, browser-based compartmental pharmacokinetic (PBPK) simulator of cutaneous synthesis, oral supplementation, and adipose sequestration of Vitamin D. 

**Live Demo:** [https://robbie-med.github.io/deez-vihts/](https://robbie-med.github.io/deez-vihts/)

![Simulator Interface](https://via.placeholder.com/800x400.png?text=Vitamin+D+Simulator+Screenshot)

## 📌 Overview

Vitamin D status is determined by the interplay of ultraviolet-B (UVB)-driven cutaneous synthesis, oral intake, body composition, and slow whole-body kinetics. This project is a deterministic, physiologically based pharmacokinetic (PBPK) model of vitamin D3 (cholecalciferol) and its circulating metabolites, implemented as a dependency-free static web application.

The model couples an empirical clear-sky UV-Index submodule — accounting for clouds, ozone, altitude, and latitude — to a mass-balanced PK system operating across 7 explicit physiological compartments. 

### Key Physiological Features

- **Mass-Balanced Engine:** Operates strictly in moles (nmol) with explicit distribution volumes, ensuring exact mass conservation across the Gut, Skin, Central D3, Adipose D3, Central 25(OH)D, and Peripheral 25(OH)D compartments.
- **Dual Nonlinearity:** Features saturable Michaelis-Menten 25-hydroxylation (CYP2R1) combined with a continuous indirect-response model for CYP24A1 enzyme induction (derived from Shahidzadeh Yazdi et al. data). This ensures that prolonged high-dose exposure naturally plateaus via autoregulatory degradation rather than infinite accumulation.
- **Mechanistic Adipose Partitioning:** Cholecalciferol exchanges between blood and adipose tissue via a perfusion-limited flow model. The partition coefficient strongly favors adipose retention, accurately replicating the volumetric dilution and delayed clearance seen in higher BMI groups.
- **D3 Bioavailability Constraints:** Incorporates a fast basal D3 clearance pathway to mathematically shunt oral D3 toward biliary excretion or other pathways, successfully reproducing the empirically observed (~10 ng/mL) rise from 1000 IU/d clinical trials.
- **Algorithmic Steady-State Initialization:** Replaces arbitrary parameter initialization with a full 2-year Euler burn-in loop that dynamically equilibrates the patient's entire compartmental state to their exact lifestyle inputs (Diet + Sun) prior to the start of the simulation.

## 🚀 Usage

The simulator allows up to four "personas" to be compared side by side. 

You can configure:
- **Biometrics**: Age, Weight, Body Fat %
- **Location**: Latitude, Cloud Cover, Altitude
- **Lifestyle**: Dietary baseline, Supplement regimen (Daily/Weekly), Time of Day
- **Sun Exposure**: Hours in the sun, % Skin exposed, Fitzpatrick Skin Type, Sunscreen SPF

The UI will automatically compute the dynamics of Vitamin D over the chosen time horizon (from 1 day up to a decade) and plot the serum 25(OH)D trajectory along with upper and lower physiological bounds (representing population variance).

## 🛠️ Tech Stack & Architecture

This is a vanilla HTML/JS/CSS application requiring no build steps or backend.
- `index.html` / `css/style.css`: The frontend UI (built with a modern glassmorphism design system).
- `js/app.js`: DOM manipulation, persona management, and Chart.js integration.
- `js/model.js`: The core 7-compartment PBPK Euler integration engine.
- `js/solar.js`: The empirical clear-sky UV-Index and cutaneous synthesis module.

### Running Locally

You can run the app locally using any static file server:

```bash
# Using Node.js
npx serve .

# Using Python
python -m http.server
```

### Running Tests

The project includes an analytical test suite for verifying dose-response curves and elimination half-lives:

```bash
npm install
npm test
```

## ⚠️ Disclaimer

This is a **semi-empirical educational tool**, not a clinically validated predictor, and should **not** be used for medical advice or diagnostic purposes. While it replicates first-order homeostatic defenses and benchmarks well against literature averages, individual metabolic variation (such as GC genotype polymorphisms) is highly complex.

## 📖 Further Reading

For a deep dive into the mathematics, calibration, and structural equations powering the model, please read the included [`paper.md`](paper.md) or the [`explanation.html`](explanation.html) interactive guide.
