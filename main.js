import * as THREE from "https://unpkg.com/three@0.166.1/build/three.module.js";

const canvas = document.getElementById("gameCanvas");
const overlay = document.getElementById("overlay");
const startButton = document.getElementById("startButton");
const resetButton = document.getElementById("resetButton");
const waveEl = document.getElementById("wave");
const levelBannerEl = document.getElementById("levelBanner");
const healthEl = document.getElementById("health");
const coinsEl = document.getElementById("coins");
const killsEl = document.getElementById("kills");
const altitudeEl = document.getElementById("altitude");
const marketPanelEl = document.getElementById("marketPanel");
const ownedBadge1 = document.getElementById("owned1");
const ownedBadge2 = document.getElementById("owned2");
const ownedBadge3 = document.getElementById("owned3");
const ownedBadge4 = document.getElementById("owned4");
const shopRow1 = document.getElementById("shopItem1");
const shopRow2 = document.getElementById("shopItem2");
const shopRow3 = document.getElementById("shopItem3");
const shopRow4 = document.getElementById("shopItem4");
const messageEl = document.getElementById("message");
const bossBarWrap = document.getElementById("bossBarWrap");
const bossBar = document.getElementById("bossBar");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x091419);
scene.fog = new THREE.FogExp2(0x091419, 0.022);

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 320);
const yaw = new THREE.Object3D();
const pitch = new THREE.Object3D();
yaw.add(pitch);
pitch.add(camera);
scene.add(yaw);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const moveDir = new THREE.Vector3();

const EYE_HEIGHT = 1.68;
const BOUNDARY_RADIUS = 58;
const BASE_SUMMIT_Y = 105;
const PLAYER_RADIUS = 0.38;
const TOWER_RADIUS = 4.9;
const MAX_LEVELS = 10;
const MARKET_X = -20;
const MARKET_Z = 24;
const MARKET_RADIUS = 9;
let summitY = BASE_SUMMIT_Y;
let towerHeight = BASE_SUMMIT_Y + 18;

const keys = { w: false, a: false, s: false, d: false, shift: false };
const input = { jumpQueued: false, jetpackQueued: false };

const game = {
  active: false,
  hp: 100,
  coins: 0,
  kills: 0,
  stage: 1,
  canShootAt: 0,
  shootCooldownMs: 560,
  messageUntil: 0,
  ended: false,
  paused: false,
  bossSpawned: false,
  bossDefeated: false,
  level: 1,
  spawnedRegular: 0,
  spawnedJolter: 0,
  nextThreatSpawnAt: 0,
  bloodMoon: false,
  portalOpen: false,
};

const player = {
  vel: new THREE.Vector3(),
  grounded: false,
  jumpsUsed: 0,
  maxJumps: 2,
  hasSuperBazooka: false,
  superProjectileCount: 1,
  hasJetpack: false,
  hasSuperDuperBoots: false,
  jetpackActiveUntil: 0,
  jetpackCooldownUntil: 0,
  inMarket: false,
};

const platforms = [];
const obstacleColliders = [];
const springs = [];
const enemies = [];
const coins = [];
const missiles = [];
const explosions = [];
const levelMeshes = [];
let moonMesh = null;
let portalMesh = null;
let traderPig = null;
let marketPanelOpen = false;
let bloodRain = null;

let audioContext = null;

function getAudioContext() {
  if (!game.active) {
    return null;
  }
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  return audioContext;
}

function playShootSound() {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(130, now);
  osc.frequency.exponentialRampToValueAtTime(78, now + 0.15);
  gain.gain.setValueAtTime(0.09, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.22);
}

function playExplosionSound() {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(80, now);
  osc.frequency.exponentialRampToValueAtTime(42, now + 0.22);
  gain.gain.setValueAtTime(0.14, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.26);
}

function playJumpSound() {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(210, now);
  osc.frequency.exponentialRampToValueAtTime(320, now + 0.09);
  gain.gain.setValueAtTime(0.04, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.11);
}

function setMessage(text, durationMs = 1400) {
  messageEl.textContent = text;
  messageEl.style.opacity = "1";
  game.messageUntil = performance.now() + durationMs;
}

function setLevelBanner() {
  levelBannerEl.textContent = `Level ${game.level} / ${MAX_LEVELS}`;
}

function setMarketPanelOpen(isOpen) {
  marketPanelOpen = isOpen;
  if (marketPanelOpen) {
    marketPanelEl.classList.add("show");
  } else {
    marketPanelEl.classList.remove("show");
  }

  updateOwnedBadges();
}

function setOwnedState(rowEl, badgeEl, owned) {
  if (!rowEl || !badgeEl) {
    return;
  }
  if (owned) {
    rowEl.classList.add("owned");
  } else {
    rowEl.classList.remove("owned");
  }
}

function updateOwnedBadges() {
  setOwnedState(shopRow1, ownedBadge1, player.maxJumps >= 3);
  setOwnedState(shopRow2, ownedBadge2, player.hasJetpack);
  setOwnedState(shopRow3, ownedBadge3, player.hasSuperBazooka);
  setOwnedState(shopRow4, ownedBadge4, player.hasSuperDuperBoots);
}

function clampArena() {
  const len = Math.hypot(yaw.position.x, yaw.position.z);
  if (len > BOUNDARY_RADIUS) {
    const k = BOUNDARY_RADIUS / len;
    yaw.position.x *= k;
    yaw.position.z *= k;
  }
}

function addLights() {
  const hemi = new THREE.HemisphereLight(0x9ccde3, 0x0a120f, 0.62);
  scene.add(hemi);

  const moon = new THREE.DirectionalLight(0xd0e4ff, 1.2);
  moon.position.set(18, 34, 14);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 140;
  moon.shadow.camera.left = -70;
  moon.shadow.camera.right = 70;
  moon.shadow.camera.top = 70;
  moon.shadow.camera.bottom = -70;
  scene.add(moon);
}

function initBloodRain() {
  const count = 520;
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 150;
    positions[i * 3 + 1] = 12 + Math.random() * 90;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 150;
    speeds[i] = 16 + Math.random() * 20;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xb70a0a, size: 0.16, transparent: true, opacity: 0.72 });
  const points = new THREE.Points(geo, mat);
  points.visible = false;
  scene.add(points);

  bloodRain = { points, positions, speeds, count, ceiling: 96, floor: -10 };
}

function updateBloodRain(dt) {
  if (!bloodRain) {
    return;
  }

  bloodRain.points.visible = game.bloodMoon;
  if (!game.bloodMoon) {
    return;
  }

  const centerX = yaw.position.x;
  const centerZ = yaw.position.z;
  for (let i = 0; i < bloodRain.count; i += 1) {
    const base = i * 3;
    bloodRain.positions[base + 1] -= bloodRain.speeds[i] * dt;
    bloodRain.positions[base] += Math.sin((performance.now() * 0.001 + i) * 0.6) * 0.03;

    if (bloodRain.positions[base + 1] < bloodRain.floor) {
      bloodRain.positions[base] = centerX + (Math.random() - 0.5) * 120;
      bloodRain.positions[base + 1] = bloodRain.ceiling + Math.random() * 25;
      bloodRain.positions[base + 2] = centerZ + (Math.random() - 0.5) * 120;
    }
  }
  bloodRain.points.geometry.attributes.position.needsUpdate = true;
}

function addLevelMesh(mesh) {
  scene.add(mesh);
  levelMeshes.push(mesh);
}

