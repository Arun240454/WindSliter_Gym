/* =========================================================
   IronPeak Fitness — WebGL hero scene (Three.js)
   A chrome dumbbell orbited by glowing rings, floating shards
   and a particle field. Reacts to the mouse and to scroll.
   ========================================================= */
import * as THREE from "/vendor/three.module.min.js";

const canvas = document.getElementById("heroCanvas");
const hero = document.getElementById("hero");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}

if (canvas && supportsWebGL()) {
  try {
    initScene();
  } catch (err) {
    console.warn("Hero 3D scene disabled:", err);
    canvas.remove();
  }
} else if (canvas) {
  canvas.remove();
}

function initScene() {
  const ACCENT = new THREE.Color("#ff5a1f");
  const GOLD = new THREE.Color("#ffb21f");

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b0b0d, 9, 22);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  /* ---------- Procedural studio environment for metal reflections ---------- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x050506);
  const panel = (color, intensity, w, h, pos, look) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    mesh.position.set(...pos);
    mesh.lookAt(...look);
    envScene.add(mesh);
  };
  panel("#ffffff", 2.2, 6, 2, [0, 5, 2], [0, 0, 0]);       // top softbox
  panel("#ff5a1f", 3.0, 3, 6, [-6, 0, 1], [0, 0, 0]);      // orange side light
  panel("#ffb21f", 2.0, 3, 5, [6, 1, -2], [0, 0, 0]);      // gold rim
  panel("#8aa4ff", 0.6, 8, 2, [0, -5, 0], [0, 0, 0]);      // cool floor bounce
  panel("#ffffff", 1.2, 2, 2, [2, 2, 6], [0, 0, 0]);       // front fill
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();

  /* ---------- Lights ---------- */
  scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(4, 6, 6);
  scene.add(key);
  const orange = new THREE.PointLight(ACCENT, 40, 20, 1.6);
  orange.position.set(-4, -1, 3);
  scene.add(orange);
  const gold = new THREE.PointLight(GOLD, 25, 18, 1.6);
  gold.position.set(4, 3, -2);
  scene.add(gold);

  /* ---------- Materials ---------- */
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdedede, metalness: 1, roughness: 0.18 });
  const knurl = new THREE.MeshStandardMaterial({ color: 0xb8b8b8, metalness: 1, roughness: 0.45 });
  const plateMat = new THREE.MeshPhysicalMaterial({ color: 0x141416, metalness: 0.6, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.2 });
  const accentMat = new THREE.MeshStandardMaterial({ color: ACCENT, metalness: 0.4, roughness: 0.3, emissive: ACCENT, emissiveIntensity: 0.55 });

  /* ---------- Dumbbell ---------- */
  const dumbbell = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.2, 48, 1), knurl);
  handle.rotation.z = Math.PI / 2;
  dumbbell.add(handle);
  // Knurling rings for texture
  for (let i = -8; i <= 8; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.163, 0.012, 6, 32), chrome);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = i * 0.1;
    dumbbell.add(ring);
  }

  const plateProfile = (r, depth) => {
    // Lathe profile gives plates a bevelled, premium edge.
    const pts = [
      new THREE.Vector2(0.18, -depth / 2),
      new THREE.Vector2(r - 0.06, -depth / 2),
      new THREE.Vector2(r, -depth / 2 + 0.05),
      new THREE.Vector2(r, depth / 2 - 0.05),
      new THREE.Vector2(r - 0.06, depth / 2),
      new THREE.Vector2(0.18, depth / 2),
    ];
    const g = new THREE.LatheGeometry(pts, 72);
    g.rotateZ(Math.PI / 2);
    return g;
  };

  [-1, 1].forEach((side) => {
    const plates = [
      { r: 1.05, d: 0.26, x: 1.25 },
      { r: 0.92, d: 0.22, x: 1.5 },
      { r: 0.74, d: 0.18, x: 1.71 },
    ];
    plates.forEach((p, idx) => {
      const plate = new THREE.Mesh(plateProfile(p.r, p.d), plateMat);
      plate.position.x = side * p.x;
      dumbbell.add(plate);
      // Glowing accent band on the outer rim of the largest plates
      if (idx < 2) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(p.r + 0.004, 0.026, 12, 96), accentMat);
        band.rotation.y = Math.PI / 2;
        band.position.x = side * p.x;
        dumbbell.add(band);
      }
      // Chrome hub
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, p.d + 0.02, 48), chrome);
      hub.rotation.z = Math.PI / 2;
      hub.position.x = side * p.x;
      dumbbell.add(hub);
    });
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 48), chrome);
    collar.rotation.z = Math.PI / 2;
    collar.position.x = side * 1.04;
    dumbbell.add(collar);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 48), chrome);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = side * 1.86;
    dumbbell.add(cap);
  });
  dumbbell.rotation.set(0.35, -0.6, 0.25);

  const rig = new THREE.Group();   // mouse-driven
  rig.add(dumbbell);
  scene.add(rig);

  /* ---------- Orbit rings ---------- */
  const rings = [];
  [
    { r: 2.6, tube: 0.008, color: ACCENT, tilt: [1.2, 0.2, 0], speed: 0.25, opacity: 0.9 },
    { r: 3.1, tube: 0.006, color: GOLD, tilt: [0.4, 1.0, 0.3], speed: -0.18, opacity: 0.6 },
    { r: 3.6, tube: 0.004, color: new THREE.Color("#ffffff"), tilt: [1.6, -0.4, 0.8], speed: 0.12, opacity: 0.25 },
  ].forEach((cfg) => {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(cfg.r, cfg.tube, 8, 220),
      new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: cfg.opacity, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    mesh.rotation.set(...cfg.tilt);
    // A bright "satellite" orb travelling around each ring
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), new THREE.MeshBasicMaterial({ color: cfg.color }));
    orb.position.x = cfg.r;
    const orbPivot = new THREE.Group();
    orbPivot.add(orb);
    mesh.add(orbPivot);
    rig.add(mesh);
    rings.push({ mesh, orbPivot, speed: cfg.speed });
  });

  /* ---------- Floating shards ---------- */
  const shards = [];
  const shardGeos = [new THREE.OctahedronGeometry(0.22), new THREE.IcosahedronGeometry(0.18), new THREE.TetrahedronGeometry(0.2)];
  for (let i = 0; i < 14; i++) {
    const wire = i % 2 === 0;
    const mat = wire
      ? new THREE.MeshBasicMaterial({ color: i % 4 === 0 ? GOLD : ACCENT, wireframe: true, transparent: true, opacity: 0.7 })
      : chrome;
    const m = new THREE.Mesh(shardGeos[i % shardGeos.length], mat);
    const a = (i / 14) * Math.PI * 2;
    const rad = 3.4 + Math.random() * 2.2;
    m.position.set(Math.cos(a) * rad, (Math.random() - 0.5) * 5, Math.sin(a) * rad * 0.6 - 1);
    m.userData = { base: m.position.clone(), phase: Math.random() * Math.PI * 2, spin: 0.3 + Math.random() * 0.8 };
    m.scale.setScalar(0.6 + Math.random() * 0.9);
    scene.add(m);
    shards.push(m);
  }

  /* ---------- Particle field ---------- */
  const COUNT = window.innerWidth < 700 ? 700 : 1600;
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 30;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 18;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 16 - 3;
    tmp.copy(Math.random() > 0.6 ? ACCENT : Math.random() > 0.5 ? GOLD : new THREE.Color("#ffffff"));
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  pGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const sprite = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.35, "rgba(255,255,255,0.5)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.07, map: sprite, vertexColors: true, transparent: true, opacity: 0.75,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  scene.add(particles);

  /* ---------- Layout / interaction ---------- */
  let baseX = 0, baseScale = 1, baseOpacity = 1;
  function resize() {
    const w = hero.clientWidth, h = hero.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Desktop: sit to the right of the headline. Mobile: tuck behind, top-right.
    const desktop = w > 900;
    baseX = desktop ? Math.min(4.2, camera.aspect * 2.05) : 1.2;
    baseScale = desktop ? 1 : 0.62;
    baseOpacity = desktop ? 1 : 0.55;
    rig.position.set(baseX, desktop ? 0.1 : 1.9, 0);
    rig.scale.setScalar(baseScale);
  }
  window.addEventListener("resize", resize);
  resize();

  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener("pointermove", (e) => {
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  let scrollP = 0;
  window.addEventListener("scroll", () => {
    scrollP = Math.min(1, window.scrollY / Math.max(1, hero.offsetHeight));
  }, { passive: true });

  // Intro: dumbbell flies in once the loader finishes.
  let intro = reduceMotion ? 1 : 0;
  let introStarted = reduceMotion;
  window.addEventListener("ironpeak:ready", () => (introStarted = true), { once: true });
  if (!document.getElementById("loader")) introStarted = true;

  /* ---------- Render loop (paused off-screen / hidden tab) ---------- */
  let visible = true, running = false;
  const clock = new THREE.Clock();
  let elapsed = 0;

  function frame() {
    if (!visible || document.hidden) { running = false; return; }
    running = true;
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += reduceMotion ? 0 : dt;

    if (introStarted && intro < 1) intro = Math.min(1, intro + dt * 0.7);
    const e = 1 - Math.pow(1 - intro, 3);

    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;

    // Dumbbell: slow spin, floating bob, mouse tilt, scroll spin-away.
    dumbbell.rotation.y = -0.6 + elapsed * 0.35 + scrollP * 2.5;
    dumbbell.rotation.x = 0.35 + Math.sin(elapsed * 0.6) * 0.12;
    dumbbell.position.y = Math.sin(elapsed * 1.1) * 0.15;
    rig.rotation.x = mouse.y * 0.25 + scrollP * 0.6;
    rig.rotation.y = mouse.x * 0.35;
    rig.position.z = -6 * (1 - e) - scrollP * 3;
    rig.scale.setScalar(baseScale * (0.4 + 0.6 * e));

    rings.forEach((r, i) => {
      r.mesh.rotation.z += r.speed * dt;
      r.orbPivot.rotation.z += (0.8 + i * 0.3) * dt;
      r.mesh.material.opacity = (i === 0 ? 0.9 : i === 1 ? 0.6 : 0.25) * e;
    });

    shards.forEach((s) => {
      const u = s.userData;
      s.position.y = u.base.y + Math.sin(elapsed * 0.8 + u.phase) * 0.35 - scrollP * 2;
      s.rotation.x += u.spin * dt;
      s.rotation.y += u.spin * 0.7 * dt;
    });

    particles.rotation.y = elapsed * 0.02 + mouse.x * 0.08;
    particles.rotation.x = mouse.y * 0.05;
    particles.position.y = scrollP * 3;

    orange.position.x = -4 + Math.sin(elapsed * 0.7) * 2;
    orange.position.y = Math.cos(elapsed * 0.5) * 2;

    camera.position.x = mouse.x * 0.4;
    camera.position.y = -mouse.y * 0.3;
    camera.lookAt(0, 0, 0);

    canvas.style.opacity = String(baseOpacity * (1 - scrollP * 0.9));
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  const start = () => { if (!running) { clock.getDelta(); requestAnimationFrame(frame); } };

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start();
  }).observe(hero);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) start(); });
  start();
}
