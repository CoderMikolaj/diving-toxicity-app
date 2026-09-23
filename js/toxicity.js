// Pure calculation functions for oxygen toxicity indexes.
// No DOM access here — kept separate so the math stays easy to read/verify.

// NOAA-style single-exposure PO2 -> max exposure time table (descending by PO2).
export const CNS_TABLE = [
  { po2: 1.6, maxMinutes: 45 },
  { po2: 1.5, maxMinutes: 120 },
  { po2: 1.4, maxMinutes: 150 },
  { po2: 1.3, maxMinutes: 180 },
  { po2: 1.2, maxMinutes: 210 },
  { po2: 1.1, maxMinutes: 240 },
  { po2: 1.0, maxMinutes: 300 },
  { po2: 0.9, maxMinutes: 360 },
  { po2: 0.8, maxMinutes: 450 },
  { po2: 0.7, maxMinutes: 570 },
  { po2: 0.6, maxMinutes: 720 },
];

// Illustrative reference used only to express OTU as a comparable percentage.
// NOAA does not define a single-dive OTU cutoff the way it does for CNS%; this
// is a commonly-cited recommended daily OTU value, not an official limit.
export const OTU_REFERENCE_LIMIT = 300;

// DMAC 35 Rev 1 (Feb 2025) single-exposure ESOT limit, the counterpart to
// OTU_REFERENCE_LIMIT above. The multi-day limits are 500/day over five
// consecutive days and 450/day over seven.
export const ESOT_SINGLE_EXPOSURE_LIMIT = 660;

export function po2FromDepth(depthM, fo2) {
  return (depthM / 10 + 1) * fo2;
}

function cnsRatePercentPerMin(po2) {
  const shallowest = CNS_TABLE[CNS_TABLE.length - 1];
  const deepest = CNS_TABLE[0];

  if (po2 < shallowest.po2) return 0; // below ~0.6 ATA: no CNS loading in this model

  if (po2 >= deepest.po2) {
    // Extrapolate above 1.6 ATA using the slope of the steepest table segment,
    // floored so the rate can't blow up to infinity.
    const next = CNS_TABLE[1];
    const slope = (next.maxMinutes - deepest.maxMinutes) / (next.po2 - deepest.po2);
    const extrapolatedMax = deepest.maxMinutes + slope * (po2 - deepest.po2);
    const maxMinutes = Math.max(extrapolatedMax, 1);
    return 100 / maxMinutes;
  }

  for (let i = 0; i < CNS_TABLE.length - 1; i++) {
    const upper = CNS_TABLE[i];
    const lower = CNS_TABLE[i + 1];
    if (po2 <= upper.po2 && po2 >= lower.po2) {
      const frac = (po2 - lower.po2) / (upper.po2 - lower.po2);
      const maxMinutes = lower.maxMinutes + frac * (upper.maxMinutes - lower.maxMinutes);
      return 100 / maxMinutes;
    }
  }
  return 0;
}

// Post-dive CNS recovery: exponential decay toward 0 from the load carried at
// surfacing, `elapsedMin` minutes into the surface interval.
export function cnsAfterRecovery(cnsAtSurface, elapsedMin) {
  // Simplified half-time (minutes), as used by several dive computers. Real
  // recovery is more nuanced than a single exponential.
  const CNS_HALF_TIME_MIN = 90;

  return cnsAtSurface * Math.pow(0.5, elapsedMin / CNS_HALF_TIME_MIN);
}

function otuRatePerMin(po2) {
  if (po2 <= 0.5) return 0;
  return Math.pow((po2 - 0.5) / 0.5, 0.83);
}

// --- ESOT: pulmonary oxygen toxicity -----------------------------------
// Note there is deliberately no lower PO2 cut-off here, unlike OTU: DMAC 35
// tabulates ESOT down to 0.5 ATA (k = 0.21) and counts it. The exclusion in
// the guidance is by breathing gas — air-only dives are simply not scored —
// so callers should pass hyperoxic segments only, never surface intervals.

