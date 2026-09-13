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

// Simplified post-dive CNS recovery half-time (minutes), as used by several
// dive computers. Real recovery is more nuanced than a single exponential.
export const CNS_HALF_TIME_MIN = 90;

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

function otuRatePerMin(po2) {
  if (po2 <= 0.5) return 0;
  return Math.pow((po2 - 0.5) / 0.5, 0.83);
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

  const times = [0];
  const po2Series = [divePo2];
  const cnsSeries = [0];
  const otuSeries = [0];

  let cns = 0;
  let otu = 0;
  let t = 0;

  while (t < durationMin) {
    const dt = Math.min(stepMin, durationMin - t);
    cns += cnsRate * dt;
    otu += otuRate * dt;
    t += dt;
    times.push(t);
    po2Series.push(divePo2);
    cnsSeries.push(cns);
    otuSeries.push(otu);
  }

  const cnsAtSurface = cns;
  const otuTotal = otu;
  const surfaceTime = durationMin;

  let tPost = 0;
  while (tPost < postDiveMin) {
    const dt = Math.min(stepMin, postDiveMin - tPost);
    tPost += dt;
    const decayed = cnsAtSurface * Math.pow(0.5, tPost / CNS_HALF_TIME_MIN);
    times.push(surfaceTime + tPost);
    po2Series.push(surfacePo2);
    cnsSeries.push(decayed);
    otuSeries.push(otuTotal); // no recovery modeled within this window
  }

  return {
    times,
    po2Series,
    cnsSeries, // already expressed as % of the NOAA single-exposure limit
    otuSeries,
    otuPercentOfLimit: otuSeries.map((v) => (v / OTU_REFERENCE_LIMIT) * 100),
    divePo2,
    cnsMax: Math.max(...cnsSeries),
    otuTotal,
    surfaceTime,
  };
}
