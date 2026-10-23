import { simulateDive, OTU_REFERENCE_LIMIT, ESOT_SINGLE_EXPOSURE_LIMIT } from './toxicity.js';
import { renderChart } from './chart.js';

const form = document.getElementById('dive-form');
const errorBox = document.getElementById('form-error');
const summaryBox = document.getElementById('summary');
const canvas = document.getElementById('toxicity-chart');

// TODO: The inputs are validated in the HTML, so this function is not very useful right now.
function validateInputs({ durationMin, depthM, mode, o2Percent, po2Set }) {
  if (!(durationMin > 0)) return 'Dive duration must be greater than 0 minutes.';
  if (mode === 'ccr') {
    if (!(po2Set >= 0.21) || po2Set > 3) return 'PO2 setpoint must be between 0.21 and 3 ATA.';
  } else {
    if (!(depthM >= 0) || depthM > 100) return 'Depth must be between 0 and 100 meters.';
    if (!(o2Percent >= 0) || o2Percent > 100) return 'O2 percentage must be between 0 and 100.';
  }
  return null;
}

// Toggles which fields are shown and required to match the selected
// breathing system. Depth is OC-only — CCR holds PO2 at the setpoint
// regardless of depth, so the field would otherwise do nothing.
function updateModeUI() {
  const isCcr = form.mode.value === 'ccr';
  document.getElementById('field-depth').classList.toggle('hidden', isCcr);
  document.getElementById('field-o2percent').classList.toggle('hidden', isCcr);
  document.getElementById('field-po2setpoint').classList.toggle('hidden', !isCcr);
  form.depth.required = !isCcr;
  form.o2percent.required = !isCcr;
  form.po2setpoint.required = isCcr;
}

function renderSummary(simulation) {
  const cnsPct = simulation.cnsMax.toFixed(0);
  const otuVal = simulation.otuTotal.toFixed(0);
  const otuPct = ((simulation.otuTotal / OTU_REFERENCE_LIMIT) * 100).toFixed(0);
  const esotVal = simulation.esotAtSurface.toFixed(0);
  const esotPct = ((simulation.esotAtSurface / ESOT_SINGLE_EXPOSURE_LIMIT) * 100).toFixed(0);
  const po2 = simulation.divePo2.toFixed(2);
  const po2Label = simulation.mode === 'ccr' ? 'PO2 (setpoint)' : 'PO2 at depth';

  summaryBox.innerHTML = `
    <p><strong>${po2Label}:</strong> ${po2} ATA</p>
    <p><strong>Max CNS load:</strong> ${cnsPct}% of the NOAA single-exposure limit</p>
    <p><strong>Total OTU:</strong> ${otuVal} (~${otuPct}% of a common 300 OTU/day reference)</p>
    <p><strong>ESOT at surfacing:</strong> ${esotVal}
      (~${esotPct}% of the DMAC 35 ${ESOT_SINGLE_EXPOSURE_LIMIT} single-exposure limit)</p>
  `;
}

function handleSubmit(event) {
  event.preventDefault();
  errorBox.textContent = '';

  const mode = form.mode.value;
  const durationMin = Number(form.duration.value);
  const depthM = mode === 'oc' ? Number(form.depth.value) : undefined;
  const o2Percent = mode === 'oc' ? Number(form.o2percent.value) : undefined;
  const po2Set = mode === 'ccr' ? Number(form.po2setpoint.value) : undefined;
  const showCns = form.showCns.checked;
  const showOtu = form.showOtu.checked;
  const showEsot = form.showEsot.checked;

  const error = validateInputs({ durationMin, depthM, mode, o2Percent, po2Set });
  if (error) {
    errorBox.textContent = error;
    return;
  }

  const simulation = simulateDive({ depthM, durationMin, mode, o2Percent, po2Set, postDiveMin: 240 });
  renderChart(canvas, simulation, { showCns, showOtu, showEsot });
  renderSummary(simulation);
}

form.addEventListener('submit', handleSubmit);

// Mode and index-visibility toggles re-render immediately; number fields
// still need Calculate.
const liveFields = ['mode', 'showCns', 'showOtu', 'showEsot'];
form.addEventListener('change', (event) => {
  if (!liveFields.includes(event.target.name)) return;
  if (event.target.name === 'mode') updateModeUI();
  handleSubmit(event);
});

// Sync the field visibility to whatever mode is checked by default, in case
// the HTML's default ever drifts from this.
updateModeUI();

// Render once on load with the default input values so the page isn't empty.
handleSubmit(new Event('submit', { cancelable: true }));