function clearLevelLayout() {
  for (const mesh of levelMeshes) {
    scene.remove(mesh);
  }
  levelMeshes.length = 0;
  platforms.length = 0;
  obstacleColliders.length = 0;
  springs.length = 0;
  moonMesh = null;
  portalMesh = null;
  traderPig = null;
  setMarketPanelOpen(false);
}

function addObstacleCollider(x, z, w, d, minY = 0, maxY = 6) {
  obstacleColliders.push({ x, z, w, d, minY, maxY });
}

function createPlatform(x, y, z, w, h, d, color = 0x38515a) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.1 })
  );
  mesh.position.set(x, y - h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addLevelMesh(mesh);

  const platform = { x, z, w, d, h, top: y, sideSolid: true };
  platforms.push(platform);
  return platform;
}

function addSpring(platform, tint = 0x6ce6ff) {
  const spring = new THREE.Mesh(
    new THREE.CylinderGeometry(0.58, 0.58, 0.45, 16),
    new THREE.MeshStandardMaterial({ color: tint, emissive: 0x0d3342, emissiveIntensity: 0.85, roughness: 0.4 })
  );
  spring.position.set(platform.x, platform.top + 0.23, platform.z);
  spring.castShadow = true;
  spring.receiveShadow = true;
  addLevelMesh(spring);

  springs.push({ x: platform.x, z: platform.z, y: platform.top, radius: 0.68, mesh: spring });
}

function addParkourTower(level) {
  const difficulty = level - 1;
  summitY = BASE_SUMMIT_Y + difficulty * 7;
  towerHeight = summitY + 18;

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(68, 92),
    new THREE.MeshStandardMaterial({ color: 0x1e3528, roughness: 0.95, metalness: 0.05 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  addLevelMesh(floor);

  platforms.push({ x: 0, z: 0, w: 136, d: 136, h: 2, top: 0, sideSolid: false });

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(BOUNDARY_RADIUS - 0.45, BOUNDARY_RADIUS + 0.45, 128),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.18 })
  );
  ring.rotation.x = -Math.PI / 2;
  addLevelMesh(ring);

  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(4.5, 5.2, towerHeight, 22),
    new THREE.MeshStandardMaterial({ color: 0x2e3e45, roughness: 0.86, metalness: 0.14 })
  );
  tower.position.y = towerHeight / 2;
  tower.castShadow = true;
  tower.receiveShadow = true;
  addLevelMesh(tower);

  // Flat summit arena for a clean boss duel space.
  const summitArena = new THREE.Mesh(
    new THREE.CylinderGeometry(22, 23, 1.2, 48),
    new THREE.MeshStandardMaterial({ color: 0x4b3c33, roughness: 0.9, metalness: 0.08 })
  );
  summitArena.position.set(0, summitY - 0.6, 0);
  summitArena.castShadow = true;
  summitArena.receiveShadow = true;
  addLevelMesh(summitArena);
  platforms.push({ x: 0, z: 0, w: 44, d: 44, h: 1.2, top: summitY, sideSolid: false });

  const routePlatforms = [];

  const stepCount = 90 + difficulty * 12;
  const stepRise = 1.26 + difficulty * 0.03;
  const sideEvery = Math.max(4, 7 - Math.floor(difficulty / 2));
  const radiusBase = 8.2 + difficulty * 0.25;

  for (let i = 0; i < stepCount; i += 1) {
    const angle = i * (0.6 + difficulty * 0.01);
    const radius = radiusBase + (i % 3) * (1.25 + difficulty * 0.04);
    const y = 1.8 + i * stepRise + (i % 6 === 0 ? 0.35 : 0);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const p = createPlatform(x, y, z, Math.max(2.4, 3.8 - difficulty * 0.08), 0.55, Math.max(2.3, 3.6 - difficulty * 0.08), 0x4f6d74);
    routePlatforms.push(p);

    if (i % sideEvery === 2) {
      const sideX = Math.cos(angle + 0.35) * (radius + 3.4);
      const sideZ = Math.sin(angle + 0.35) * (radius + 3.4);
      const sideP = createPlatform(
        sideX,
        y + 0.9,
        sideZ,
        Math.max(1.8, 2.8 - difficulty * 0.05),
        0.5,
        Math.max(1.8, 2.8 - difficulty * 0.05),
        0x607f77
      );
      routePlatforms.push(sideP);
    }
  }

  createPlatform(0, summitY, 0, 18, 0.7, 18, 0x6a4d40);

  if (routePlatforms[8]) {
    addSpring(routePlatforms[8], 0x7df7ff);
  }
  if (routePlatforms[24]) {
    addSpring(routePlatforms[24], 0x84ffcf);
  }
  if (routePlatforms[40]) {
    addSpring(routePlatforms[40], 0xffd078);
  }
  if (routePlatforms[58]) {
    addSpring(routePlatforms[58], 0x9ec8ff);
  }
  if (routePlatforms[76]) {
    addSpring(routePlatforms[76], 0xff9be3);
  }

  const summitMark = new THREE.Mesh(
    new THREE.TorusGeometry(4.6, 0.24, 12, 30),
    new THREE.MeshBasicMaterial({ color: 0xff9358 })
  );
  summitMark.rotation.x = Math.PI / 2;
  summitMark.position.y = summitY + 0.12;
  addLevelMesh(summitMark);

  for (let i = 0; i < 60; i += 1) {
    const stoneH = 1.4 + Math.random() * 1.8;
    const stone = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, stoneH, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x69736f, roughness: 0.9 })
    );
    const angle = Math.random() * Math.PI * 2;
    const r = 47 + Math.random() * 12;
    stone.position.set(Math.cos(angle) * r, 0.8, Math.sin(angle) * r);
    stone.rotation.y = (Math.random() - 0.5) * 0.9;
    stone.rotation.z = (Math.random() - 0.5) * 0.15;
    stone.castShadow = true;
    stone.receiveShadow = true;
    addLevelMesh(stone);
    addObstacleCollider(stone.position.x, stone.position.z, 0.9, 0.34, 0, stoneH + 0.6);
  }

  // Large village around the tower.
  const houseMatA = new THREE.MeshStandardMaterial({ color: 0x4e5f68, roughness: 0.88, metalness: 0.07 });
  const houseMatB = new THREE.MeshStandardMaterial({ color: 0x6b4c42, roughness: 0.9, metalness: 0.05 });
  for (let i = 0; i < 54; i += 1) {
    const a = (i / 54) * Math.PI * 2;
    const r = 84 + (i % 5) * 7 + Math.random() * 10;
    const w = 8 + Math.random() * 8;
    const d = 8 + Math.random() * 9;
    const h = 12 + Math.random() * 24;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), i % 2 ? houseMatA : houseMatB);
    base.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    base.rotation.y = a + Math.PI / 2;
    base.castShadow = true;
    base.receiveShadow = true;
    addLevelMesh(base);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(w, d) * 0.42, 4 + Math.random() * 3, 4),
      new THREE.MeshStandardMaterial({ color: 0x2f2622, roughness: 0.95 })
    );
    roof.position.set(base.position.x, h + roof.geometry.parameters.height / 2, base.position.z);
    roof.rotation.y = base.rotation.y + Math.PI / 4;
    roof.castShadow = true;
    addLevelMesh(roof);
  }

  // Thick tree wall around perimeter so town exterior is visually blocked.
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3022, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x1f4a2f, roughness: 0.9 });
  for (let c = 0; c < 84; c += 1) {
    const clusterA = (c / 84) * Math.PI * 2;
    const clusterRadius = 62 + Math.random() * 3.2;
    const clusterX = Math.cos(clusterA) * clusterRadius;
    const clusterZ = Math.sin(clusterA) * clusterRadius;
    for (let t = 0; t < 8; t += 1) {
      const ox = (Math.random() - 0.5) * 2.8;
      const oz = (Math.random() - 0.5) * 2.8;
      const h = 8 + Math.random() * 7;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.62, h, 8), trunkMat);
      trunk.position.set(clusterX + ox, h / 2, clusterZ + oz);
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      addLevelMesh(trunk);

      const leaves = new THREE.Mesh(new THREE.SphereGeometry(2.4 + Math.random() * 1.7, 10, 10), leafMat);
      leaves.position.set(trunk.position.x, h + 1.8, trunk.position.z);
      leaves.castShadow = true;
      addLevelMesh(leaves);
    }
  }

  addMarketBooth();

  moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(7.2, 28, 28),
    new THREE.MeshBasicMaterial({ color: 0xfff5da, fog: false })
  );
  moonMesh.position.set(-46, 52, -70);
  addLevelMesh(moonMesh);

  const moonGlow = new THREE.Mesh(
    new THREE.SphereGeometry(11.2, 24, 24),
    new THREE.MeshBasicMaterial({
      color: 0xfff0bf,
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  );
  moonGlow.position.copy(moonMesh.position);
  addLevelMesh(moonGlow);
}

function addMarketBooth() {
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a34, roughness: 0.85 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x42231f, roughness: 0.92 });

  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(7.8, 8.2, 0.35, 24),
    new THREE.MeshStandardMaterial({ color: 0x52473f, roughness: 0.94 })
  );
  pad.position.set(MARKET_X, 0.18, MARKET_Z);
  pad.receiveShadow = true;
  addLevelMesh(pad);

  const stallBase = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.8, 8),
    wood
  );
  stallBase.position.set(MARKET_X, 0.4, MARKET_Z);
  stallBase.castShadow = true;
  stallBase.receiveShadow = true;
  addLevelMesh(stallBase);
  addObstacleCollider(MARKET_X, MARKET_Z, 10.4, 8.4, 0, 1.4);

  for (const [sx, sz] of [
    [-4.6, -3.6],
    [4.6, -3.6],
    [-4.6, 3.6],
    [4.6, 3.6],
  ]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.6, 0.35), wood);
    post.position.set(MARKET_X + sx, 1.8, MARKET_Z + sz);
    post.castShadow = true;
    post.receiveShadow = true;
    addLevelMesh(post);
    addObstacleCollider(post.position.x, post.position.z, 0.7, 0.7, 0, 4.2);
  }

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(10.8, 0.5, 8.8),
    cloth
  );
  roof.position.set(MARKET_X, 4.2, MARKET_Z);
  roof.castShadow = true;
  addLevelMesh(roof);

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 1.1, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x8b5a2b, emissive: 0x2c1708, emissiveIntensity: 0.5 })
  );
  sign.position.set(MARKET_X, 3.2, MARKET_Z - 4.5);
  sign.rotation.y = 0;
  sign.castShadow = true;
  addLevelMesh(sign);

  const counter = new THREE.Mesh(new THREE.BoxGeometry(8.8, 1.2, 1.3), wood);
  counter.position.set(MARKET_X, 1.1, MARKET_Z - 2.4);
  counter.castShadow = true;
  counter.receiveShadow = true;
  addLevelMesh(counter);
  addObstacleCollider(counter.position.x, counter.position.z, 9.1, 1.7, 0, 2.2);

  const crateMat = new THREE.MeshStandardMaterial({ color: 0x77563c, roughness: 0.9 });
  for (const [cx, cz] of [
    [-2.1, -1.1],
    [1.6, -0.9],
    [0.4, 1.3],
  ]) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), crateMat);
    crate.position.set(MARKET_X + cx, 0.6, MARKET_Z + cz);
    crate.castShadow = true;
    crate.receiveShadow = true;
    addLevelMesh(crate);
    addObstacleCollider(crate.position.x, crate.position.z, 1.35, 1.35, 0, 1.6);
  }

  traderPig = makeWingedPig(1.35, true);
  if (traderPig.userData.wingL) {
    traderPig.userData.wingL.visible = false;
  }
  if (traderPig.userData.wingR) {
    traderPig.userData.wingR.visible = false;
  }
  traderPig.position.set(MARKET_X, 0.9, MARKET_Z - 1.1);
  traderPig.lookAt(0, 0.8, 0);
  traderPig.traverse((child) => {
    if (child.isMesh && child.material && child.material.color) {
      if (child.material.emissive) {
        child.material.emissive.setHex(0x160b0b);
        child.material.emissiveIntensity = 0.45;
      }
    }
  });
  addLevelMesh(traderPig);
}

