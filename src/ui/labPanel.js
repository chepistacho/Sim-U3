function rangeRow(parent, label, object, key, min, max, step, onInput, getValue) {
  const wrap = document.createElement('div');
  wrap.className = 'row';
  const lab = document.createElement('label');
  const name = document.createElement('span');
  const value = document.createElement('span');
  value.className = 'value';
  name.textContent = label;
  lab.append(name, value);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(object[key]);
  const refresh = () => {
    object[key] = Number(input.value);
    value.textContent = Number(input.value).toFixed(step < 0.01 ? 3 : 2);
    onInput?.(object[key]);
  };
  input.addEventListener('input', refresh);
  refresh();
  wrap.append(lab, input);
  parent.append(wrap);
  return {
    input,
    refresh() {
      if (getValue) {
        const next = Number(getValue());
        object[key] = next;
        input.value = String(next);
        value.textContent = next.toFixed(step < 0.01 ? 3 : 2);
      }
    }
  };
}

function checkRow(parent, label, initial, onChange, getValue) {
  const wrap = document.createElement('div');
  wrap.className = 'row';
  const lab = document.createElement('label');
  const name = document.createElement('span');
  name.textContent = label;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = initial;
  input.addEventListener('change', () => onChange(input.checked));
  lab.append(name, input);
  wrap.append(lab);
  parent.append(wrap);
  return {
    input,
    refresh() { if (getValue) input.checked = Boolean(getValue()); }
  };
}

function button(parent, label, onClick) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  parent.append(b);
  return b;
}

export function createLabPanel({ params, onReset, onPreset, onModeChange, onPauseChange }) {
  const refreshers = [];
  const panel = document.createElement('aside');
  panel.className = 'panel';
  panel.innerHTML = `
    <h1>U3 · Forces Instrument</h1>
    <p>LAB: aísla fuerzas, predice y prueba. <strong>P</strong> cambia a PERFORMANCE.</p>
  `;

  const sim = document.createElement('div');
  sim.className = 'group';
  sim.innerHTML = '<h2>Simulación</h2>';
  panel.append(sim);

  const state = {
    timeScale: params.timeScale.value,
    maxSpeed: params.maxSpeed.value,
    particleSize: params.particleSize.value,
    radialStrength: params.radialStrength.value,
    vortexStrength: params.vortexStrength.value,
    dragCoefficient: params.dragCoefficient.value,
    windX: params.wind.value.x,
    windY: params.wind.value.y
  };

  refreshers.push(rangeRow(sim, 'timeScale', state, 'timeScale', 0, 2, 0.01, (v) => params.timeScale.value = v, () => params.timeScale.value));
  refreshers.push(rangeRow(sim, 'maxSpeed', state, 'maxSpeed', 0.2, 12, 0.1, (v) => params.maxSpeed.value = v, () => params.maxSpeed.value));
  refreshers.push(rangeRow(sim, 'particleSize', state, 'particleSize', 0.005, 0.1, 0.001, (v) => params.particleSize.value = v, () => params.particleSize.value));

  const force = document.createElement('div');
  force.className = 'group';
  force.innerHTML = '<h2>Fuerzas</h2>';
  panel.append(force);

  refreshers.push(checkRow(force, 'Radial', params.radialEnabled.value > 0, (v) => params.radialEnabled.value = v ? 1 : 0, () => params.radialEnabled.value > 0));
  refreshers.push(rangeRow(force, 'radialStrength', state, 'radialStrength', -8, 8, 0.05, (v) => params.radialStrength.value = v, () => params.radialStrength.value));
  refreshers.push(checkRow(force, 'Vórtice', params.vortexEnabled.value > 0, (v) => params.vortexEnabled.value = v ? 1 : 0, () => params.vortexEnabled.value > 0));
  refreshers.push(rangeRow(force, 'vortexStrength', state, 'vortexStrength', -8, 8, 0.05, (v) => params.vortexStrength.value = v, () => params.vortexStrength.value));
  refreshers.push(checkRow(force, 'Drag', params.dragEnabled.value > 0, (v) => params.dragEnabled.value = v ? 1 : 0, () => params.dragEnabled.value > 0));
  refreshers.push(rangeRow(force, 'dragCoefficient', state, 'dragCoefficient', 0, 1, 0.01, (v) => params.dragCoefficient.value = v, () => params.dragCoefficient.value));
  refreshers.push(checkRow(force, 'Viento', params.windEnabled.value > 0, (v) => params.windEnabled.value = v ? 1 : 0, () => params.windEnabled.value > 0));
  refreshers.push(rangeRow(force, 'wind.x', state, 'windX', -4, 4, 0.05, (v) => params.wind.value.x = v, () => params.wind.value.x));
  refreshers.push(rangeRow(force, 'wind.y', state, 'windY', -4, 4, 0.05, (v) => params.wind.value.y = v, () => params.wind.value.y));

  const tests = document.createElement('div');
  tests.className = 'group';
  tests.innerHTML = '<h2>Pruebas de comportamiento</h2><p>Antes de pulsar una prueba, predice qué debería ocurrir.</p>';
  panel.append(tests);
  for (const [id, label] of [
    ['inertia', '1 · Inercia'],
    ['wind', '2 · Fuerza constante +X'],
    ['attract', '3 · Atracción'],
    ['repel', '4 · Repulsión'],
    ['vortex', '5 · Vórtice']
  ]) button(tests, label, () => onPreset(id));

  const actions = document.createElement('div');
  actions.className = 'group';
  actions.innerHTML = '<h2>Acciones</h2>';
  panel.append(actions);
  button(actions, 'Reset', onReset);
  button(actions, 'Pausar / continuar', () => onPauseChange());
  button(actions, 'LAB / PERFORMANCE', () => onModeChange());

  document.body.append(panel);

  return {
    element: panel,
    setVisible(visible) { panel.classList.toggle('hidden', !visible); },
    refresh() { for (const item of refreshers) item.refresh(); }
  };
}
