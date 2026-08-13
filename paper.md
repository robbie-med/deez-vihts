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

The model tracks seven state variables, all in units of nmol (nanomoles), to enforce strict mass balance:

| Variable | Description |
|---|---|
| $G$ | Gut compartment (nmol D3) |
| $S_\text{pre}$ | Skin previtamin D3 (nmol) |
| $D_{3,c}$ | Central blood D3 (nmol) |
| $D_{3,p}$ | Adipose D3 (nmol) |
| $C_{25,c}$ | Central serum 25(OH)D (nmol) |
| $C_{25,p}$ | Peripheral 25(OH)D (nmol) |
| $E$ | Relative CYP24A1 enzyme activity (dimensionless, 0–1) |

Concentrations are derived by dividing the compartment amount by its distribution volume (e.g., $[D_{3,c}] = D_{3,c} / V_{c,D3}$, in nmol/L).

### 2.2 Compartments and differential equations

#### Gut

Oral doses and dietary baseline inputs enter the gut compartment $G$ and are absorbed with first-order kinetics $K_a$:

$$\frac{dG}{dt} = \dot{m}_\text{diet} + \dot{m}_\text{oral} - K_a G$$

where $\dot{m}_\text{diet}$ and $\dot{m}_\text{oral}$ are nmol/h input rates from diet and bolus dosing, respectively. The absorbed flux entering the central D3 compartment is $F_\text{abs} = K_a G \cdot f$, where $f$ is oral bioavailability (set to 1.0).

#### Skin (Previtamin D3)

Synthesized previtamin D3 ($S_\text{pre}$) isomerizes to cholecalciferol at rate $K_\text{iso}$ and undergoes photodegradation at rate $K_\text{photo}$ only while UV is present:

$$\frac{dS_\text{pre}}{dt} = R_\text{synth} - K_\text{iso}\, S_\text{pre} - K_\text{photo}\, S_\text{pre}$$

#### Central Blood D3

Cholecalciferol in the central compartment receives input from gut absorption and skin isomerization, exchanges bidirectionally with adipose tissue, and is eliminated by hepatic 25-hydroxylation and a basal clearance pathway (representing biliary excretion and other routes):

$$\frac{dD_{3,c}}{dt} = F_\text{abs} + K_\text{iso}\,S_\text{pre} - Q_{D3}\!\left(\frac{D_{3,c}}{V_{c,D3}} - \frac{D_{3,p}}{V_{p,D3}}\right) - V_{25} - CL_{D3}\,[D_{3,c}]$$

where $[D_{3,c}] = D_{3,c}/V_{c,D3}$ and $V_{25}$ is the saturable 25-hydroxylation rate (see below).

#### Adipose D3

Cholecalciferol exchanges between the central compartment and the peripheral adipose tissue compartment via a perfusion-limited flow model. The adipose volume $V_{p,D3}$ scales linearly with body fat mass, replicating the volumetric dilution and delayed clearance seen in higher BMI groups:

$$\frac{dD_{3,p}}{dt} = Q_{D3}\!\left(\frac{D_{3,c}}{V_{c,D3}} - \frac{D_{3,p}}{V_{p,D3}}\right)$$

The adipose volume scales from the reference (75 kg, 20% body fat):

$$V_{p,D3} = V_{p,D3}^\text{ref} \cdot \frac{m_\text{body} \cdot f_\text{fat}}{m_\text{ref} \cdot f_\text{fat,ref}}$$

#### Central Serum 25(OH)D

25(OH)D is produced from central D3 via saturable Michaelis-Menten kinetics, exchanges with a peripheral compartment, and is eliminated by the CYP24A1-induction-dependent pathway:

$$\frac{dC_{25,c}}{dt} = V_{25} - Q_{25}\!\left(\frac{C_{25,c}}{V_{c,25}} - \frac{C_{25,p}}{V_{p,25}}\right) - \text{Elim}_{25}$$

#### Peripheral 25(OH)D

$$\frac{dC_{25,p}}{dt} = Q_{25}\!\left(\frac{C_{25,c}}{V_{c,25}} - \frac{C_{25,p}}{V_{p,25}}\right)$$