function isPlayerInMarket() {
  return Math.hypot(yaw.position.x - MARKET_X, yaw.position.z - MARKET_Z) <= MARKET_RADIUS;
}

function attemptMarketPurchase(slot) {
  if (!player.inMarket || !marketPanelOpen) {
    if (player.inMarket) {
      setMessage("Shoot the trader pig to open market", 900);
    }
    return;
  }

  if (slot === 1) {
    if (player.maxJumps >= 3) {
      setMessage("Already own Triple Jump Boots", 900);
      return;
    }
    if (game.coins < 50) {
      setMessage("Need 50 coins", 700);
      return;
    }
    game.coins -= 50;
    coinsEl.textContent = String(game.coins);
    player.maxJumps = 3;
    updateOwnedBadges();
    setMessage("Bought 3 Jump Boots", 1200);
    return;
  }

  if (slot === 2) {
    if (player.hasJetpack) {
      setMessage("Already own Jetpack", 900);
      return;
    }
    if (game.coins < 100) {
      setMessage("Need 100 coins", 700);
      return;
    }
    game.coins -= 100;
    coinsEl.textContent = String(game.coins);
    player.hasJetpack = true;
    updateOwnedBadges();
    setMessage("Bought Jetpack", 1200);
    return;
  }

  if (slot === 3) {
    if (player.hasSuperBazooka) {
      setMessage("Already own Super Bazooka", 900);
      return;
    }
    if (game.coins < 200) {
      setMessage("Need 200 coins", 700);
      return;
    }
    game.coins -= 200;
    coinsEl.textContent = String(game.coins);
    player.hasSuperBazooka = true;
    player.superProjectileCount = 5;
    updateOwnedBadges();
    setMessage("Bought Super Bazooka x5", 1200);
    return;
  }

  if (slot === 4) {
    if (player.hasSuperDuperBoots) {
      setMessage("Already own Super Duper Boots", 900);
      return;
    }
    if (game.coins < 1000) {
      setMessage("Need 1000 coins", 700);
      return;
    }
    game.coins -= 1000;
    coinsEl.textContent = String(game.coins);
    player.hasSuperDuperBoots = true;
    updateOwnedBadges();
    setMessage("Bought Super Duper Jump Boots", 1300);
  }
}

function tryOpenMarketFromAim() {
  if (!player.inMarket || !traderPig) {
    return false;
  }

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObject(traderPig, true);
  if (hits.length === 0) {
    return false;
  }

  setMarketPanelOpen(!marketPanelOpen);
  if (marketPanelOpen) {
    setMessage("Market Open - Press 1-4 to buy", 1200);
  } else {
    setMessage("Market Closed", 700);
  }
  return true;
}