// ESOT contributed by one constant-PO2 segment. Time in minutes.
// ESOT is Arieli's pulmonary power equation rewritten as "minutes of surface
// O2": since the index is K = t^2 * PO2^4.57, the equivalent time at PO2 = 1
// is t * PO2^(4.57/2). DMAC 35 Rev 1 adopted it in place of UPTD/OTU.
export function esotFromExposure(po2, exposureMin) {
  const po2Exponent = 4.57 / 2;
  return exposureMin * Math.pow(po2, po2Exponent);
}

// Multi-segment dives simply sum: the index is quadratic in time, so its
// square root (which is what ESOT is) adds linearly.
export function esotFromSegments(segments) {
  return segments.reduce((total, seg) => total + esotFromExposure(seg.po2, seg.exposureMin), 0);
}

// ESOT remaining after a normoxic surface interval, per the ESOT recovery
// model. Both times in HOURS; exposureHours is the total hyperoxic exposure
// time being recovered from (accumulated across the day, per DMAC 35).
export function esotAfterRecovery(esot, exposureHours, recoveryHours) {
  // Coefficients of the published model: ESOT * exp(-r * s^t_exp * t).
  const r = 0.439;
  const s = 0.906;

  const f = r * recoveryHours * Math.pow(s, exposureHours);
  return esot * Math.exp(-f);
}

// The alternative recovery model, from Arieli's K formula. Recovery here
// depends on the PO2 of the preceding exposure rather than its duration.
export function esotAfterRecoveryArieliK(esot, previousPo2, recoveryHours) {
  // Arieli's K-scale recovery is exp(-(-0.42 + 0.384 * PO2) * t); these are
  // half those coefficients, because applying them to ESOT (the square root
  // of K) reproduces the published decay on K. Below 1.1 ATA the paper says
  // to use the 1.1 ATA time constant rather than extrapolating.
  const intercept = 0.42 / 2;
  const slope = 0.384 / 2;
  const minPo2 = 1.1;

  const po2 = Math.max(minPo2, previousPo2);
  return esot * Math.exp((intercept - slope * po2) * recoveryHours);
}

export function arieliKFromEsot(esot) {
  return Math.pow(esot / 60, 2);
}

// Expected reduction in vital capacity, in percentage points.
export function vcReductionFromEsot(esot) {
  const coefficient = 0.0082; // %VC = 0.0082 * K, with K in hours^2
  return coefficient * arieliKFromEsot(esot);
}

// Runs a series of dives through accumulation and recovery, returning the
// accumulated ESOT after each one. Each dive is
// { surfaceIntervalHours, durationHours, po2 } — note HOURS, matching the R.
// A surface interval of `resetAfterHours` zeroes the ESOT clock (DMAC 35);
// that rule belongs to the ESOT recovery model only, not to Arieli's decay.
export function accumulateEsotOverDives(
  dives,
  { useArieliKRecovery = true, resetAfterHours = 12 } = {},
) {
  let esot = 0;
  let firstDiveAfterReset = 0;

  return dives.map((dive, i) => {
    let exposureHours = 0;
    for (let j = firstDiveAfterReset; j < i; j++) {
      exposureHours += dives[j].durationHours;
    }

    // Fully recovered — reset the model. Only the ESOT recovery model has
    // this rule; Arieli's decay is continuous and carries no reset.
    // WARNING: I am not sure if this reset should be done if ESOT > 500
    if (!useArieliKRecovery && dive.surfaceIntervalHours >= resetAfterHours) {
      firstDiveAfterReset = i;
      exposureHours = 0;
      esot = 0;
    }

    if (i > 0) {
      esot = useArieliKRecovery
        ? esotAfterRecoveryArieliK(esot, dives[i - 1].po2, dive.surfaceIntervalHours)
        : esotAfterRecovery(esot, exposureHours, dive.surfaceIntervalHours);
    }

    esot += esotFromExposure(dive.po2, dive.durationHours * 60);
    return { ...dive, esotAccumulated: esot };
  });
}

