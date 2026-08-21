import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  color,
  hash,
  instanceIndex,
  instancedArray,
  max,
  mix,
  mod,
  smoothstep,
  step,
  uint,
  uniform,
  uv,
  vec3,
  vec4
} from 'three/tsl';

export function createSimulation({ renderer, scene, params, count = 131072 }) {
  // STATE -----------------------------------------------------------------
  // Each particle owns position and velocity. The arrays live in GPU storage.
  const positionBuffer = instancedArray(count, 'vec3');
  const velocityBuffer = instancedArray(count, 'vec3');
  // Eje de giro propio de cada partícula. Antes el vórtice usaba un solo
  // eje Z global para todas las partículas, así que la fuerza tangencial
  // siempre caía en el plano XY -> el sistema se aplanaba en un disco.
  // Con un eje random POR PARTÍCULA (fijo desde el init), cada una sigue
  // orbitando en un plano, pero esos planos quedan orientados al azar en
  // las 3 dimensiones -> el conjunto llena una forma 3D real.
  const spinAxisBuffer = instancedArray(count, 'vec3');

  // INITIALIZATION --------------------------------------------------------
  // A compute pass writes the initial state for every particle in parallel.
  const initParticles = Fn(() => {
    const i = instanceIndex;
    const p = positionBuffer.element(i);
    const v = velocityBuffer.element(i);
    const spin = spinAxisBuffer.element(i);

    const r1 = hash(i.add(uint(11)));
    const r2 = hash(i.add(uint(23)));
    const r3 = hash(i.add(uint(37)));
    const r4 = hash(i.add(uint(53)));
    const r5 = hash(i.add(uint(71)));
    const r6 = hash(i.add(uint(89)));
    const r7 = hash(i.add(uint(103)));
    const r8 = hash(i.add(uint(127)));
    const r9 = hash(i.add(uint(151)));

    p.assign(vec3(r1, r2, r3).sub(0.5).mul(params.boundsSize.mul(0.45)));
    v.assign(vec3(r4, r5, r6).sub(0.5).mul(params.initialSpeed));
    spin.assign(vec3(r7, r8, r9).sub(0.5).normalize());
  })().compute(count).setName('Initialize Particles');

  // BURST STATE -------------------------------------------------------------
  // Transitorio, gateado por dirección: mientras esté activo, solo las
  // partículas que están realmente "en la punta" de arriba (topBurst) o
  // de abajo (bottomBurst) del sistema reciben un empujón hacia afuera.
  // Es un force term propio, NO una inversión de signo de la atracción
  // (ver por qué en el comentario junto a su uso, más abajo).
  const topBurst = uniform(0);
  const bottomBurst = uniform(0);
  let topBurstTimeout = null;
  let bottomBurstTimeout = null;

  // Coseno del semiángulo del cono de selección, medido desde el eje +Y
  // (o -Y para abajo), respecto al atractor. Más cerca de 1 = cono más
  // angosto = "montañita" más chica y puntual. Más cerca de 0 = medio
  // sistema entero.
  const BURST_CONE = 0.85; // ~32° de semiángulo alrededor de la vertical

  // Magnitud fija del empujón, deliberadamente independiente de
  // radialStrength y SIN caída por 1/distancia² (ver comentario abajo).
  const BURST_STRENGTH = 10;

  function triggerTopBurst(durationMs = 120) {
    topBurst.value = 1;
    clearTimeout(topBurstTimeout);
    topBurstTimeout = setTimeout(() => { topBurst.value = 0; }, durationMs);
  }

  function triggerBottomBurst(durationMs = 120) {
    bottomBurst.value = 1;
    clearTimeout(bottomBurstTimeout);
    bottomBurstTimeout = setTimeout(() => { bottomBurst.value = 0; }, durationMs);
  }

  // BEAT STATE ----------------------------------------------------------
  // Pulso rítmico GLOBAL (no gateado por posición como el burst): una
  // repulsión breve, inmediatamente encadenada a una atracción algo más
  // larga para que todo vuelva a organizarse. beatPhase codifica la fase
  // actual: +1 = empuja hacia afuera, -1 = tira hacia adentro, 0 = idle
  // (el preset activo sigue mandando normal).
  const beatPhase = uniform(0);
  let beatRepelTimeout = null;
  let beatAttractTimeout = null;

  // Magnitud fija, mismo motivo que BURST_STRENGTH: sin caída por
  // distancia, para que no se diluya sea cual sea el preset activo.
  const BEAT_STRENGTH = 12;

  function triggerBeatOut(repelMs = 70, attractMs = 200) {
    clearTimeout(beatRepelTimeout);
    clearTimeout(beatAttractTimeout);
    beatPhase.value = 1; // fase 1: repulsión
    beatRepelTimeout = setTimeout(() => {
      beatPhase.value = -1; // fase 2: atracción
      beatAttractTimeout = setTimeout(() => {
        beatPhase.value = 0; // idle: vuelve al preset activo
      }, attractMs);
    }, repelMs);
  }

  // UPDATE / COMPUTE SHADER ----------------------------------------------
  // This is the conceptual heart of the project:
  // state -> forces -> acceleration -> velocity -> position.
  const updateParticles = Fn(() => {
    const p = positionBuffer.element(instanceIndex);
    const v = velocityBuffer.element(instanceIndex);

    const dt = params.dt.mul(params.timeScale);
    const force = vec3(0.0).toVar();

    // 1) CONSTANT / WIND FORCE
    force.addAssign(params.wind.mul(params.windEnabled));

    // 2) RADIAL FORCE (positive = attraction, negative = repulsion)
    const toAttractor = params.attractor.sub(p);
    const distance = max(toAttractor.length(), params.softening);
    const radialDirection = toAttractor.div(distance);
    const awayFromAttractor = radialDirection.mul(-1.0);

    // Comportamiento intrínseco tipo Lennard-Jones:
    // Las partículas sienten una atracción gravitacional (1/d^2) a lo lejos,
    // pero una repulsión muy fuerte (1/d^4) cuando están demasiado cerca del centro.
    // Esto crea un radio de equilibrio natural donde se suspenden sin necesidad de colisiones.
    const attraction = params.radialStrength.div(distance.pow(2));
    const repulsion = uniform(3.5).div(distance.pow(4)); // Factor de repulsión a corta distancia

    const netRadial = attraction.sub(repulsion).mul(params.radialEnabled);
    const radialForce = radialDirection.mul(netRadial);
    force.addAssign(radialForce);

    // 2b) BURST: empujón hacia afuera propio, no una inversión de signo
    // de la fuerza radial. La versión anterior reutilizaba el mismo
    // 1/distancia² de la atracción, y eso la hacía invisible: bajo
    // atracción pura (sin componente tangencial) cada partícula pasa la
    // mayor parte del tiempo LEJOS del centro (cae rápido, "flota" lento
    // en su punto más alejado, como una órbita kepleriana degenerada) —
    // justo donde 1/distancia² hace la fuerza casi nula, volteada o no.
    // Con magnitud fija, el empujón no se diluye por la distancia.
    //
    // step() = corte binario (dentro del cono: empuje completo, afuera:
    // cero) -> borde recto -> forma de CONO. smoothstep() interpola
    // suavemente entre 0 (borde del cono) y 1 (justo en el centro/polo)
    // -> el empuje se atenúa gradualmente hacia los bordes -> PROTUBERANCIA
    // redondeada en vez de un cono de bordes duros.
    const upAlignment = awayFromAttractor.y;
    const topFalloff = smoothstep(BURST_CONE, 1.0, upAlignment).mul(topBurst);
    const bottomFalloff = smoothstep(BURST_CONE, 1.0, upAlignment.mul(-1.0)).mul(bottomBurst);
    const burstForce = awayFromAttractor.mul(BURST_STRENGTH).mul(max(topFalloff, bottomFalloff));
    force.addAssign(burstForce);

    // 2c) BEAT: pulso global, aplicado a TODAS las partículas por igual
    // (no gateado por dirección como el burst). Reusa awayFromAttractor.
    // Es puramente radial -> no le agrega momento angular nuevo al
    // sistema.
    const beatForce = awayFromAttractor.mul(BEAT_STRENGTH).mul(beatPhase);
    force.addAssign(beatForce);

    // 2d) MOUSE ATTRACTOR: Fuerza extra interactiva (Activada con Space)
    const toMouse = params.mousePos.sub(p);
    const mouseDist = max(toMouse.length(), params.softening);
    const mouseDir = toMouse.div(mouseDist);
    // Atracción que decae con la distancia al cuadrado
    const mouseForce = mouseDir.mul(params.mouseStrength).div(mouseDist.pow(2)).mul(params.mouseActive);
    force.addAssign(mouseForce);

    // 3) VORTEX FORCE: tangent to the radial direction, around ESTE
    // eje propio de la partícula (no un eje Z compartido) -> rotación
    // 3D real en vez de estar encerrada en el plano XY.
    const spinAxis = spinAxisBuffer.element(instanceIndex);
    const tangent = spinAxis.cross(radialDirection);
    force.addAssign(tangent.mul(params.vortexStrength).mul(params.vortexEnabled));

    // 4) LINEAR DRAG: F = -c v
    force.addAssign(v.mul(params.dragCoefficient).mul(params.dragEnabled).mul(-1.0));

    // INTEGRATION ---------------------------------------------------------
    // Unit mass: a = F. Semi-implicit Euler: update v, then p.
    v.addAssign(force.mul(dt));

    const speed = v.length();
    If(speed.greaterThan(params.maxSpeed), () => {
      v.assign(v.normalize().mul(params.maxSpeed));
    });

    p.addAssign(v.mul(dt));

    // Periodic boundary conditions: particles leaving one side re-enter.
    const half = params.boundsSize.mul(0.5);
    p.assign(mod(p.add(half), params.boundsSize).sub(half));
  })().compute(count).setName('Update Particles');

  // RENDER ---------------------------------------------------------------
  // Rendering does not recompute the physics. It consumes the GPU state.
  const material = new THREE.SpriteNodeMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true
  });

  material.positionNode = positionBuffer.toAttribute();
  material.scaleNode = params.particleSize;

  material.colorNode = Fn(() => {
    const speed = velocityBuffer.toAttribute().length();
    const t = speed.div(params.maxSpeed).clamp(0.0, 1.0);
    const slow = color('#46a6ff');
    const fast = color('#ffb35a');
    return vec4(mix(slow, fast, t), 1.0);
  })();

  // Circular sprite mask, avoiding visible square planes.
  material.opacityNode = step(uv().xy.sub(0.5).length(), 0.5);

  const geometry = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  scene.add(mesh);

  function reset() {
    renderer.compute(initParticles);
  }

  function stepSimulation() {
    renderer.compute(updateParticles);
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
    scene.remove(mesh);
  }

  return {
    count,
    positionBuffer,
    velocityBuffer,
    reset,
    stepSimulation,
    dispose,
    triggerTopBurst,
    triggerBottomBurst,
    triggerBeatOut
  };
}