function spawnMissileWithDirection(dir) {
  const origin = new THREE.Vector3();
  camera.getWorldPosition(origin);

  const missile = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 9, 9),
    new THREE.MeshStandardMaterial({ color: 0xff905f, emissive: 0xff632e, emissiveIntensity: 1.2 })
  );
  missile.position.copy(origin).addScaledVector(dir, 0.8);
  missile.castShadow = true;
  scene.add(missile);

  missiles.push({ mesh: missile, vel: dir.multiplyScalar(35), life: 2.3 });
}

function makeWingedPig(scale = 1, isBoss = false, isJolter = false) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: isBoss ? 0xa8615f : 0xde8b9f,
    roughness: 0.75,
    metalness: 0.05,
  });
  const rotMat = new THREE.MeshStandardMaterial({ color: 0x577749, roughness: 0.92, metalness: 0.02 });
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xcfc5b4, roughness: 0.7, metalness: 0.02 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: game.bloodMoon ? 0xff2727 : isBoss ? 0xff5a5a : 0xc0ff83 });
  const hornMat = new THREE.MeshStandardMaterial({ color: 0x4aa7ff, emissive: 0x123d72, emissiveIntensity: 0.9, roughness: 0.35 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.7, 1.7), bodyMat);
  body.position.y = 0.78;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.65, 0.76), bodyMat);
  head.position.set(0, 0.94, 1.08);
  head.castShadow = true;
  group.add(head);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.4), bodyMat);
  snout.position.set(0, 0.82, 1.46);
  snout.castShadow = true;
  group.add(snout);

  const rot = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.44), rotMat);
  rot.position.set(-0.22, 0.88, 0.82);
  rot.castShadow = true;
  group.add(rot);

  for (const x of [-0.16, 0.16]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 9, 9), eyeMat);
    eye.position.set(x, 0.99, 1.42);
    group.add(eye);
  }

  const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.2, 1.75), wingMat);
  wingL.position.set(-0.73, 0.95, 0.2);
  wingL.rotation.z = 0.55;
  wingL.castShadow = true;
  group.add(wingL);

  const wingR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.2, 1.75), wingMat);
  wingR.position.set(0.73, 0.95, 0.2);
  wingR.rotation.z = -0.55;
  wingR.castShadow = true;
  group.add(wingR);

  if (isJolter && !isBoss) {
    for (const x of [-0.32, 0.32]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.42, 8), hornMat);
      horn.position.set(x, 1.35, 0.98);
      horn.rotation.z = x < 0 ? 0.24 : -0.24;
      horn.castShadow = true;
      group.add(horn);
    }
  }

  group.scale.setScalar(scale);
  group.userData.eyes = [];
  for (const child of group.children) {
    if (child.material === eyeMat) {
      group.userData.eyes.push(child);
    }
  }
  group.userData.wingL = wingL;
  group.userData.wingR = wingR;
  return group;
}

function empowerPig(enemy) {
  if (enemy.enraged) {
    return;
  }

  enemy.enraged = true;
  enemy.speed *= enemy.isBoss ? 1.35 : 1.9;
  enemy.shove *= enemy.isBoss ? 1.25 : 1.65;

  const eyes = enemy.mesh.userData.eyes || [];
  for (const eye of eyes) {
    if (eye.material && eye.material.color) {
      eye.material.color.setHex(0xff2727);
    }
  }
}

function triggerBloodMoon() {
  if (game.bloodMoon) {
    return;
  }

  game.bloodMoon = true;
  scene.background.setHex(0x3d0d0d);
  scene.fog.color.setHex(0x3d0d0d);
  setMessage("Blood Moon Rising", 1800);

  if (moonMesh && moonMesh.material && moonMesh.material.color) {
    moonMesh.material.color.setHex(0xff5454);
  }

  for (const enemy of enemies) {
    empowerPig(enemy);
  }
}

function getCoinLandingY(x, z, startY) {
  let landingY = 0.03;

  for (const platform of platforms) {
    const withinX = Math.abs(x - platform.x) <= platform.w / 2 + 0.05;
    const withinZ = Math.abs(z - platform.z) <= platform.d / 2 + 0.05;
    if (!withinX || !withinZ) {
      continue;
    }

    if (platform.top <= startY + 0.8 && platform.top > landingY) {
      landingY = platform.top + 0.03;
    }
  }

  return landingY;
}

function makeCoin(position) {
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.06, 18),
    new THREE.MeshStandardMaterial({ color: 0xf8ca4f, emissive: 0x684f17, emissiveIntensity: 0.9 })
  );
  coin.rotation.x = Math.PI / 2;
  coin.position.copy(position);
  coin.position.y += 0.5;
  coin.castShadow = true;
  scene.add(coin);

  const floorY = getCoinLandingY(coin.position.x, coin.position.z, coin.position.y);
  coins.push({
    mesh: coin,
    born: performance.now(),
    velY: -1.5 - Math.random() * 1.8,
    floorY,
    grounded: false,
  });
}

function spawnPig(position, isBoss = false, isJolter = false) {
  const mesh = makeWingedPig(isBoss ? 2.25 : 1, isBoss, isJolter);
  mesh.position.copy(position);
  scene.add(mesh);

  const altitudeFactor = Math.min(5, game.stage);
  const levelFactor = 1 + (game.level - 1) * 0.15;
  const bossHp = 130 + (game.level - 1) * 55;
  enemies.push({
    mesh,
    hp: isBoss ? bossHp : Math.round((3 + altitudeFactor) * levelFactor),
    maxHp: isBoss ? bossHp : Math.round((3 + altitudeFactor) * levelFactor),
    speed: isBoss ? 2.2 + (game.level - 1) * 0.26 : (1.35 + altitudeFactor * 0.12) * levelFactor,
    isBoss,
    isJolter: !isBoss && isJolter,
    wingPhase: Math.random() * Math.PI * 2,
    attackCooldownUntil: 0,
    shove: isBoss ? 12 + (game.level - 1) * 2.2 : (7.2 + altitudeFactor * 0.35) * levelFactor,
    wanderUntil: 0,
    wanderAngle: Math.random() * Math.PI * 2,
    wanderStrength: 1,
    joltUntil: 0,
    joltCooldownUntil: 0,
    joltDir: new THREE.Vector3(),
  });

  if (!isBoss) {
    if (isJolter) {
      game.spawnedJolter += 1;
    } else {
      game.spawnedRegular += 1;
    }
  }

  if (game.bloodMoon) {
    empowerPig(enemies[enemies.length - 1]);
  }
}

function spawnThreatPig() {
  if (game.bossSpawned) {
    return;
  }

  const now = performance.now();
  const maxMobs = 8 + game.stage * 2 + game.level;
  if (enemies.filter((enemy) => !enemy.isBoss).length >= maxMobs) {
    game.nextThreatSpawnAt = now + 650;
    return;
  }

  const angle = Math.random() * Math.PI * 2;
  const dist = 10 + Math.random() * 12;
  const feet = yaw.position.y - EYE_HEIGHT;
  const y = Math.max(2.4, feet + 1.8 + (Math.random() - 0.5) * 4.2);
  const pos = new THREE.Vector3(yaw.position.x + Math.cos(angle) * dist, y, yaw.position.z + Math.sin(angle) * dist);
  const jolterCap = Math.floor(game.spawnedRegular / 10);
  const canSpawnJolter = game.spawnedJolter < jolterCap;
  const spawnJolter = canSpawnJolter && Math.random() < 0.26;
  spawnPig(pos, false, spawnJolter);

  const nextSpawnBase = Math.max(220, 980 - game.stage * 85 - game.level * 40);
  game.nextThreatSpawnAt = now + (game.bloodMoon ? nextSpawnBase * 0.72 : nextSpawnBase);
}

