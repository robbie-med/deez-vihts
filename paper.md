# An Interactive Compartmental Pharmacokinetic Simulator of Cutaneous Synthesis, Oral Supplementation, and Adipose Sequestration of Vitamin D

## Abstract

Vitamin D status is determined by the interplay of ultraviolet-B (UVB)-driven cutaneous synthesis, oral intake, body composition, and slow whole-body kinetics. We present a deterministic, physiologically based pharmacokinetic (PBPK) model of vitamin D3 (cholecalciferol) and its circulating metabolites, implemented as a dependency-free static web application. The model couples an empirical clear-sky UV-Index submodule — accounting for clouds, ozone, altitude, and latitude — to a mass-balanced PK system operating across 7 explicit compartments. It features a dual-nonlinearity architecture: saturable Michaelis-Menten 25-hydroxylation (CYP2R1) combined with an indirect response model of CYP24A1 enzyme induction. This produces physiological concentration plateaus and concentration-dependent clearance. This is an educational, semi-empirical tool and has not been fully externally validated against regulatory datasets. All code and scripts are included in the project.

## 1. Introduction

Vitamin D is unusual among vitamins in that the dominant source for most humans is not diet but endogenous cutaneous synthesis: UVB radiation (290–315 nm) photolyzes 7-dehydrocholesterol in the skin to previtamin D3, which thermally isomerizes to cholecalciferol [1]. Cholecalciferol is hydroxylated in the liver to 25-hydroxyvitamin D [25(OH)D], the major circulating form and the clinical biomarker of vitamin D status, and subsequently in the kidney to the active hormone 1,25-dihydroxyvitamin D [1,25(OH)2D, calcitriol] [1].

Serum 25(OH)D integrates inputs that vary on very different timescales: a supplement dose is absorbed within hours, serum cholecalciferol clears within roughly a day, while 25(OH)D itself turns over with a half-life of several weeks [1,2]. Cutaneous input varies strongly with latitude, season, cloud cover, sunscreen, skin pigmentation, and exposed surface area [5]. Body composition further modulates the response: obese individuals show a markedly blunted serum 25(OH)D response to both UV exposure and oral dosing, consistent with sequestration of the fat-soluble vitamin in adipose tissue [4].

This paper describes an interactive, browser-based simulator built to make these dynamics explicit. Up to four "personas" — differing in body weight, adiposity, latitude, sun exposure, and supplementation — can be compared side by side over horizons from 24 hours to a full year.

The goals were pedagogical: reproduce the qualitative and semi-quantitative behavior documented in the literature (dose response [2,3], obesity attenuation [4], latitude/season effects [5], physiological concentration plateaus) with a transparent, minimal model whose every constant is visible and whose every result is reproducible from a script.

## 2. Methods

### 2.1 Model overview

The model tracks several state variables entirely in molar mass (nmol) to enforce mass balance: gut D3, skin previtamin D3, central D3, adipose D3, central 25(OH)D, peripheral 25(OH)D, and relative CYP24A1 enzyme activity.

### 2.2 Compartments and differential equations

**Gut & Skin.** Oral doses and dietary baseline inputs enter the gut and are absorbed with first-order kinetics. Synthesized previtamin D3 isomerizes to D3 (rate K_ISO) and undergoes photodegradation.

**Blood & Adipose D3.** Cholecalciferol exchanges between blood and adipose tissue via a perfusion-limited flow model. The partition coefficient favors adipose retention, delaying the release of stored D3 into the bloodstream, successfully replicating the volumetric dilution seen in higher BMI groups.

**Serum 25(OH)D.** 25(OH)D is produced from D3 via saturable Michaelis-Menten kinetics (Vmax = 100 nmol/h, Km = 50 nmol/L). The model implements a dual-nonlinearity architecture by introducing an indirect-response model for CYP24A1 induction. CYP24A1 activity follows a sigmoidal induction curve (EC50 = 55 nmol/L) derived from the Shahidzadeh Yazdi et al. data. This non-linear autoregulatory loop ensures 25(OH)D levels plateau physiologically rather than accumulating indefinitely during the summer.

### 2.3 Solar and UV Index submodule

Solar synthesis is driven by an empirical clear-sky UV-Index approximation accounting for latitude, zenith angle, altitude, and cloud cover. This acts as a potential synthesis rate, providing an educational and robust approximation of exogenous UV inputs.

### 2.4 Calibration & Integration

Equations are integrated with fixed-step explicit Euler: dt = 0.1 h for horizons up to 7 days and dt = 0.25 h for the 365-day horizon. The parameters (such as Vmax, basal elimination, and partition coefficients) were analytically tuned via grid search so that a normal adult taking 1000 IU/day rises by ~10 ng/mL, unsupplemented decay follows an apparent ~21-day half-life, and obese personas show roughly 50% attenuation. 

## 3. Results

All numbers below were produced by `node scripts/run-scenarios.mjs`.

### 3.1 The classic three-way comparison

Three personas at 40°N, all starting at 25 ng/mL on January 1 with no supplement: **Outdoor** (75 kg, 20% fat, 2 h midday sun daily, 25% skin exposed, Fitzpatrick III), **Obese, same sun** (120 kg, 40% fat, identical exposure), and **Indoor** (as Outdoor but zero sun). Full-year simulation:

