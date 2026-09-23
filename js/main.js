import { simulateDive, OTU_REFERENCE_LIMIT, ESOT_SINGLE_EXPOSURE_LIMIT } from './toxicity.js';
import { renderChart } from './chart.js';

const form = document.getElementById('dive-form');
const errorBox = document.getElementById('form-error');
const summaryBox = document.getElementById('summary');
const canvas = document.getElementById('toxicity-chart');

// TODO: The inputs are validated in the HTML, so this function is not very useful right now.
function validateInputs({ durationMin, depthM, o2Percent }) {
  if (!(durationMin > 0)) return 'Dive duration must be greater than 0 minutes.';
  if (!(depthM >= 0) || depthM > 100) return 'Depth must be between 0 and 100 meters.';
  if (!(o2Percent >= 0) || o2Percent > 100) return 'O2 percentage must be between 0 and 100.';
  return null;
}

function renderSummary(simulation) {
  const cnsPct = simulation.cnsMax.toFixed(0);
  const otuVal = simulation.otuTotal.toFixed(0);
  const otuPct = ((simulation.otuTotal / OTU_REFERENCE_LIMIT) * 100).toFixed(0);
  const esotVal = simulation.esotAtSurface.toFixed(0);
  const esotPct = ((simulation.esotAtSurface / ESOT_SINGLE_EXPOSURE_LIMIT) * 100).toFixed(0);
  const po2 = simulation.divePo2.toFixed(2);

  summaryBox.innerHTML = `
    <p><strong>PO2 at depth:</strong> ${po2} ATA</p>
    <p><strong>Max CNS load:</strong> ${cnsPct}% of the NOAA single-exposure limit</p>
    <p><strong>Total OTU:</strong> ${otuVal} (~${otuPct}% of a common 300 OTU/day reference)</p>
    <p><strong>ESOT at surfacing:</strong> ${esotVal}
      (~${esotPct}% of the DMAC 35 ${ESOT_SINGLE_EXPOSURE_LIMIT} single-exposure limit)</p>
  `;
}

function handleSubmit(event) {
  event.preventDefault();
  errorBox.textContent = '';

  const durationMin = Number(form.duration.value);
  const depthM = Number(form.depth.value);
  const o2Percent = Number(form.o2percent.value);
  const showCns = form.showCns.checked;
  const showOtu = form.showOtu.checked;
  const showEsot = form.showEsot.checked;

  const error = validateInputs({ durationMin, depthM, o2Percent });
  if (error) {
    errorBox.textContent = error;
    return;
  }

  const simulation = simulateDive({ depthM, durationMin, o2Percent, postDiveMin: 240 });
  renderChart(canvas, simulation, { showCns, showOtu, showEsot });
  renderSummary(simulation);
}

form.addEventListener('submit', handleSubmit);

// Render once on load with the default input values so the page isn't empty.
handleSubmit(new Event('submit', { cancelable: true }));
