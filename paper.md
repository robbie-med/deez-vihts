# An Interactive Compartmental Pharmacokinetic Simulator of Cutaneous Synthesis and Oral Supplementation of Vitamin D

## Abstract

Vitamin D status is determined by the interplay of ultraviolet-B (UVB)-driven cutaneous synthesis, oral intake, body size, and slow whole-body kinetics. We present a deterministic, mass-balanced compartmental model of vitamin D3 (cholecalciferol) and serum 25-hydroxyvitamin D [25(OH)D], implemented as a dependency-free static web application. An empirical clear-sky UV-Index submodule drives a cutaneous previtamin D3 reservoir that approaches a photo-equilibrium plateau, so synthesis saturates within about one minimal erythemal dose and collapses in winter at high latitude. Metabolism includes saturable 25-hydroxylation (CYP2R1) and an indirect-response model of CYP24A1 induction; body size acts by volumetric dilution. A measured starting 25(OH)D is treated as a persistent individual trait: the model fits a single factor so that the persona's own inputs sustain the measured level at the start date's season, rather than letting it wash out as a transient. This is an educational, semi-empirical tool and has not been externally validated. All numbers are reproducible from `scripts/run-scenarios.mjs`.

## 1. Introduction

Vitamin D is unusual among vitamins in that the dominant source for most humans is not diet but cutaneous synthesis: UVB radiation (290–315 nm) photolyzes 7-dehydrocholesterol (7-DHC) in the skin to previtamin D3, which thermally isomerizes to cholecalciferol [1]. Cholecalciferol is hydroxylated in the liver to 25(OH)D, the major circulating form and the clinical biomarker of vitamin D status [1].

Serum 25(OH)D integrates inputs on very different timescales: a supplement dose is absorbed within hours, serum cholecalciferol clears within roughly a day, and 25(OH)D turns over with a half-life of several weeks [1,2]. Cutaneous input varies strongly with latitude, season, cloud cover, sunscreen, pigmentation, and exposed area [5], and saturates: prolonged exposure converts previtamin D3 to inert photoproducts rather than producing more [7,8]. Larger bodies show lower 25(OH)D for the same input, which is explained by volumetric dilution rather than adipose sequestration [4].

The simulator makes these dynamics explicit. Up to four personas can be compared over horizons from 24 hours to a decade.

## 2. Methods

### 2.1 State variables

All amounts are in nmol to enforce mass balance (1 µg = 40 IU = 2.5 nmol):

| Variable | Description |
|---|---|
| $G$ | Gut D3 |
| $S$ | Cutaneous previtamin D3 reservoir |
| $D$ | Circulating D3 |
| $C_c$ | Central (serum) 25(OH)D |
| $C_p$ | Peripheral 25(OH)D |
| $E$ | Relative CYP24A1 activity (dimensionless) |

Concentrations are amount over volume, e.g. $[D] = D / V_D$.

### 2.2 Body size

Every volume and clearance is scaled by $w = m_\text{body} / 75\text{ kg}$. Steady-state concentrations therefore scale as $1/w$ while half-lives are unchanged, reproducing the volumetric-dilution finding of Drincic et al. [4]. (An earlier version included a perfusion-limited adipose D3 compartment; with any realistic exchange rate it altered serum 25(OH)D by under 1%, and a peripheral compartment without its own elimination cannot change steady state, so it was removed.)

### 2.3 Skin

UV dose at the skin is counted in minimal erythemal doses (MED). With $\text{UVI}$ the UV index, 1 UVI-hour $= 0.9$ standard erythemal doses (SED), and the dose rate is

$$m = \frac{0.9 \cdot \text{UVI}}{\text{MED}_\text{type} \cdot \text{SPF}} \quad [\text{MED/h}]$$

with $\text{MED}_\text{type} = 2.5, 3, 4, 5, 8, 15$ SED for Fitzpatrick types I–VI. Previtamin D3 is formed from 7-DHC and photoconverted to lumisterol/tachysterol at rates both proportional to $m$, and leaves the reservoir by thermal isomerization and transfer to blood:

$$\frac{dS}{dt} = K_\text{pd}\, m\,\bigl(\phi(\alpha)\, S_\text{eq} - S\bigr) - K_\text{iso}\, S$$