// --- Arieli CNS-OT K ---------------------------------------------------
// Accumulation and recovery are one function here because the model switches
// between them on PO2 alone. Above the threshold the square root of K grows
// linearly with time; below it, K decays exponentially.
export function cnsOtKStep(initialK, po2, exposureMin) {
  // K = t^2 * PO2^6.8 with t in MINUTES — Arieli's CNS index, separate from
  // the pulmonary one above.
  const po2Exponent = 6.8;
  const thresholdPo2 = 1.3;
  const recoveryPerMin = 0.079;

  if (po2 >= thresholdPo2) {
    const growth = exposureMin * Math.pow(po2, po2Exponent / 2);
    return Math.pow(Math.sqrt(initialK) + growth, 2);
  }
  return initialK * Math.exp(-recoveryPerMin * exposureMin);
}

// Walks a PO2 profile one step at a time. `stepsMin` is either one duration
// applied to every sample or a per-sample array.
export function cnsOtK(po2Series, stepsMin, initialK = 0) {
  const durations = Array.isArray(stepsMin)
    ? stepsMin
    : new Array(po2Series.length).fill(stepsMin);

  return po2Series.reduce((k, po2, i) => cnsOtKStep(k, po2, durations[i]), initialK);
}

// Simulates a square-profile dive (constant depth, instant descent/ascent)
// followed by a surface interval, at 1-minute resolution.
export function simulateDive({ depthM, durationMin, o2Percent, postDiveMin = 240 }) {
  const stepMin = 1;
  const fo2 = o2Percent / 100;
  const divePo2 = po2FromDepth(depthM, fo2);
  const surfacePo2 = 0.21;

  const cnsRate = cnsRatePercentPerMin(divePo2);
  const otuRate = otuRatePerMin(divePo2);
  // ESOT is linear in time at a constant PO2, so a per-minute rate works the
  // same way the other two do.
  const esotRate = esotFromExposure(divePo2, stepMin);

  const times = [0];
  const po2Series = [divePo2];
  const cnsSeries = [0];
  const otuSeries = [0];
  const esotSeries = [0];

  let cns = 0;
  let otu = 0;
  let esot = 0;
  let t = 0;

  while (t < durationMin) {
    const dt = Math.min(stepMin, durationMin - t);
    cns += cnsRate * dt;
    otu += otuRate * dt;
    esot += esotRate * dt;
    t += dt;
    times.push(t);
    po2Series.push(divePo2);
    cnsSeries.push(cns);
    otuSeries.push(otu);
    esotSeries.push(esot);
  }

  const cnsAtSurface = cns;
  const otuTotal = otu;
  const esotAtSurface = esot;
  const surfaceTime = durationMin;

  let tPost = 0;
  while (tPost < postDiveMin) {
    const dt = Math.min(stepMin, postDiveMin - tPost);
    tPost += dt;
    const decayed = cnsAfterRecovery(cnsAtSurface, tPost);
    // Unlike OTU, ESOT has a published surface-interval recovery model. The
    // exposure being recovered from is this single dive, hence durationMin.
    const esotRecovered = esotAfterRecovery(esotAtSurface, durationMin / 60, tPost / 60);
    times.push(surfaceTime + tPost);
    po2Series.push(surfacePo2);
    cnsSeries.push(decayed);
    otuSeries.push(otuTotal); // no recovery modeled within this window
    esotSeries.push(esotRecovered);
  }

  return {
    times,
    po2Series,
    cnsSeries, // already expressed as % of the NOAA single-exposure limit
    otuSeries,
    otuPercentOfLimit: otuSeries.map((v) => (v / OTU_REFERENCE_LIMIT) * 100),
    esotSeries,
    esotPercentOfLimit: esotSeries.map((v) => (v / ESOT_SINGLE_EXPOSURE_LIMIT) * 100),
    divePo2,
    cnsMax: Math.max(...cnsSeries),
    otuTotal,
    esotAtSurface,
    surfaceTime,
  };
}