function dropRegularPigsForBoss() {
  for (const enemy of enemies) {
    if (enemy.isBoss || enemy.falling) {
      continue;
    }

    enemy.falling = true;
    enemy.fallVelocity = -1.2 - Math.random() * 1.6;
    enemy.speed = 0;

    if (enemy.mesh.userData.wingL) {
      enemy.mesh.userData.wingL.visible = false;
    }
    if (enemy.mesh.userData.wingR) {
      enemy.mesh.userData.wingR.visible = false;
    }
  }
}

function spawnBossIfNeeded() {
  if (game.bossSpawned || game.bossDefeated) {
    return;
  }
  const feet = yaw.position.y - EYE_HEIGHT;
  if (feet < summitY - 1.5) {
    return;
  }

  game.bossSpawned = true;
  dropRegularPigsForBoss();
  setMessage("Pig Lord Emerges", 2000);
  spawnPig(new THREE.Vector3(0, summitY + 3.5, 0), true);
}

function openLevelPortal() {
  if (portalMesh || game.level >= MAX_LEVELS) {
    return;
  }

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.26, 14, 30),
    new THREE.MeshStandardMaterial({ color: 0xa679ff, emissive: 0x3a1a66, emissiveIntensity: 1.2 })
  );
  ring.position.set(0, 0, 0);
  ring.rotation.y = Math.PI / 2;
  ring.castShadow = true;

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(1.45, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xe8d6ff, transparent: true, opacity: 0.48 })
  );
  core.position.set(0, 0, 0);

  portalMesh = new THREE.Group();
  portalMesh.position.set(0, summitY + 2.2, 0);
  portalMesh.add(ring);
  portalMesh.add(core);
  portalMesh.userData.ring = ring;
  portalMesh.userData.core = core;
  addLevelMesh(portalMesh);
  game.portalOpen = true;
  setMessage(`Portal Open - Enter for Level ${game.level + 1}`, 2200);
}

function advanceToNextLevel() {
  if (game.level >= MAX_LEVELS) {
    return;
  }

  clearWorldEntities();
  clearLevelLayout();

  game.level += 1;
  game.stage = 1;
  game.bossSpawned = false;
  game.bossDefeated = false;
  game.portalOpen = false;
  game.spawnedRegular = 0;
  game.spawnedJolter = 0;
  game.nextThreatSpawnAt = performance.now() + 1100;

  addParkourTower(game.level);
  setLevelBanner();
  setMarketPanelOpen(false);
  yaw.position.set(0, EYE_HEIGHT, 26);
  yaw.rotation.set(0, 0, 0);
  pitch.rotation.set(0, 0, 0);
  player.vel.set(0, 0, 0);
  player.grounded = false;
  player.jumpsUsed = 0;
  setMessage(`Level ${game.level} - Harder Climb`, 1600);
}

function updatePortal(dt) {
  if (!portalMesh) {
    return;
  }

  const ring = portalMesh.userData.ring;
  const core = portalMesh.userData.core;
  ring.rotation.z += dt * 1.6;
  ring.rotation.x += dt * 0.2;
  core.material.opacity = 0.38 + Math.sin(performance.now() * 0.01) * 0.14;

  if (yaw.position.distanceTo(portalMesh.position) < 2.25) {
    advanceToNextLevel();
  }
}

function shootMissile() {
  const now = performance.now();
  if (!game.active) {
    return;
  }

  if (tryOpenMarketFromAim()) {
    return;
  }

  if (now < game.canShootAt) {
    return;
  }
  game.canShootAt = now + game.shootCooldownMs;
  playShootSound();

  const baseDir = new THREE.Vector3();
  camera.getWorldDirection(baseDir);
  spawnMissileWithDirection(baseDir.clone());

  if (player.hasSuperBazooka) {
    for (let i = 0; i < player.superProjectileCount - 1; i += 1) {
      const spread = (i - (player.superProjectileCount - 2) / 2) * 0.03;
      const extraDir = baseDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
      spawnMissileWithDirection(extraDir);
    }
  }
}

function damagePlayer(amount) {
  game.hp = Math.max(0, game.hp - amount);
  healthEl.textContent = String(game.hp);
  if (game.hp <= 0) {
    gameOver("You Were Overrun");
  }
}

function explodeAt(position, radius = 5.2, baseDamage = 7) {
  playExplosionSound();

  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffa46f, transparent: true, opacity: 0.55 })
  );
  blast.position.copy(position);
  scene.add(blast);
  explosions.push({ mesh: blast, age: 0, maxAge: 0.18, maxScale: radius * 1.6 });

  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];
    const d = enemy.mesh.position.distanceTo(position);
    if (d > radius) {
      continue;
    }

    const dealt = Math.max(1, Math.round(baseDamage * (1 - d / radius) * (enemy.isBoss ? 0.8 : 1.3)));
    enemy.hp -= dealt;
    enemy.mesh.traverse((child) => {
      if (child.isMesh && child.material && child.material.emissive) {
        child.material.emissive.setHex(0x6e1818);
        child.material.emissiveIntensity = 0.9;
        setTimeout(() => {
          child.material.emissiveIntensity = 0;
        }, 90);
      }
    });

    if (enemy.hp <= 0) {
      if (enemy.isBoss) {
        game.bossDefeated = true;
        if (game.level >= MAX_LEVELS) {
          gameWin();
        } else {
          openLevelPortal();
        }
      }

      game.kills += enemy.isBoss ? 1 : 1;
      game.coins += 1;
      killsEl.textContent = String(game.kills);
      coinsEl.textContent = String(game.coins);
      scene.remove(enemy.mesh);
      enemies.splice(i, 1);
    }
  }
}

function resolveGroundAndFallDamage(previousFeet) {
  const feet = yaw.position.y - EYE_HEIGHT;
  let landedTop = null;

  for (const platform of platforms) {
    const withinX = Math.abs(yaw.position.x - platform.x) <= platform.w / 2 + 0.34;
    const withinZ = Math.abs(yaw.position.z - platform.z) <= platform.d / 2 + 0.34;
    if (!withinX || !withinZ) {
      continue;
    }
    if (previousFeet >= platform.top - 0.01 && feet <= platform.top && player.vel.y <= 0) {
      landedTop = landedTop === null ? platform.top : Math.max(landedTop, platform.top);
    }
  }

  if (landedTop !== null) {
    const impactSpeed = -player.vel.y;
    yaw.position.y = landedTop + EYE_HEIGHT;
    player.vel.y = 0;

    if (!player.grounded && impactSpeed > 13) {
      const dmg = Math.max(2, Math.round((impactSpeed - 12) * 2.2));
      damagePlayer(dmg);
      setMessage(`Fall Damage ${dmg}`, 800);
    }

    player.grounded = true;
    player.jumpsUsed = 0;
    return;
  }

  player.grounded = false;
}