$K_\text{pd} = 3$ per MED, so the reservoir is ~95% full after 1 MED. The plateau $S_\text{eq} = 1250\text{ nmol} \cdot f_\text{skin} \cdot f_\text{age}$ corresponds to ~20,000 IU for whole-body exposure of young skin [1]; $f_\text{age} = \max(0.25,\ 1 - 0.75\,(\text{age} - 20)/50)$ reflects the decline of epidermal 7-DHC with age. Because both formation and photoconversion scale with $m$, the plateau is independent of intensity and pigmentation. Darker skin or sunscreen only slows the approach to it [7]. $K_\text{iso} = 0.03$/h lumps isomerization and binding-protein transfer, so serum D3 peaks about a day after exposure.

At low solar elevation $\alpha$, ozone's longer slant path removes the short wavelengths that form previtamin D3 faster than the longer ones that photoconvert it, so the reachable plateau shrinks. This is modeled as

$$\phi(\alpha) = \min\!\left(1,\ \left(\frac{\sin\alpha}{0.9}\right)^{4}\right)$$

which reproduces the absence of synthesis at 42°N from November to February [5]. The reservoir equation is integrated exactly over each time step, since the photoreaction is too fast for explicit Euler at $\Delta t = 1$ h. Exposure is a window of the chosen length centered on solar noon.

### 2.4 Gut and circulating D3

$$\frac{dG}{dt} = \dot m_\text{diet} + \dot m_\text{oral} - K_a G, \qquad K_a = 0.1\text{ /h}$$

$$\frac{dD}{dt} = K_a G + K_\text{iso} S - V_{25} - CL_D\,[D], \qquad V_{25} = \frac{V_\text{max}\,[D]}{K_m + [D]}$$

with $V_\text{max} = 100\,w$ nmol/h, $K_m = 50$ nmol/L, $V_D = 15.5\,w$ L. The competing disposal pathway $CL_D$ sets the fraction of D3 that is 25-hydroxylated. At low concentration this fraction is $f = k_{25} / (k_{25} + CL_D)$ with $k_{25} = V_\text{max}/K_m$, equal to 1/6 at the reference $CL_D = 10\,w$ L/h. Saturation of $V_{25}$ only matters for large boluses. The D3 equation is integrated exactly at the current linearized rate.

### 2.5 25(OH)D and CYP24A1

$$\frac{dC_c}{dt} = V_{25} - Q_{25}\bigl([C_c] - [C_p]\bigr) - \bigl(CL_\text{24}\,E + CL_\text{other}\bigr)[C_c], \qquad \frac{dC_p}{dt} = Q_{25}\bigl([C_c] - [C_p]\bigr)$$

$$S_c = H_\text{min} + \frac{(H_\text{max} - H_\text{min})\,[C_c]^\gamma}{EC_{50}^\gamma + [C_c]^\gamma}, \qquad \frac{dE}{dt} = K_\text{out}\,(S_c - E)$$

with $V_c = 4.35\,w$ L, $V_p = 6.87\,w$ L, $Q_{25} = 0.0507\,w$ L/h, $CL_\text{24} = CL_\text{other} = 0.0075\,w$ L/h, $H_\text{min} = 0.1$, $H_\text{max} = 1$, $EC_{50} = 55$ nmol/L, $\gamma = 2.5$, $K_\text{out} = 0.02$/h [6]. Induction roughly doubles clearance between deficiency and sufficiency.

### 2.6 Initialization and the measured starting level

Before day zero the persona's baseline lifestyle (diet and sun, no supplements) is run for two years, ending on the chosen start date, so the initial state lies on the periodic steady state for that season.

If a measured starting 25(OH)D is entered, a single individual factor is fitted so that this burn-in ends at the measured level. Treating the measurement merely as an initial condition would be wrong: with a ~3-week half-life, any starting value is forgotten within 4–5 months and the curve converges to whatever the inputs imply. A person measured at 5 ng/mL would then "normalize" on their own. One measurement cannot distinguish the cause of the gap, so the user chooses:

- **Dose response** (default): the factor $r$ multiplies the 25-hydroxylated fraction of *all* D3, supplements included ($f = r/6$, implemented through $CL_D = k_{25}(1/f - 1)$, which keeps mass balance). This represents malabsorption, genotype, or other poor response; supplements are blunted accordingly. $0.02 \le r \le 5.5$.
- **Sun + diet only**: the factor multiplies baseline diet and skin synthesis, i.e. the person's effective exposure differs from what was entered, and supplements act at full strength.