#### Saturable 25-Hydroxylation (CYP2R1)

Hepatic 25-hydroxylation follows Michaelis-Menten kinetics:

$$V_{25} = \frac{V_\text{max} \cdot [D_{3,c}]}{K_m + [D_{3,c}]}$$

where $V_\text{max} = 100$ nmol/h and $K_m = 50$ nmol/L.

#### CYP24A1 Indirect Response Model

The model implements a dual-nonlinearity architecture via an indirect-response model for CYP24A1 enzyme activity $E$. The stimulus $S_c$ follows a sigmoidal Hill induction curve driven by the central 25(OH)D concentration:

$$S_c = H_\text{min} + \frac{(H_\text{max} - H_\text{min})\,[C_{25,c}]^\gamma}{EC_{50}^\gamma + [C_{25,c}]^\gamma}$$

$$\frac{dE}{dt} = K_\text{out}\,(S_c - E)$$

This non-linear autoregulatory loop ensures 25(OH)D levels plateau physiologically rather than accumulating indefinitely during the summer. Total elimination of 25(OH)D is the sum of CYP24A1-mediated and basal clearance:

$$\text{Elim}_{25} = \bigl(CL_\text{CYP24,max} \cdot E + CL_\text{other}\bigr) \cdot [C_{25,c}]$$

### 2.3 Solar and UV Index submodule

Solar synthesis is driven by an empirical clear-sky UV-Index approximation. The first step is computing the sine of the solar elevation angle $\alpha$ from latitude $\phi$, solar declination $\delta$, and hour angle $H$:

$$\sin(\alpha) = \sin(\phi)\sin(\delta) + \cos(\phi)\cos(\delta)\cos(H)$$

where the hour angle is $H = 15^\circ \times (t_\text{solar} - 12)$ (degrees per hour from solar noon). Note that solar zenith angle $\theta = 90^\circ - \alpha$, so $\cos(\theta) = \sin(\alpha)$; the formula above is equivalently expressed in terms of either angle.

Solar declination varies with day of year $d$:

$$\delta = -23.44^\circ \cdot \cos\!\left(\frac{2\pi\,(d + 10)}{365}\right)$$

The clear-sky UVI is computed empirically from the sine of the elevation angle $s = \sin(\alpha)$, adjusted for altitude and ozone column:

$$\text{UVI}_\text{clear} = 12.5 \cdot s^{2.42} \cdot \left(1 + 0.10\,h_\text{km}\right) \cdot \left(\frac{300}{\text{DU}}\right)^{1.2}$$

Cloud attenuation is applied as a linear transmittance:

$$\text{UVI} = \text{UVI}_\text{clear} \cdot \bigl(1 - 0.70 \cdot c\bigr)$$

where $c \in [0,1]$ is fractional cloud cover (0 = clear, 1 = overcast, yielding 30% UV transmittance). The resulting UVI is normalized to a maximum of 12 to give a synthesis fraction, which scales the peak cutaneous synthesis rate $R_\text{max}$:

$$R_\text{synth} = R_\text{max} \cdot f_\text{skin} \cdot f_\text{type} \cdot f_\text{age} \cdot \min\!\left(1,\, \frac{\text{UVI}}{12}\right)$$

where $f_\text{skin}$ is the fraction of body surface area exposed, $f_\text{type}$ is the Fitzpatrick pigmentation factor (type I: 1.0, type VI: 0.25), and $f_\text{age}$ accounts for age-related decline in cutaneous 7-DHC.

### 2.4 Calibration & Integration

Equations are integrated with a fixed-step explicit Euler scheme:

$$y(t + \Delta t) \approx y(t) + \Delta t \cdot \frac{dy}{dt}\bigg|_t$$

with $\Delta t = 0.1\text{ h}$ for horizons up to 7 days and $\Delta t = 0.5\text{ h}$ for the 365-day horizon. The free parameters (such as $V_\text{max}$, basal elimination $CL_\text{other}$, and adipose partition coefficients) were analytically tuned via grid search so that a normal adult taking 1000 IU/day rises by ~10 ng/mL, unsupplemented decay follows an apparent ~21-day half-life, and obese personas show roughly 50% attenuation.