function resolveHorizontalCollisions(previousPos) {
  const feet = yaw.position.y - EYE_HEIGHT;
  const head = yaw.position.y + 0.24;

  if (feet < towerHeight && head > 0) {
    const toPlayer = new THREE.Vector2(yaw.position.x, yaw.position.z);
    const dist = toPlayer.length();
    const minDist = TOWER_RADIUS + PLAYER_RADIUS;
    if (dist < minDist) {
      if (dist < 0.0001) {
        yaw.position.x = previousPos.x;
        yaw.position.z = previousPos.z;
      } else {
        toPlayer.multiplyScalar(minDist / dist);
        yaw.position.x = toPlayer.x;
        yaw.position.z = toPlayer.y;
      }
      player.vel.x = 0;
      player.vel.z = 0;
    }
  }

  for (const platform of platforms) {
    if (!platform.sideSolid) {
      continue;
    }

    // One-way behavior: when near/above the top surface, let landing logic handle it.
    if (feet >= platform.top - 0.45) {
      continue;
    }

    const verticalOverlap = feet < platform.top + platform.h + 0.35 && head > platform.top - 0.2;
    if (!verticalOverlap) {
      continue;
    }

    const halfW = platform.w / 2 + PLAYER_RADIUS;
    const halfD = platform.d / 2 + PLAYER_RADIUS;
    const dx = yaw.position.x - platform.x;
    const dz = yaw.position.z - platform.z;
    if (Math.abs(dx) > halfW || Math.abs(dz) > halfD) {
      continue;
    }

    const penX = halfW - Math.abs(dx);
    const penZ = halfD - Math.abs(dz);
    if (penX < penZ) {
      yaw.position.x += dx > 0 ? penX : -penX;
      player.vel.x = 0;
    } else {
      yaw.position.z += dz > 0 ? penZ : -penZ;
      player.vel.z = 0;
    }
  }

  for (const obstacle of obstacleColliders) {
    const verticalOverlap = feet < obstacle.maxY && head > obstacle.minY;
    if (!verticalOverlap) {
      continue;
    }

    const halfW = obstacle.w / 2 + PLAYER_RADIUS;
    const halfD = obstacle.d / 2 + PLAYER_RADIUS;
    const dx = yaw.position.x - obstacle.x;
    const dz = yaw.position.z - obstacle.z;
    if (Math.abs(dx) > halfW || Math.abs(dz) > halfD) {
      continue;
    }

    const penX = halfW - Math.abs(dx);
    const penZ = halfD - Math.abs(dz);
    if (penX < penZ) {
      yaw.position.x += dx > 0 ? penX : -penX;
      player.vel.x = 0;
    } else {
      yaw.position.z += dz > 0 ? penZ : -penZ;
      player.vel.z = 0;
    }
  }
}

function updateSprings(dt) {
  const now = performance.now();
  for (const spring of springs) {
    spring.mesh.rotation.y += dt * 3.6;
    spring.mesh.position.y = spring.y + 0.23 + Math.sin(now * 0.01 + spring.x * 0.1) * 0.05;

    const feet = yaw.position.y - EYE_HEIGHT;
    const closeY = Math.abs(feet - spring.y) < 0.22;
    const dist = Math.hypot(yaw.position.x - spring.x, yaw.position.z - spring.z);
    if (closeY && dist < spring.radius && player.vel.y <= 1.2) {
      player.vel.y = 15.8;
      player.grounded = false;
      player.jumpsUsed = 1;
      setMessage("Boing", 420);
    }
  }
}

function updatePlayer(dt) {
  moveDir.set(0, 0, 0);
  if (keys.w) {
    moveDir.z -= 1;
  }
  if (keys.s) {
    moveDir.z += 1;
  }
  if (keys.a) {
    moveDir.x -= 1;
  }
  if (keys.d) {
    moveDir.x += 1;
  }

  if (moveDir.lengthSq() > 0) {
    moveDir.normalize();
  }

  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() > 0) {
    forward.normalize();
  }
  right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
  if (right.lengthSq() > 0) {
    right.normalize();
  }

  const desired = new THREE.Vector3();
  desired.addScaledVector(forward, -moveDir.z);
  desired.addScaledVector(right, moveDir.x);
  if (desired.lengthSq() > 0) {
    desired.normalize();
  }

  const maxSpeed = keys.shift ? 11.4 : 7.6;
  const targetVx = desired.x * maxSpeed;
  const targetVz = desired.z * maxSpeed;
  const accel = player.grounded ? 22 : 9;
  const blend = Math.min(1, accel * dt);

  player.vel.x += (targetVx - player.vel.x) * blend;
  player.vel.z += (targetVz - player.vel.z) * blend;

  if (desired.lengthSq() === 0 && player.grounded) {
    const damping = Math.exp(-10.5 * dt);
    player.vel.x *= damping;
    player.vel.z *= damping;
  }

  if (input.jumpQueued) {
    input.jumpQueued = false;
    if (player.grounded || player.jumpsUsed < player.maxJumps) {
      const jumpBoost = player.hasSuperDuperBoots ? 33 : 0;
      player.vel.y = (player.grounded ? 9.4 : 8.7) + jumpBoost;
      player.grounded = false;
      player.jumpsUsed += 1;
      playJumpSound();
    }
  }

  const now = performance.now();
  if (input.jetpackQueued) {
    input.jetpackQueued = false;
    const canUseJetpack = player.hasJetpack;
    if (canUseJetpack && now >= player.jetpackCooldownUntil) {
      player.jetpackActiveUntil = now + 5000;
      player.jetpackCooldownUntil = now + 30000;
      setMessage("Jetpack Engaged", 900);
    } else if (canUseJetpack) {
      const left = Math.ceil((player.jetpackCooldownUntil - now) / 1000);
      setMessage(`Jetpack Cooldown ${Math.max(0, left)}s`, 700);
    }
  }

  const jetpackActive = now < player.jetpackActiveUntil;
  if (jetpackActive) {
    player.vel.y += 30 * dt;
    player.vel.y = Math.min(player.vel.y, 14.5);
  }

  player.vel.y -= jetpackActive ? 8.5 * dt : 23 * dt;
  player.vel.y = Math.max(player.vel.y, -38);

  const previousFeet = yaw.position.y - EYE_HEIGHT;
  const previousPos = yaw.position.clone();
  yaw.position.addScaledVector(player.vel, dt);
  resolveHorizontalCollisions(previousPos);
  clampArena();

  resolveGroundAndFallDamage(previousFeet);

  if (yaw.position.y - EYE_HEIGHT < -35) {
    gameOver("You Fell Into The Abyss");
  }

  const inMarketNow = isPlayerInMarket();
  if (inMarketNow && !player.inMarket) {
    setMessage("Shoot the trader pig to open market offers", 1700);
  }
  if (!inMarketNow && player.inMarket) {
    setMarketPanelOpen(false);
  }
  player.inMarket = inMarketNow;
}