Because the steady-state level is close to proportional to either factor, a multiplicative fixed-point iteration converges in a few burn-ins. If the inputs cannot sustain the measured level even at the factor's bound (for example zero diet and no sun), the model starts at the measured level and lets it drift, and the UI says so.

The shaded band re-runs the persona as a 0.8× and 1.25× responder. With a measured start, all three runs begin at the measurement.

### 2.7 Integration

Fixed-step explicit Euler for $G$, $C_c$, $C_p$ and $E$ with $\Delta t = 0.1$ h (≤ 7 days), 0.5 h (≤ 30 days) or 1 h, and exact exponential steps for $S$ and $D$.

## 3. Results

All numbers below are produced by `node scripts/run-scenarios.mjs`.

### 3.1 The classic three-way comparison

Three personas at 40°N from January 1, no supplement, 400 IU/day diet, age 40: **Outdoor** (75 kg, 2 h midday sun daily, 25% skin, type III), **Obese** (120 kg, same sun), **Indoor** (75 kg, no sun).

| Persona | Min | Mean | Max | Year-end (ng/mL) | Skin synthesis |
|---|---|---|---|---|---|
| Outdoor | 11.2 | 20.8 | 30.2 | 11.9 | 370,000 IU/yr |
| Obese | 7.9 | 14.6 | 21.2 | 8.6 | 370,000 IU/yr |
| Indoor | 7.9 | 7.9 | 7.9 | 7.9 | 0 |

The outdoor persona peaks in late summer and falls to deficiency by late winter; the obese persona's levels are about 70% of the outdoor persona's throughout.

### 3.2 A profoundly low measured starting level stays low

Outdoor persona, measured at 5 ng/mL on January 1 (fitted factor 0.32 in either mode):

| Scenario | d0 | d90 | d180 | d270 | d365 | d730 |
|---|---|---|---|---|---|---|
| No supplement | 5.0 | 6.4 | 12.0 | 10.5 | 5.0 | 5.0 |
| 4000 IU/d, dose-response fit | 5.0 | 22.3 | 26.9 | 25.3 | 21.7 | 20.1 |
| 4000 IU/d, sun + diet fit | 5.0 | 49.2 | 55.4 | 53.7 | 50.0 | 45.3 |

Without treatment the person follows their own, scaled-down seasonal cycle and returns to 5 ng/mL each winter. The response to supplementation depends on which explanation is chosen. (In the 730-day supplemented runs the 104-week supplement phase ends on day 728, so d730 already reflects two days off.)

### 3.3 Oral dose response and body size

1000 IU/day for 180 days, no sun:

| Persona | Control | Dosed | Dose-attributable rise |
|---|---|---|---|
| 75 kg, 1500 IU/d diet | 22.2 | 32.7 | +10.5 ng/mL |
| 75 kg, 400 IU/d diet | 7.9 | 21.1 | +13.2 ng/mL |
| 120 kg, 400 IU/d diet | 5.1 | 14.9 | +9.8 ng/mL |

The rise from a ~20 ng/mL baseline matches the ~1 ng/mL per 100 IU/day of Heaney et al. [2,3]. The response is steeper from a lower baseline, where CYP24A1 is less induced. The 120 kg persona responds with 74% of the 75 kg rise, slightly above pure dilution (63%) because its lower concentrations induce less CYP24A1.

### 3.4 Latitude and season

Daily skin synthesis (IU/day; 2 h midday window, 25% skin, type III, age 40):

| Latitude | Jan 15 | Mar 20 | Jun 21 | Sep 22 | Dec 21 |
|---|---|---|---|---|---|
| 0° | 1,885 | 1,888 | 1,845 | 1,888 | 1,845 |
| 20°N | 832 | 1,885 | 1,888 | 1,885 | 726 |
| 35°N | 244 | 1,135 | 1,887 | 1,158 | 192 |
| 40°N | 133 | 862 | 1,886 | 883 | 98 |
| 50°N | 21 | 419 | 1,735 | 434 | 12 |
| 60°N | 0 | 144 | 1,138 | 152 | 0 |

Where the sun is high, the plateau caps synthesis at the same value regardless of latitude. At high latitude in winter it collapses.

### 3.5 Exposure time, pigmentation and sunscreen

Daily synthesis at 40°N on June 21 (IU/day, 25% skin, age 40):