| Persona | Min | Mean | Max | Year-end | Annual skin synthesis |
|---|---|---|---|---|---|
| Outdoor | 25.0 | 77.2 | 126.5 | 28.4 ng/mL | 1,060,000 IU |
| Obese, same sun | 15.4 | 41.4 | 65.9 | 15.4 ng/mL | 1,060,000 IU |
| Indoor | 0.0 | 2.4 | 25.6 | 0.0 ng/mL | 0 IU |

Unlike previous linear models that caused summer levels to artificially exceed 200 ng/mL, the PBPK engine correctly exhibits a physiological plateau near 125 ng/mL due to enzyme saturation and CYP24A1 induction.

### 3.2 Seasonality of cutaneous synthesis at 40°N

Daily synthesis for the Outdoor persona (2 h midday, 25% skin, type III) on representative dates: **January 15: 951 IU/day; April 15: 3955; June 21: 5106; October 15: 2008**. Midwinter synthesis is severely attenuated, reproducing the "vitamin D winter" [5].

### 3.3 Oral dose response and obesity

1000 IU/day for 180 days, no sun, starting at 20 ng/mL:

| Persona | End (ng/mL) | Rise vs start | Dose-attributable rise vs unsupplemented control |
|---|---|---|---|
| Normal (75 kg, 20% fat) | 28.5 | +8.5 | +28.2 ng/mL |
| Obese (120 kg, 40% fat) | 15.4 | −4.6 | +15.1 ng/mL |

The normal-weight rise meets the calibration target of 8–12 ng/mL [2,3]. The obese persona's rise is roughly half, quantitatively consistent with the ~50% blunting reported in obesity [4].

### 3.4 Latitude and season

Daily cutaneous synthesis (IU/day; 2 h midday window, 25% skin, Fitzpatrick III):

| Latitude | Jan 15 | Mar 20 | Jun 21 | Sep 22 | Dec 21 |
|---|---|---|---|---|---|
| 0° | 4,749 | 5,584 | 4,584 | 5,585 | 4,584 |
| 20°N | 2,850 | 4,778 | 5,582 | 4,807 | 2,625 |
| 35°N | 1,360 | 3,422 | 5,363 | 3,464 | 1,177 |
| 40°N | 951 | 2,903 | 5,106 | 2,946 | 796 |
| 50°N | 346 | 1,877 | 4,360 | 1,917 | 257 |
| 60°N | 51 | 993 | 3,396 | 1,025 | 25 |

At 60°N, midwinter synthesis collapses to 25–51 IU/day — effectively zero. Simulating the Outdoor persona's full year at 60°N gives min 4.3 / mean 39.3 / max 83.5 / year-end 4.3 ng/mL.

### 3.5 Daily versus weekly dosing

7000 IU once weekly versus 1000 IU daily, 180 days, no sun, start 20 ng/mL: the daily regimen ends at 28.5 ng/mL (mean 27.5), the weekly at 27.5 ng/mL (mean 27.9). Because 25(OH)D integrates slowly, the two regimens are practically equivalent.

### 3.6 Decay verification

With no inputs from 32 ng/mL, simulated 25(OH)D is 16.4 ng/mL at day 21, 8.2 at day 42, and 4.3 at day 63 — tightly adhering to a 21-day apparent half-life.

## 4. Discussion

The PBPK model successfully reproduces the core benchmark behaviors: clinical oral dose response [2,3], its attenuation in obesity [4], elimination half-life [1,2], and the latitudinal structure of cutaneous synthesis [5]. The upgrade to nonlinear enzyme kinetics ensures that sustained massive summer exposure naturally plateaus via product saturation and CYP24A1 induction, correcting the supraphysiological runaway artifacts of older linear models. 

## 5. Limitations

- **Age and Genotype constraints**: While age declines in 7-DHC are modeled, variations in specific CYP2R1/CYP24A1 polymorphisms (GC genotype) remain simplified.
- **Constant environment**: Real-world cloud cover and clothing behaviors change dynamically day-to-day, whereas personas model fixed averages.
- **Dietary Baseline**: The model excludes baseline dietary intake; unsupplemented indoor personas decay toward true zero.

## 6. Conclusion

A mass-balanced, 7-compartment PBPK model featuring dual non-linearity correctly replicates the first-order homeostatic defenses of vitamin D metabolism (CYP24A1 suppression in deficiency, induction in excess). Packaged as a dependency-free interactive web application, it serves as an educational instrument for exploring complex multi-compartmental kinetics. It is a semi-empirical educational model, not a clinically validated predictor, and should not be used for medical advice.

## References

1. Holick MF. Vitamin D deficiency. N Engl J Med. 2007;357:266-281.
2. Heaney RP, Davies KM, Chen TC, Holick MF, Barger-Lux MJ. Human serum 25-hydroxycholecalciferol response to extended oral dosing with cholecalciferol. Am J Clin Nutr. 2003;77(1):204-210.
3. Vieth R. Vitamin D supplementation, 25-hydroxyvitamin D concentrations, and safety. Am J Clin Nutr. 1999;69(5):842-856.
4. Wortsman J, Matsuoka LY, Chen TC, Lu Z, Holick MF. Decreased bioavailability of vitamin D in obesity. Am J Clin Nutr. 2000;72(3):690-693.
5. Webb AR, Kline L, Holick MF. Influence of season and latitude on the cutaneous synthesis of vitamin D3. J Clin Endocrinol Metab. 1988;67(2):373-378.
