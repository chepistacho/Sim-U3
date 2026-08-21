import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import './styles.css';

import { createParameters } from './simulation/parameters.js';
import { createSimulation } from './simulation/createSimulation.js';
import { createLabPanel } from './ui/labPanel.js';



/*
2^15: 32768
2^16: 65536
2^17: 131072
2^18: 262144
2^19: 524288
2^20: 1048576
2^21: 2097152
2^22: 4194304
2^23: 8388608
2^24: 16777216
*/

const PARTICLE_COUNT = 131072; //2^17. Increase only after measuring performance.

async function main() {
  const mount = document.querySelector('#app');

  if (!WebGPU.isAvailable()) {
    mount.appendChild(WebGPU.getErrorMessage());
    throw new Error('Este proyecto requiere WebGPU para ejecutar compute shaders.');
  }

  // THREE.JS MENTAL MODEL: scene + camera + renderer ---------------------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050607');

  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 100);
  camera.position.set(0, 0, 11);

  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  mount.appendChild(renderer.domElement);
  await renderer.init();

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.target.set(0, 0, 0);

  const params = createParameters();
  // El atractor queda fijo en el origen del mundo de forma PERMANENTE.
  // Ya no hay ningún listener de mouse que lo mueva (ver más abajo):
  // todo el movimiento del sistema sale de las fuerzas mismas.
  params.attractor.value.set(0, 0, 0);
  // Valores por defecto pedidos explícitamente, independientes de lo
  // que traiga parameters.js.
  params.maxSpeed.value = 2;
  params.particleSize.value = 0.008;
  const simulation = createSimulation({ renderer, scene, params, count: PARTICLE_COUNT });

  // MOUSE TRACKING --------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const mousePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  addEventListener('pointermove', (e) => {
    const x = (e.clientX / innerWidth) * 2 - 1;
    const y = -(e.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    const target = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(mousePlane, target)) {
      params.mousePos.value.copy(target);
    }
  });

  // Ya no usamos pointerdown/pointerup. El atractor extra se activa con Space.
  
  addEventListener('contextmenu', (e) => { 
    if (!e.target.closest('aside')) e.preventDefault(); 
  });

  // LAB HELPERS -----------------------------------------------------------
  const attractorHelper = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 12),
    new THREE.MeshBasicMaterial({ color: '#ffffff' })
  );
  scene.add(attractorHelper);
  const axes = new THREE.AxesHelper(1.5);
  scene.add(axes);

  // El atractor ya NO sigue al mouse. Todo lo que le pasa al sistema
  // (órbita, saltos con las flechas, etc.) surge de las fuerzas del
  // compute shader, guiado por física, no por input directo de posición.

  let paused = false;
  let mode = 'LAB';
  let panel;
  let savedRadialStrength = params.radialStrength.value;
  let savedRadialEnabled = params.radialEnabled.value;

  const applyPreset = (id) => {
    params.windEnabled.value = 0;
    params.radialEnabled.value = 0;
    params.vortexEnabled.value = 0;
    params.dragEnabled.value = 0;
    params.wind.value.set(0, 0, 0);
    params.initialSpeed.value = 0;

    if (id === 'inertia') {
      params.initialSpeed.value = 0.8;
      params.dragEnabled.value = 1;
      params.dragCoefficient.value = 0.02; // Un poco de fricción para que se detengan suavemente
    } else if (id === 'wind') {
      params.windEnabled.value = 1;
      params.wind.value.set(1.5, 0, 0);
      params.vortexEnabled.value = 1;
      params.vortexStrength.value = 0.5; // Espiral sutil en el viento
    } else if (id === 'attract') {
      params.radialEnabled.value = 1;
      params.radialStrength.value = 3.0;
      // Drag para disipar momento angular que pudo haber quedado de un
      // preset anterior (p. ej. vortex). Una fuerza puramente radial no
      // cancela velocidad tangencial -> sin esto, cualquier partícula
      // con "giro" residual queda orbitando en vez de caer al centro.
      params.dragEnabled.value = 1;
      params.dragCoefficient.value = 0.15;
    } else if (id === 'repel') {
      params.radialEnabled.value = 1;
      params.radialStrength.value = -3.0;
      params.dragEnabled.value = 1;
      params.dragCoefficient.value = 0.05;
      params.vortexEnabled.value = 1;
      params.vortexStrength.value = 1.0; // Se expande como una galaxia en formación
    } else if (id === 'vortex') {
      params.radialEnabled.value = 1;
      params.radialStrength.value = 1.0;
      params.vortexEnabled.value = 1;
      params.vortexStrength.value = 3.0;
      params.dragEnabled.value = 1;
      params.dragCoefficient.value = 0.08;
    } else if (id === 'blackhole') {
      params.radialEnabled.value = 1;
      params.radialStrength.value = 8.0;
      params.vortexEnabled.value = 1;
      params.vortexStrength.value = 6.0;
      params.dragEnabled.value = 1;
      params.dragCoefficient.value = 0.4; // Tira todo hacia el centro con gran fuerza y giro
    } else if (id === 'storm') {
      params.windEnabled.value = 1;
      params.wind.value.set(2.0, 1.0, 0.0);
      params.radialEnabled.value = 1;
      params.radialStrength.value = -1.5;
      params.vortexEnabled.value = 1;
      params.vortexStrength.value = 4.0;
      params.dragEnabled.value = 1;
      params.dragCoefficient.value = 0.05; // Expansión y viento caótico
    }
    // No reiniciamos la simulación aquí: las partículas conservan su
    // posición y velocidad actuales; solo cambia el campo de fuerzas
    // que el compute shader aplicará a partir del próximo frame.
    panel?.refresh();
  };

  // BEAT (tecla B): literalmente encadenar dos presets reales con un
  // delay corto entre medio -- lo mismo que pasaría si presionaras el 4
  // y, casi enseguida, el 3. Nada de fuerzas aparte: es el mismo
  // applyPreset de siempre, dos veces. Importante: al terminar, el
  // sistema se queda en el segundo preset (igual que quedaría si de
  // verdad presionaras esas dos teclas) -- no vuelve solo al que estaba
  // antes. (La tecla N usa un mecanismo distinto: ver triggerBeatOut en
  // createSimulation.js.)
  let beatTimeout = null;

  function triggerBeatIn(delayMs = 90) {
    clearTimeout(beatTimeout);
    applyPreset('repel');   // como presionar el 4...
    beatTimeout = setTimeout(() => {
      applyPreset('attract'); // ...y ahí mismo el 3
    }, delayMs);
  }

  function triggerBeatVortex(delayMs = 90) {
    clearTimeout(beatTimeout);
    applyPreset('vortex');   // como presionar el 5...
    beatTimeout = setTimeout(() => {
      applyPreset('attract'); // ...y ahí mismo el 3
    }, delayMs);
  }

  const setMode = (next) => {
    mode = next;
    const lab = mode === 'LAB';
    panel.setVisible(lab);
    axes.visible = lab;
    attractorHelper.visible = lab;
    //orbit.enabled = lab;
    hud.innerHTML = lab
      ? '<strong>LAB</strong> · P: performance · R: reset · 1–7: pruebas · ↑/↓: salto · B/N/V: beat'
      //: '<strong>PERFORMANCE</strong> · P: lab · espacio: invertir radial · puntero: atractor';
      : '';
  };

  panel = createLabPanel({
    params,
    onReset: () => simulation.reset(),
    onPreset: applyPreset,
    onModeChange: () => setMode(mode === 'LAB' ? 'PERFORMANCE' : 'LAB'),
    onPauseChange: () => paused = !paused
  });

  const hud = document.createElement('div');
  hud.className = 'hud';
  document.body.append(hud);
  setMode('LAB');

  // BASELINE LIVE INSTRUMENT MAPPING -------------------------------------
  // Students are expected to redesign this mapping for their own instrument.
  addEventListener('keydown', (event) => {
    //console.log('radial inverted', params.radialStrength.value);
    if (event.repeat) return;
    if (event.code === 'KeyP') setMode(mode === 'LAB' ? 'PERFORMANCE' : 'LAB');
    if (event.code === 'KeyR') simulation.reset();
    if (event.code === 'Digit1') applyPreset('inertia');
    if (event.code === 'Digit2') applyPreset('wind');
    if (event.code === 'Digit3') applyPreset('attract');
    if (event.code === 'Digit4') applyPreset('repel');
    if (event.code === 'Digit5') applyPreset('vortex');
    if (event.code === 'Digit6') applyPreset('blackhole');
    if (event.code === 'Digit7') applyPreset('storm');

    // Saltos transitorios: las partículas de arriba (o abajo) del centro
    // pasan a repulsión por un instante y vuelven solas a la atracción.
    if (event.code === 'ArrowUp') {
      event.preventDefault();
      simulation.triggerTopBurst();
    }
    if (event.code === 'ArrowDown') {
      event.preventDefault();
      simulation.triggerBottomBurst();
    }

    // Beat. B = cadena literal repel->attract. N = fuerza propia
    // repulsión -> atracción (ver createSimulation.js). V = cadena
    // literal vortex->attract, delay más largo.
    if (event.code === 'KeyB') {
      triggerBeatIn();
    }
    if (event.code === 'KeyN') {
      simulation.triggerBeatOut();
    }
    if (event.code === 'KeyV') {
      triggerBeatVortex();
    }

    if (event.code === 'Space') {
      event.preventDefault();
      // Al mantener presionada la barra espaciadora, el atractor del mouse se activa
      params.mouseActive.value = 1;
    }
  });

  addEventListener('keyup', (event) => {
    if (event.code === 'Space') {
      // Al soltar la barra espaciadora, se desactiva
      params.mouseActive.value = 0;
    }
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // Estado por defecto al arrancar: atracción pura hacia el origen.
  applyPreset('attract');
  simulation.reset();

  // FRAME LOOP ------------------------------------------------------------
  renderer.setAnimationLoop(() => {
    if (!paused) simulation.stepSimulation();
    orbit.update();
    renderer.render(scene, camera);
  });
}

main().catch((error) => {
  console.error(error);
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;inset:16px;white-space:pre-wrap;color:#fff;z-index:50';
  pre.textContent = String(error?.stack || error);
  document.body.append(pre);
});
