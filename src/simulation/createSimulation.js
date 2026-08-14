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
  step,
  uint,
  uv,
  vec3,
  vec4,
  float,
  vec2
} from 'three/tsl';

export function createSimulation({ renderer, scene, params, count = 131072 }) {
  // STATE -----------------------------------------------------------------
  // Each particle owns position and velocity. The arrays live in GPU storage.
  const positionBuffer = instancedArray(count, 'vec3');
  const velocityBuffer = instancedArray(count, 'vec3');

  // INITIALIZATION --------------------------------------------------------
  // A compute pass writes the initial state for every particle in parallel.
  const initParticles = Fn(() => {
    const i = instanceIndex;
    const p = positionBuffer.element(i);
    const v = velocityBuffer.element(i);
    const iFloat = float(i);

    const r1 = hash(vec2(iFloat, 11.0));
    const r2 = hash(vec2(iFloat, 23.0));
    const r3 = hash(vec2(iFloat, 37.0));
    const r4 = hash(vec2(iFloat, 53.0));
    const r5 = hash(vec2(iFloat, 71.0));
    const r6 = hash(vec2(iFloat, 89.0));

    p.assign(vec3(r1, r2, r3).sub(0.5).mul(params.boundsSize.mul(0.45)));
    v.assign(vec3(r4, r5, r6).sub(0.5).mul(params.initialSpeed));
  })().compute(count).setName('Initialize Particles');

/*  const resetVelocityCompute = Fn(() => {
  const v = velocityBuffer.element(instanceIndex);
  v.assign(vec3(0.0)); // Frena las partículas en seco
})().compute(count).setName('Reset Velocity'); */

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
    const radialForce = radialDirection
      .mul(params.radialStrength)
      .div(distance.pow(2))
      .mul(params.radialEnabled);
    force.addAssign(radialForce);

    // 3) VORTEX FORCE: tangent to the radial direction around Z.
    const zAxis = vec3(0.0, 0.0, 1.0);
    const tangent = zAxis.cross(radialDirection);
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

const resetVelocityCompute = Fn(() => {
 const i = instanceIndex;
 const p = positionBuffer.element(i);
 const v = velocityBuffer.element(i);
 
 const iFloat = float(i);
 const r1 = hash(vec2(iFloat, 123.0));
 const r2 = hash(vec2(iFloat, 456.0));
 const r3 = hash(vec2(iFloat, 789.0));
 const noise = vec3(r1, r2, r3).sub(0.5);

 p.addAssign(noise.mul(0.15));
 v.assign(noise.mul(0.05));
})().compute(count).setName('Reset Velocity');

  return {
    count,
    positionBuffer,
    velocityBuffer,
    resetVelocity: () => renderer.compute(resetVelocityCompute),
    reset,
    stepSimulation,
    dispose
  };
}