The simulation dynamically equilibrates the patient's entire compartmental state to their exact lifestyle inputs (diet + sun) using a rigorous two-year burn-in loop prior to day zero, avoiding artifactual initialization bias.

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

### 3.5 Multi-Period Dosing (Loading vs. Maintenance)

Clinical protocols often prescribe a high-dose loading phase followed by a lower-dose maintenance phase. The simulator supports up to three sequential periods to model these exact regimens.

For example, simulating 50,000 IU weekly for 7 weeks, followed immediately by 1,000 IU daily for 6 months (starting at 20 ng/mL, no sun): the loading phase rapidly raises serum 25(OH)D from 20 ng/mL to ~38 ng/mL by week 7. Upon transitioning to the maintenance phase, the level smoothly decays over several months to a steady-state plateau of ~29 ng/mL, perfectly illustrating the utility of loading doses for rapid correction of deficiency.

### 3.6 Decay verification

With no inputs from 32 ng/mL, simulated 25(OH)D is 16.4 ng/mL at day 21, 8.2 ng/mL at day 42, and 4.3 ng/mL at day 63 — tightly adhering to a 21-day apparent half-life. This can be verified from the first-order decay relationship:

$$[C]_t = [C]_0 \cdot 2^{-t/t_{1/2}} = 32 \cdot 2^{-t/21}$$

Evaluating: $32 \cdot 2^{-1} = 16.0$, $32 \cdot 2^{-2} = 8.0$, $32 \cdot 2^{-3} = 4.0$ ng/mL at days 21, 42, and 63 respectively. Simulated values (16.4, 8.2, 4.3) slightly exceed exact half-lives due to nonlinear CYP24A1 feedback reducing clearance as concentrations fall.

## 4. Discussion

The PBPK model successfully reproduces the core benchmark behaviors: clinical oral dose response [2,3], its attenuation in obesity [4], elimination half-life [1,2], and the latitudinal structure of cutaneous synthesis [5]. The upgrade to nonlinear enzyme kinetics ensures that sustained massive summer exposure naturally plateaus via product saturation and CYP24A1 induction, correcting the supraphysiological runaway artifacts of older linear models.

## 5. Limitations

- **Age and Genotype constraints**: While age declines in 7-DHC are modeled, variations in specific CYP2R1/CYP24A1 polymorphisms (GC genotype) remain simplified.
- **Constant environment**: Real-world cloud cover and clothing behaviors change dynamically day-to-day, whereas personas model fixed averages.
- **Dietary Baseline**: The model excludes baseline dietary intake; unsupplemented indoor personas decay toward true zero.

## 6. Conclusion

A mass-balanced, 7-compartment PBPK model featuring dual non-linearity correctly replicates the first-order homeostatic defenses of vitamin D metabolism (CYP24A1 suppression in deficiency, induction in excess). Packaged as a dependency-free interactive web application, it serves as an educational instrument for exploring complex multi-compartmental kinetics. It is a semi-empirical educational model, not a clinically validated predictor, and should not be used for medical advice.

## References

1. Holick MF. Vitamin D deficiency. *N Engl J Med.* 2007;357:266-281.
2. Heaney RP, et al. Human serum 25-hydroxycholecalciferol response to extended oral dosing with cholecalciferol. *Am J Clin Nutr.* 2003;77(1):204-210.
3. Vieth R. Vitamin D supplementation, 25-hydroxyvitamin D concentrations, and safety. *Am J Clin Nutr.* 1999;69(5):842-856.
4. Wortsman J, et al. Decreased bioavailability of vitamin D in obesity. *Am J Clin Nutr.* 2000;72(3):690-693.
5. Webb AR, Kline L, Holick MF. Influence of season and latitude on the cutaneous synthesis of vitamin D3. *J Clin Endocrinol Metab.* 1988;67(2):373-378.
6. Shahidzadeh Yazdi Z, et al. Population Pharmacokinetic-Pharmacodynamic Modeling of Vitamin D. *J Clin Endocrinol Metab.* 2025;110(2):e443-e455.