| Minutes | Type I | Type III | Type VI | Type III, SPF 15 |
|---|---|---|---|---|
| 10 | 1,675 | 1,501 | 790 | 264 |
| 20 | 1,795 | 1,730 | 1,176 | 475 |
| 30 | 1,812 | 1,789 | 1,394 | 647 |
| 60 | 1,841 | 1,835 | 1,681 | 1,011 |
| 120 | 1,892 | 1,886 | 1,834 | 1,394 |
| 240 | 1,830 | 1,843 | 1,873 | 1,669 |

For fair skin, 10–20 minutes of summer midday sun gets most of the achievable synthesis. Type VI skin needs about an hour to reach the same plateau, consistent with Clemens et al. [7]. Very long windows slightly reduce yield for fair skin: early- and late-day sun has a lower plateau and photoconverts part of the reservoir.

### 3.6 Decay

With no inputs from a measured 32 ng/mL: 17.9 ng/mL at day 21, 11.9 at day 42, 8.1 at day 63. The initial half-life is ~24 days and lengthens as CYP24A1 activity falls with concentration.

### 3.7 Loading then maintenance

Indoor persona measured at 12 ng/mL (sun + diet fit), 50,000 IU weekly for 8 weeks, then 1000 IU daily: 43.9 ng/mL at day 28, 56.8 at day 56, easing to 24.6 by day 180 and 23.2 at one year.

## 4. Discussion

The model reproduces oral dose response [2,3], volumetric dilution with body size [4], the approximate 25(OH)D half-life [1,2], the vitamin D winter [5], saturation of cutaneous synthesis [8], and slower synthesis in darker skin [7]. The most important structural decision is how a measured starting level is used. Fitting a persistent factor makes the simulated person's deficiency a property of the person rather than an artifact that decays away, and exposes the one choice the data cannot make (poor response versus low effective exposure) to the user.

Several mechanisms that sound important contribute little. Saturable 25-hydroxylation only matters for large boluses, CYP24A1 induction changes steady-state levels by about 5%, and adipose exchange of D3 was negligible and has been removed.

## 5. Limitations

- **Single measurement**: one 25(OH)D value identifies one factor. It cannot separate absorption, genotype, and unreported exposure. The fit mode is a modeling assumption, not an inference.
- **Skin calibration**: the plateau size (~20,000 IU per whole-body MED) and the spectral factor $\phi$ are empirical and uncertain by a factor of ~2.
- **No long-term tissue stores**: slow release of stored D3, which may prolong levels after supplements stop, is not modeled.
- **Constant environment**: cloud cover, clothing and time outdoors are fixed averages.
- **Body size**: dilution is scaled by total weight. Lean-mass or BMI-specific effects beyond dilution are not modeled.

## 6. Conclusion

A compact, mass-balanced model with a saturating skin reservoir, weight-scaled kinetics and a persistent individual factor fitted to a measured level reproduces the main behaviors of vitamin D status in a transparent, interactive form. It is a semi-empirical educational model, not a clinically validated predictor, and should not be used for medical advice.

## References

1. Holick MF. Vitamin D deficiency. *N Engl J Med.* 2007;357:266-281.
2. Heaney RP, et al. Human serum 25-hydroxycholecalciferol response to extended oral dosing with cholecalciferol. *Am J Clin Nutr.* 2003;77(1):204-210.
3. Vieth R. Vitamin D supplementation, 25-hydroxyvitamin D concentrations, and safety. *Am J Clin Nutr.* 1999;69(5):842-856.
4. Drincic AT, Armas LAG, Van Diest EE, Heaney RP. Volumetric dilution, rather than sequestration best explains the low vitamin D status of obesity. *Obesity.* 2012;20(7):1444-1448.
5. Webb AR, Kline L, Holick MF. Influence of season and latitude on the cutaneous synthesis of vitamin D3. *J Clin Endocrinol Metab.* 1988;67(2):373-378.
6. Shahidzadeh Yazdi Z, et al. Population Pharmacokinetic-Pharmacodynamic Modeling of Vitamin D. *J Clin Endocrinol Metab.* 2025;110(2):e443-e455.
7. Clemens TL, Adams JS, Henderson SL, Holick MF. Increased skin pigment reduces the capacity of skin to synthesise vitamin D3. *Lancet.* 1982;1(8263):74-76.
8. MacLaughlin JA, Anderson RR, Holick MF. Spectral character of sunlight modulates photosynthesis of previtamin D3 and its photoisomers in human skin. *Science.* 1982;216(4549):1001-1003.