function updateEnemies(dt) {
  const now = performance.now();

  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];

    if (enemy.falling) {
      enemy.fallVelocity -= 22 * dt;
      enemy.mesh.position.y += enemy.fallVelocity * dt;
      enemy.mesh.rotation.x += dt * 3;
      enemy.mesh.rotation.z += dt * 2.4;

      if (enemy.mesh.position.y < -40) {
        scene.remove(enemy.mesh);
        enemies.splice(i, 1);
      }
      continue;
    }

    const sanctuary = player.inMarket && !enemy.isBoss;
    const target = sanctuary
      ? new THREE.Vector3(enemy.mesh.position.x, enemy.mesh.position.y + 0.6, enemy.mesh.position.z)
      : new THREE.Vector3(yaw.position.x, yaw.position.y + (enemy.isBoss ? 2.4 : 0.8), yaw.position.z);
    const offsetSpin = now * (enemy.isBoss ? 0.0017 : 0.0035) + enemy.wingPhase;
    target.x += Math.cos(offsetSpin) * (enemy.isBoss ? 3.5 : 1.2);
    target.z += Math.sin(offsetSpin) * (enemy.isBoss ? 3.5 : 1.2);

    if (!enemy.isBoss && !sanctuary) {
      if (now >= enemy.wanderUntil) {
        enemy.wanderUntil = now + 380 + Math.random() * 620;
        enemy.wanderAngle = Math.random() * Math.PI * 2;
        enemy.wanderStrength = 0.55 + Math.random() * 1.45;
      }

      const wanderMag = enemy.isJolter ? 2.1 : 1.6;
      target.x += Math.cos(enemy.wanderAngle) * wanderMag * enemy.wanderStrength;
      target.z += Math.sin(enemy.wanderAngle) * wanderMag * enemy.wanderStrength;

      const strafe = Math.sin(now * 0.008 + enemy.wingPhase) * (enemy.isJolter ? 1.3 : 0.9);
      target.x += Math.cos(enemy.wanderAngle + Math.PI / 2) * strafe;
      target.z += Math.sin(enemy.wanderAngle + Math.PI / 2) * strafe;
    }

    // Keep enemies from stacking by steering away from nearby pigs.
    const separationRadius = enemy.isBoss ? 3.8 : enemy.isJolter ? 3.05 : 2.7;
    const separationRadiusSq = separationRadius * separationRadius;
    const separation = new THREE.Vector3();
    for (let j = 0; j < enemies.length; j += 1) {
      if (j === i) {
        continue;
      }
      const other = enemies[j];
      if (other.falling) {
        continue;
      }

      const dx = enemy.mesh.position.x - other.mesh.position.x;
      const dz = enemy.mesh.position.z - other.mesh.position.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < 0.0001 || dSq > separationRadiusSq) {
        continue;
      }

      const invLen = 1 / Math.sqrt(dSq);
      const weight = 1 - dSq / separationRadiusSq;
      separation.x += dx * invLen * weight;
      separation.z += dz * invLen * weight;
    }
    if (separation.lengthSq() > 0.0001) {
      const separationStrength = enemy.isBoss ? 2.6 : enemy.isJolter ? 2.3 : 2.1;
      target.addScaledVector(separation.normalize(), separationStrength);
    }

    const toTarget = target.sub(enemy.mesh.position);
    const dist = toTarget.length();
    if (dist > 0.001) {
      toTarget.normalize();
      const jolting = enemy.isJolter && now < enemy.joltUntil;
      const chaseSpeed = jolting ? enemy.speed * 5.3 : enemy.speed;
      const moveDirToUse = jolting && enemy.joltDir.lengthSq() > 0.001 ? enemy.joltDir : toTarget;
      enemy.mesh.position.addScaledVector(moveDirToUse, chaseSpeed * dt);
      enemy.mesh.rotation.y = Math.atan2(toTarget.x, toTarget.z);
    }

    if (enemy.isJolter && !sanctuary) {
      const horizontalToPlayer = new THREE.Vector3(yaw.position.x - enemy.mesh.position.x, 0, yaw.position.z - enemy.mesh.position.z);
      const distToPlayer = horizontalToPlayer.length();
      if (distToPlayer > 0.001) {
        horizontalToPlayer.normalize();
      }

      if (now >= enemy.joltCooldownUntil && now >= enemy.joltUntil && distToPlayer < 11.5) {
        enemy.joltDir.copy(horizontalToPlayer);
        enemy.joltDir.x += (Math.random() - 0.5) * 0.14;
        enemy.joltDir.z += (Math.random() - 0.5) * 0.14;
        enemy.joltDir.normalize();
        enemy.joltUntil = now + 340;
        enemy.joltCooldownUntil = now + 1200 + Math.random() * 520;
      }
    }

    const flap = Math.sin(now * (enemy.isBoss ? 0.016 : 0.024) + enemy.wingPhase);
    enemy.mesh.userData.wingL.rotation.z = 0.55 + flap * 0.4;
    enemy.mesh.userData.wingR.rotation.z = -0.55 - flap * 0.4;

    const aggroDist = game.bloodMoon ? (enemy.isBoss ? 3.7 : enemy.isJolter ? 2.95 : 2.55) : enemy.isBoss ? 3 : enemy.isJolter ? 2.6 : 2.05;
    if (!sanctuary && dist < aggroDist && now >= enemy.attackCooldownUntil) {
      const baseCd = enemy.isBoss ? 380 : enemy.isJolter ? 350 : 650;
      enemy.attackCooldownUntil = now + (game.bloodMoon ? baseCd * 0.74 : baseCd);
      const push = new THREE.Vector3().subVectors(yaw.position, enemy.mesh.position);
      push.y = 0;
      if (push.lengthSq() < 0.0001) {
        push.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      }
      push.normalize();
      const shovePower = enemy.isBoss ? enemy.shove * 2.05 : enemy.isJolter ? enemy.shove * 1.65 : enemy.shove;
      player.vel.x += push.x * shovePower;
      player.vel.z += push.z * shovePower;
      player.vel.y = Math.max(player.vel.y, enemy.isBoss ? 9.4 : enemy.isJolter ? 5.2 : 3.8);
      setMessage(enemy.isBoss ? "Pig Lord Slam" : enemy.isJolter ? "Blue Horn Jolt" : "Shoved", 320);
      if (!game.active) {
        return;
      }
    }
  }

  if (game.active && !game.bossDefeated && !game.bossSpawned && now >= game.nextThreatSpawnAt) {
    spawnThreatPig();
  }

  spawnBossIfNeeded();
}

function updateMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i -= 1) {
    const missile = missiles[i];
    missile.mesh.position.addScaledVector(missile.vel, dt);
    missile.life -= dt;

    let didExplode = missile.life <= 0;
    if (!didExplode && moonMesh && missile.mesh.position.distanceTo(moonMesh.position) < 4.5) {
      triggerBloodMoon();
      didExplode = true;
    }

    if (!didExplode) {
      for (const enemy of enemies) {
        const hitRadius = enemy.isBoss ? 2.4 : 1.25;
        if (enemy.mesh.position.distanceTo(missile.mesh.position) < hitRadius) {
          didExplode = true;
          break;
        }
      }
    }

    if (didExplode) {
      explodeAt(missile.mesh.position.clone(), 5.6, 10);
      scene.remove(missile.mesh);
      missiles.splice(i, 1);
    }
  }
}

function updateExplosions(dt) {
  for (let i = explosions.length - 1; i >= 0; i -= 1) {
    const ex = explosions[i];
    ex.age += dt;
    const t = ex.age / ex.maxAge;
    ex.mesh.scale.setScalar(1 + ex.maxScale * t);
    ex.mesh.material.opacity = Math.max(0, 0.55 * (1 - t));
    if (t >= 1) {
      scene.remove(ex.mesh);
      explosions.splice(i, 1);
    }
  }
}

function updateCoins(dt) {
  const now = performance.now();
  for (let i = coins.length - 1; i >= 0; i -= 1) {
    const coin = coins[i];
    coin.mesh.rotation.y += dt * 7.2;

    if (!coin.grounded) {
      coin.velY -= 24 * dt;
      coin.mesh.position.y += coin.velY * dt;

      if (coin.mesh.position.y <= coin.floorY) {
        coin.mesh.position.y = coin.floorY;
        if (Math.abs(coin.velY) > 2.2) {
          coin.velY = -coin.velY * 0.28;
        } else {
          coin.velY = 0;
          coin.grounded = true;
        }
      }
    }

    if (coin.mesh.position.distanceTo(yaw.position) < 1.4) {
      game.coins += 1;
      coinsEl.textContent = String(game.coins);
      scene.remove(coin.mesh);
      coins.splice(i, 1);
      continue;
    }

    if (now - coin.born > 12000) {
      scene.remove(coin.mesh);
      coins.splice(i, 1);
    }
  }
}

