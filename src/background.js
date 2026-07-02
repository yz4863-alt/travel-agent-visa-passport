import * as THREE from "./vendor/three.module.js";

const canvas = document.querySelector("#aiBackground");

if (canvas) {
  initBackground(canvas);
}

function initBackground(targetCanvas) {
  const mobile = window.matchMedia("(max-width: 760px)");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const settings = () => ({
    isMobile: mobile.matches,
    globeParticles: mobile.matches ? 1700 : 3600,
    floatParticles: mobile.matches ? 360 : 820,
    nodes: mobile.matches ? 42 : 78,
    arcs: mobile.matches ? 64 : 136,
  });

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x030813, 0.075);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  camera.position.set(0, 0, 6.8);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    canvas: targetCanvas,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x020611, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const clock = new THREE.Clock();
  const random = seededRandom(42137);
  const root = new THREE.Group();
  const globeGroup = new THREE.Group();
  scene.add(root);
  root.add(globeGroup);

  const currentSettings = settings();
  const globe = createParticleGlobe(currentSettings.globeParticles, 1.72, random);
  const connections = createConnectionLines(globe.unitPoints, currentSettings.arcs, 1.73, random);
  const nodes = createPulsingNodes(globe.unitPoints, currentSettings.nodes, 1.76, random);
  const halo = createHalo();
  const depthParticles = createDepthParticles(currentSettings.floatParticles, random);

  globeGroup.add(halo, connections.mesh, nodes.mesh, globe.mesh);
  root.add(depthParticles.mesh);
  scene.add(createLightBloom(0.9, 0.34, -4.2, 7.4, 0x0c8dff, 0.2));
  scene.add(createLightBloom(-2.9, -1.1, -3.6, 4.2, 0x18ffe0, 0.11));

  const pointer = { x: 0, y: 0 };
  const parallax = { x: 0, y: 0 };
  let animationFrame = 0;
  let visible = true;

  window.addEventListener("pointermove", (event) => {
    pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
    pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
  });
  window.addEventListener("resize", resize);
  mobile.addEventListener?.("change", resize);
  document.addEventListener("visibilitychange", () => {
    visible = document.visibilityState === "visible";
    if (visible && !animationFrame) {
      clock.getDelta();
      animate();
    }
  });

  resize();
  animate();

  function resize() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, mobile.matches ? 1.5 : 1.9);

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = mobile.matches ? 49 : 42;
    camera.updateProjectionMatrix();

    globeGroup.position.set(mobile.matches ? 0.12 : 1.28, mobile.matches ? -0.34 : 0.42, -0.55);
    globeGroup.scale.setScalar(mobile.matches ? 0.88 : 1.16);
    root.position.set(mobile.matches ? 0 : -0.2, mobile.matches ? 0.02 : 0, 0);

    [globe.material, nodes.material, depthParticles.material].forEach((material) => {
      material.uniforms.uPixelRatio.value = pixelRatio;
    });
  }

  function animate() {
    animationFrame = visible ? requestAnimationFrame(animate) : 0;
    if (!visible) {
      return;
    }

    const elapsed = clock.getElapsedTime();
    const speed = reduceMotion.matches ? 0.28 : 1;
    const time = elapsed * speed;

    parallax.x += (pointer.x - parallax.x) * 0.035;
    parallax.y += (pointer.y - parallax.y) * 0.035;

    globe.material.uniforms.uTime.value = time;
    nodes.material.uniforms.uTime.value = time;
    depthParticles.material.uniforms.uTime.value = time;
    connections.material.uniforms.uTime.value = time;
    halo.material.uniforms.uTime.value = time;

    root.rotation.y = parallax.x * 0.065;
    root.rotation.x = -parallax.y * 0.038;
    globeGroup.rotation.y = time * 0.055;
    globeGroup.rotation.x = Math.sin(time * 0.21) * 0.035 - parallax.y * 0.075;
    globeGroup.rotation.z = Math.sin(time * 0.16) * 0.018 + parallax.x * 0.035;
    connections.mesh.rotation.y = -time * 0.018;
    nodes.mesh.rotation.y = time * 0.022;
    depthParticles.mesh.rotation.y = time * 0.011;
    depthParticles.mesh.rotation.x = Math.sin(time * 0.11) * 0.025;
    camera.position.x = parallax.x * 0.12;
    camera.position.y = -parallax.y * 0.08;
    camera.lookAt(0.05, -0.04, 0);

    renderer.render(scene, camera);
  }
}

