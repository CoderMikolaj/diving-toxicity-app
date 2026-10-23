// Chart.js setup/update logic, kept separate from calculation and DOM wiring.

import { OTU_REFERENCE_LIMIT, ESOT_REFERENCE_LIMIT } from './toxicity.js';

let chartInstance = null;

function toPoints(times, values) {
  return times.map((t, i) => ({ x: t, y: values[i] }));
}

// Reference-line datasets aren't meaningful to inspect on hover, so the
// readout (see updateReadout) skips them by label.
const REFERENCE_LABELS = new Set(['100% limit', 'Surfacing']);

const IDLE_READOUT_TEXT = 'Hover the chart to see values at a given time.';

// Chart.js "external tooltip" hook: instead of the built-in floating tooltip
// (which, with 5 datasets and long labels, grew wide enough to cover the
// plotted lines), render a single compact line into a fixed element below
// the chart, so it never overlaps the data.
function updateReadout(readoutEl, context) {
  if (!readoutEl) return;
  const { tooltip } = context;
  const points = (tooltip.dataPoints ?? []).filter((dp) => !REFERENCE_LABELS.has(dp.dataset.label));

  if (tooltip.opacity === 0 || points.length === 0) {
    readoutEl.textContent = IDLE_READOUT_TEXT;
    readoutEl.classList.add('idle');
    return;
  }

  const t = Math.round(points[0].parsed.x);
  const parts = points.map((dp) => {
    const name = dp.dataset.shortLabel ?? dp.dataset.label;
    const pct = Math.round(dp.parsed.y);
    const { limit } = dp.dataset;
    if (!limit) return `${name} ${pct}%`;
    return `${name} ${Math.round((dp.parsed.y / 100) * limit)}/${limit} (${pct}%)`;
  });
  // Each item is its own span so a narrow screen wraps between items, not inside one.
  readoutEl.innerHTML = [`t = ${t} min`, ...parts].map((p) => `<span>${p}</span>`).join('');
  readoutEl.classList.remove('idle');
}

export function renderChart(
  canvas,
  simulation,
  { showCns = true, showOtu = true, showEsot = true } = {},
  readoutEl = null,
) {
  const datasets = [];

  if (showCns) {
    datasets.push({
      label: 'CNS (% of NOAA limit)',
      shortLabel: 'CNS',
      data: toPoints(simulation.times, simulation.cnsSeries),
      borderColor: '#e4572e',
      backgroundColor: '#e4572e',
      pointRadius: 0,
      borderWidth: 2,
      tension: 0.15,
    });
  }

  if (showOtu) {
    datasets.push({
      label: 'OTU (% of reference limit)',
      shortLabel: 'OTU',
      limit: OTU_REFERENCE_LIMIT,
      data: toPoints(simulation.times, simulation.otuPercentOfLimit),
      borderColor: '#2e86ab',
      backgroundColor: '#2e86ab',
      pointRadius: 0,
      borderWidth: 2,
      tension: 0.15,
    });
  }

  if (showEsot) {
    datasets.push({
      label: 'ESOT (% of 7-day daily limit)',
      shortLabel: 'ESOT',
      limit: ESOT_REFERENCE_LIMIT,
      data: toPoints(simulation.times, simulation.esotPercentOfLimit),
      borderColor: '#6a4c93',
      backgroundColor: '#6a4c93',
      pointRadius: 0,
      borderWidth: 2,
      tension: 0.15,
    });
  }

  const firstT = simulation.times[0];
  const lastT = simulation.times[simulation.times.length - 1];

  datasets.push({
    label: '100% limit',
    data: [
      { x: firstT, y: 100 },
      { x: lastT, y: 100 },
    ],
    borderColor: '#999999',
    borderDash: [6, 6],
    borderWidth: 1,
    pointRadius: 0,
    fill: false,
  });

  datasets.push({
    label: 'Surfacing',
    data: [
      { x: simulation.surfaceTime, y: 0 },
      { x: simulation.surfaceTime, y: 100 },
    ],
    borderColor: '#555555',
    borderDash: [2, 4],
    borderWidth: 1,
    pointRadius: 0,
    fill: false,
    rotation: 90, // the legend's 'line' defaults to horizontal
  });

  const config = {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      animation: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            pointStyle: 'line',
            // Thicker legend swatches than the plotted lines, which are too thin to tell apart.
            generateLabels: (chart) => Chart.defaults.plugins.legend.labels
              .generateLabels(chart)
              .map((item) => ({ ...item, lineWidth: 4 })),
          },
        },
        tooltip: {
          enabled: false,
          external: (context) => updateReadout(readoutEl, context),
        },
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Time (minutes)' },
        },
        y: {
          title: { display: true, text: '% of recommended limit' },
          beginAtZero: true,
        },
      },
    },
  };

  if (chartInstance) {
    chartInstance.data = config.data;
    chartInstance.options = config.options;
    chartInstance.update();
  } else {
    chartInstance = new Chart(canvas, config);
  }

  // Any previous hover position is stale against the freshly rendered data.
  if (readoutEl) {
    readoutEl.textContent = IDLE_READOUT_TEXT;
    readoutEl.classList.add('idle');
  }

  return chartInstance;
}