function updateHud() {
  const altitude = Math.max(0, yaw.position.y - EYE_HEIGHT);
  game.stage = Math.min(20, Math.max(1, Math.floor(altitude / 6) + 1));
  waveEl.textContent = `${game.level}/${MAX_LEVELS}`;
  setLevelBanner();
  altitudeEl.textContent = `${Math.round(altitude)}m`;

  const fogByHeight = 0.055 - Math.min(0.03, altitude * 0.00025);
  scene.fog.density = Math.max(0.02, fogByHeight);

  const boss = enemies.find((enemy) => enemy.isBoss);
  if (boss) {
    bossBarWrap.style.opacity = "1";
    bossBar.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
  } else {
    bossBarWrap.style.opacity = "0";
    bossBar.style.width = "0%";
  }
}

function clearWorldEntities() {
  for (const enemy of enemies) {
    scene.remove(enemy.mesh);
  }
  enemies.length = 0;

  for (const coin of coins) {
    scene.remove(coin.mesh);
  }
  coins.length = 0;

  for (const missile of missiles) {
    scene.remove(missile.mesh);
  }
  missiles.length = 0;

  for (const ex of explosions) {
    scene.remove(ex.mesh);
  }
  explosions.length = 0;
}

function resetGame() {
    game.spawnedRegular = 0;
    game.spawnedJolter = 0;
  clearWorldEntities();
  clearLevelLayout();

  game.hp = 100;
  game.coins = 0;
  game.kills = 0;
  game.level = 1;
  game.stage = 1;
  game.canShootAt = 0;
  game.messageUntil = 0;
  game.ended = false;
  game.paused = false;
  game.bossSpawned = false;
  game.bossDefeated = false;
  game.nextThreatSpawnAt = performance.now() + 900;
  game.bloodMoon = false;
  game.portalOpen = false;

  addParkourTower(game.level);
  setLevelBanner();
  setMarketPanelOpen(false);

  scene.background.setHex(0x091419);
  scene.fog.color.setHex(0x091419);
  if (moonMesh && moonMesh.material && moonMesh.material.color) {
    moonMesh.material.color.setHex(0xfff1ca);
  }

  player.vel.set(0, 0, 0);
  player.grounded = false;
  player.jumpsUsed = 0;
  player.maxJumps = 2;
  player.hasSuperBazooka = false;
  player.superProjectileCount = 1;
  player.hasJetpack = false;
  player.hasSuperDuperBoots = false;
  player.jetpackActiveUntil = 0;
  player.jetpackCooldownUntil = 0;
  player.inMarket = false;
  updateOwnedBadges();

  yaw.position.set(0, EYE_HEIGHT, 26);
  yaw.rotation.set(0, 0, 0);
  pitch.rotation.set(0, 0, 0);

  healthEl.textContent = "100";
  coinsEl.textContent = "0";
  killsEl.textContent = "0";
  waveEl.textContent = "1/10";
  altitudeEl.textContent = "0m";

  setMessage("Reach the summit", 1400);
}

function gameOver(text) {
  game.active = false;
  game.ended = true;
  game.paused = false;
  document.exitPointerLock();
  setMessage(text, 2400);
  overlay.classList.add("show");
  overlay.querySelector("h1").textContent = "Pig-Game";
  overlay.querySelector(".subtitle").textContent = `Final score: ${game.kills} kills, ${game.coins} coins.`;
  startButton.textContent = "Try Again";
  resetButton.style.display = "none";
}

function gameWin() {
  game.active = false;
  game.ended = true;
  game.paused = false;
  document.exitPointerLock();
  setMessage("Final Pig Lord Defeated", 2500);
  overlay.classList.add("show");
  overlay.querySelector("h1").textContent = "Great job you are porktastic!";
  overlay.querySelector(".subtitle").textContent = `All 10 levels cleared with ${game.kills} kills and ${game.coins} coins.`;
  startButton.textContent = "Play Again";
  resetButton.style.display = "none";
}

function onPointerLockChange() {
  if (document.pointerLockElement !== canvas && game.active && !game.ended) {
    game.active = false;
    game.paused = true;
    overlay.classList.add("show");
    overlay.querySelector("h1").textContent = "Paused";
    overlay.querySelector(".subtitle").textContent = "Click Enter The Farm to continue. Power-ups: shoot trader pig, buy with 1-4, use jetpack with F.";
    startButton.textContent = "Resume";
    resetButton.style.display = "inline-flex";
  }
}

function startGame() {
  if (!game.paused) {
    resetGame();
  }

  game.active = true;
  game.ended = false;
  game.paused = false;
  overlay.classList.remove("show");
  overlay.querySelector("h1").textContent = "Pig-Game";
  overlay.querySelector(".subtitle").textContent = "Climb the cursed tower and kill the Pig Lord at the summit.";
  startButton.textContent = "Enter The Farm";
  resetButton.style.display = "none";
  canvas.requestPointerLock();
}

function resetFromPause() {
  resetGame();
  game.active = true;
  game.ended = false;
  game.paused = false;
  overlay.classList.remove("show");
  overlay.querySelector("h1").textContent = "Pig-Game";
  overlay.querySelector(".subtitle").textContent = "Climb the cursed tower and kill the Pig Lord at the summit.";
  startButton.textContent = "Enter The Farm";
  resetButton.style.display = "none";
  canvas.requestPointerLock();
}

startButton.addEventListener("click", startGame);
resetButton.addEventListener("click", resetFromPause);
document.addEventListener("pointerlockchange", onPointerLockChange);

document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== canvas || !game.active) {
    return;
  }
  yaw.rotation.y -= event.movementX * 0.0019;
  pitch.rotation.x -= event.movementY * 0.0017;
  pitch.rotation.x = Math.max(-1.28, Math.min(1.2, pitch.rotation.x));
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (key === "w" || key === "a" || key === "s" || key === "d") {
    keys[key] = true;
  }
  if (key === "shift") {
    keys.shift = true;
  }
  if (key === " " || key === "space") {
    input.jumpQueued = true;
    event.preventDefault();
  }
  if (key === "f") {
    input.jetpackQueued = true;
  }
  if (key === "1" || key === "2" || key === "3" || key === "4") {
    attemptMarketPurchase(Number(key));
  }
});

document.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (key === "w" || key === "a" || key === "s" || key === "d") {
    keys[key] = false;
  }
  if (key === "shift") {
    keys.shift = false;
  }
});

document.addEventListener("mousedown", () => {
  if (document.pointerLockElement === canvas) {
    shootMissile();
  }
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (game.active) {
    updatePlayer(dt);
    updateSprings(dt);
    updateEnemies(dt);
    updateMissiles(dt);
    updateExplosions(dt);
    updateCoins(dt);
    updatePortal(dt);
    updateHud();
  }

  if (game.messageUntil > 0 && performance.now() > game.messageUntil) {
    messageEl.style.opacity = "0";
    game.messageUntil = 0;
  }

  updateBloodRain(dt);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

addLights();
initBloodRain();
animate();
