// Chart.js setup/update logic, kept separate from calculation and DOM wiring.

let chartInstance = null;

function toPoints(times, values) {
  return times.map((t, i) => ({ x: t, y: values[i] }));
}

export function renderChart(
  canvas,
  simulation,
  { showCns = true, showOtu = true, showEsot = true } = {},
) {
  const datasets = [];

  if (showCns) {
    datasets.push({
      label: 'CNS oxygen toxicity (% of limit)',
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
      label: 'Pulmonary O2 toxicity, OTU (% of reference limit)',
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
      label: 'Pulmonary O2 toxicity, ESOT (% of single-exposure limit)',
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
      { x: simulation.surfaceTime, y: 120 },
    ],
    borderColor: '#555555',
    borderDash: [2, 4],
    borderWidth: 1,
    pointRadius: 0,
    fill: false,
  });

  const config = {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      animation: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            title: (items) => `t = ${items[0].parsed.x} min`,
          },
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
  return chartInstance;
}