function createParticleGlobe(count, radius, random) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  const strengths = new Float32Array(count);
  const unitPoints = [];
  const offset = 2 / count;
  const increment = Math.PI * (3 - Math.sqrt(5));

  for (let index = 0; index < count; index += 1) {
    const y = index * offset - 1 + offset / 2;
    const distance = Math.sqrt(1 - y * y);
    const phi = index * increment;
    const unit = new THREE.Vector3(Math.cos(phi) * distance, y, Math.sin(phi) * distance);
    const jitter = 1 + (random() - 0.5) * 0.012;
    const position = unit.clone().multiplyScalar(radius * jitter);
    positions[index * 3] = position.x;
    positions[index * 3 + 1] = position.y;
    positions[index * 3 + 2] = position.z;
    phases[index] = random() * Math.PI * 2;
    sizes[index] = 4.4 + random() * 4.8;
    strengths[index] = 0.45 + random() * 0.52;
    unitPoints.push(unit);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aStrength", new THREE.BufferAttribute(strengths, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uColorA: { value: new THREE.Color(0x57ddff) },
      uColorB: { value: new THREE.Color(0x0f7bff) },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uPixelRatio;
      attribute float aPhase;
      attribute float aSize;
      attribute float aStrength;
      varying float vAlpha;
      varying float vMix;

      void main() {
        float breath = 1.0 + sin(uTime * 0.58 + aPhase) * 0.014;
        vec3 transformed = position * breath;
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        float depthScale = clamp(4.8 / -mvPosition.z, 0.32, 1.58);
        float pulse = 0.82 + sin(uTime * 0.92 + aPhase) * 0.18;
        gl_PointSize = aSize * uPixelRatio * depthScale * pulse;
        vAlpha = aStrength * (0.38 + 0.2 * sin(uTime * 0.64 + aPhase));
        vMix = smoothstep(-1.5, 1.5, transformed.y);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying float vAlpha;
      varying float vMix;

      void main() {
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center);
        float core = smoothstep(0.5, 0.08, dist);
        float glow = smoothstep(0.5, 0.0, dist) * 0.55;
        vec3 color = mix(uColorA, uColorB, vMix);
        gl_FragColor = vec4(color, (core + glow) * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return { mesh: new THREE.Points(geometry, material), material, unitPoints };
}

function createConnectionLines(unitPoints, arcCount, radius, random) {
  const positions = [];
  const phases = [];
  const strengths = [];
  const steps = 12;

  for (let arc = 0; arc < arcCount; arc += 1) {
    const start = unitPoints[Math.floor(random() * unitPoints.length)];
    let end = unitPoints[Math.floor(random() * unitPoints.length)];
    let attempts = 0;
    while ((Math.abs(start.dot(end)) > 0.86 || start.distanceTo(end) < 0.64) && attempts < 16) {
      end = unitPoints[Math.floor(random() * unitPoints.length)];
      attempts += 1;
    }

    const phase = random() * Math.PI * 2;
    const strength = 0.08 + random() * 0.14;
    for (let step = 0; step < steps; step += 1) {
      const a = pointOnArc(start, end, step / steps, radius);
      const b = pointOnArc(start, end, (step + 1) / steps, radius);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      phases.push(phase, phase + 0.18);
      strengths.push(strength, strength);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(phases, 1));
  geometry.setAttribute("aStrength", new THREE.Float32BufferAttribute(strengths, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x79e7ff) },
    },
    vertexShader: `
      uniform float uTime;
      attribute float aPhase;
      attribute float aStrength;
      varying float vAlpha;

      void main() {
        float wave = sin(uTime * 0.86 + aPhase) * 0.5 + 0.5;
        vAlpha = aStrength * (0.55 + smoothstep(0.72, 1.0, wave) * 1.45);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;

      void main() {
        gl_FragColor = vec4(uColor, vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return { mesh: new THREE.LineSegments(geometry, material), material };
}

function createPulsingNodes(unitPoints, count, radius, random) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  const strengths = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const unit = unitPoints[Math.floor(random() * unitPoints.length)];
    const position = unit.clone().multiplyScalar(radius + random() * 0.018);
    positions[index * 3] = position.x;
    positions[index * 3 + 1] = position.y;
    positions[index * 3 + 2] = position.z;
    phases[index] = random() * Math.PI * 2;
    sizes[index] = 10 + random() * 9;
    strengths[index] = 0.52 + random() * 0.45;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aStrength", new THREE.BufferAttribute(strengths, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uColor: { value: new THREE.Color(0x9ff8ff) },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uPixelRatio;
      attribute float aPhase;
      attribute float aSize;
      attribute float aStrength;
      varying float vAlpha;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float pulse = sin(uTime * 1.55 + aPhase) * 0.5 + 0.5;
        gl_PointSize = aSize * uPixelRatio * clamp(4.5 / -mvPosition.z, 0.36, 1.55) * (0.72 + pulse * 0.5);
        vAlpha = aStrength * (0.34 + pulse * 0.42);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;

      void main() {
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center);
        float alpha = smoothstep(0.5, 0.04, dist) * vAlpha;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return { mesh: new THREE.Points(geometry, material), material };
}

function createDepthParticles(count, random) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  const strengths = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (random() - 0.5) * 12.5;
    positions[index * 3 + 1] = (random() - 0.5) * 7.2;
    positions[index * 3 + 2] = -1.7 - random() * 7.5;
    phases[index] = random() * Math.PI * 2;
    sizes[index] = 2.2 + random() * 3.2;
    strengths[index] = 0.08 + random() * 0.2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aStrength", new THREE.BufferAttribute(strengths, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uColor: { value: new THREE.Color(0x5edfff) },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uPixelRatio;
      attribute float aPhase;
      attribute float aSize;
      attribute float aStrength;
      varying float vAlpha;

      void main() {
        vec3 transformed = position;
        transformed.y += sin(uTime * 0.22 + aPhase) * 0.11;
        transformed.x += cos(uTime * 0.18 + aPhase) * 0.05;
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_PointSize = aSize * uPixelRatio * clamp(3.8 / -mvPosition.z, 0.18, 1.1);
        vAlpha = aStrength * (0.65 + 0.35 * sin(uTime * 0.38 + aPhase));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;

      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        float alpha = smoothstep(0.5, 0.06, dist) * vAlpha;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return { mesh: new THREE.Points(geometry, material), material };
}

function createHalo() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x1bbdff) },
    },
    vertexShader: `
      varying vec3 vNormal;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec3 vNormal;

      void main() {
        float rim = pow(1.0 - abs(vNormal.z), 2.8);
        float breath = 0.72 + 0.18 * sin(uTime * 0.52);
        gl_FragColor = vec4(uColor, rim * 0.12 * breath);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.95, 72, 36), material);
  return mesh;
}

function createLightBloom(x, y, z, scale, color, opacity) {
  const texture = createGlowTexture();
  const material = new THREE.SpriteMaterial({
    map: texture,
    color,
    opacity,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(x, y, z);
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

function createGlowTexture() {
  const size = 256;
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = size;
  glowCanvas.height = size;
  const context = glowCanvas.getContext("2d");
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,0.72)");
  gradient.addColorStop(0.24, "rgba(90,226,255,0.28)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(glowCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function pointOnArc(start, end, progress, radius) {
  const dot = clamp(start.dot(end), -0.98, 0.98);
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega) || 1;
  const a = Math.sin((1 - progress) * omega) / sinOmega;
  const b = Math.sin(progress * omega) / sinOmega;
  const lift = Math.sin(progress * Math.PI) * 0.07;
  return start.clone().multiplyScalar(a).add(end.clone().multiplyScalar(b)).normalize().multiplyScalar(radius + lift);
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
