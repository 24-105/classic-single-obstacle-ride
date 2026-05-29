import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const canvas = document.querySelector("#stage");
const startButton = document.querySelector("#startButton");
const resetButton = document.querySelector("#resetButton");
const captureButton = document.querySelector("#captureButton");
const leftButton = document.querySelector("#leftButton");
const rightButton = document.querySelector("#rightButton");
const jumpButton = document.querySelector("#jumpButton");
const scoreValue = document.querySelector("#scoreValue");
const levelValue = document.querySelector("#levelValue");
const rushValue = document.querySelector("#rushValue");
const lifeValue = document.querySelector("#lifeValue");
const comboValue = document.querySelector("#comboValue");
const highScoreValue = document.querySelector("#highScoreValue");
const goalText = document.querySelector("#goalText");
const gameStatus = document.querySelector("#gameStatus");
const gameOverOverlay = document.querySelector("#gameOverOverlay");
const finalScoreValue = document.querySelector("#finalScoreValue");

const lanes = [1.35, 0, -1.35];
const game = {
  running: false,
  over: false,
  lane: 1,
  targetLane: 1,
  bikeX: 0,
  score: 0,
  distance: 0,
  lives: 3,
  combo: 1,
  comboTimer: 0,
  bestCombo: 1,
  rushMeter: 0,
  rushTimer: 0,
  coins: 0,
  nearMisses: 0,
  jumpDodges: 0,
  perfects: 0,
  perfectChain: 0,
  riskScore: 0,
  riskLane: null,
  riskTimer: 0,
  riskCooldown: 1.5,
  eventType: "",
  eventTimer: 0,
  eventCooldown: 5.5,
  missionIndex: 0,
  highScore: readSessionHighScore(),
  speed: 26,
  spawnTimer: 1.1,
  itemTimer: 2.1,
  invulnerable: 0,
  shieldTimer: 0,
  statusTimer: 0,
  statusText: "",
  jumpHeight: 0,
  jumpVelocity: 0,
  jumpCooldown: 0,
  jumpChain: 0,
  groundTimer: 1,
  lean: 0,
};
const MOBILE_RENDER_SCALE = 1;
const HUD_REFRESH_INTERVAL = 0.12;
const DIAGNOSTICS_FRAME_INTERVAL = 120;
const ROAD_MARKER_ROWS = 14;
const ROADSIDE_POST_ROWS = 12;
const BUILDING_COUNT = 8;
const BASE_SPEED = 26;
const MAX_SPEED = 158;
const MAX_OBSTACLES = 18;
const DIFFICULTY_SCORE_STEP = 360;
const MAX_DIFFICULTY_LEVEL = 9999;
const MAX_COMBO = 16;
const COMBO_WINDOW = 4.2;
const RUSH_DURATION = 5.5;
const FRONT_SPAWN_Z = 62;
const BACK_DESPAWN_Z = -12;
const PASS_Z = -1.28;
const HIT_ZONE_FRONT_Z = 0.28;
const HIT_ZONE_BACK_Z = -0.45;
const PERFECT_NEAR_MARGIN = 0.15;
const PERFECT_JUMP_WINDOW = 0.2;
const PERFECT_DUCK_HEIGHT = 0.12;
const RISK_ROUTE_DURATION = 8.2;
const RISK_ROUTE_SCORE_MULTIPLIER = 1.45;
const RANDOM_EVENT_MIN_DURATION = 7;
const RANDOM_EVENT_MAX_DURATION = 11;
const JUMP_GRAVITY = 10.6;
const JUMP_BASE_VELOCITY = 4.42;
const JUMP_MIN_VELOCITY = 3.18;
const JUMP_LANDING_RECOVERY = 0.32;
const JUMP_CHAIN_RECOVERY = 0.82;
const MAX_JUMP_CHAIN = 5;

const missions = [
  { label: "COINを3個集める", type: "coins", target: 3, reward: 900 },
  { label: "NEARを3回決める", type: "nearMisses", target: 3, reward: 1200 },
  { label: "PERFECTを3回決める", type: "perfects", target: 3, reward: 2100 },
  { label: "JUMP回避を4回決める", type: "jumpDodges", target: 4, reward: 1500 },
  { label: "COMBO x8到達", type: "combo", target: 8, reward: 1800 },
  { label: "RISKで500点稼ぐ", type: "riskScore", target: 500, reward: 2300 },
  { label: "LV 25到達", type: "level", target: 25, reward: 2400 },
  { label: "RUSH中に走り切る", type: "rush", target: 1, reward: 2600 },
];

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  powerPreference: "high-performance",
  preserveDrawingBuffer: false,
});
renderer.setPixelRatio(MOBILE_RENDER_SCALE);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#dce6e8");
scene.fog = new THREE.Fog("#dce6e8", 14, 48);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 140);
camera.position.set(0, 2.8, -11.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.enablePan = false;
controls.minDistance = 3.1;
controls.maxDistance = 13;
controls.minPolarAngle = 0.12;
controls.maxPolarAngle = Math.PI * 0.82;
controls.target.set(0, 1.2, 1.1);

const clock = new THREE.Clock();
const diagnostics = { node: null, frame: 0 };
const cameraTarget = new THREE.Vector3();
const defaultFogColor = new THREE.Color("#dce6e8");
const eventFogColor = new THREE.Color("#bdc7c9");
let hudRefreshTimer = 0;
const wheelMeshes = [];
const roadMarkers = [];
const roadsideObjects = [];
const obstacles = [];
const items = [];
let riskRouteMarker = null;
const modelState = {
  source: "light-bicycle",
  imported: null,
  loadError: "",
};

const worldGroup = new THREE.Group();
const roadGroup = new THREE.Group();
const obstacleGroup = new THREE.Group();
const bikeRig = new THREE.Group();
const bikeGroup = new THREE.Group();
const riderGroup = new THREE.Group();
scene.add(worldGroup, roadGroup, obstacleGroup, bikeRig);
bikeRig.add(bikeGroup, riderGroup);

const materials = createMaterials();
createLights();
createRoad();
createEnvironment();
createLightBicycle();
createRider();
bikeGroup.rotation.y = Math.PI;
riderGroup.rotation.y = Math.PI;
installDiagnostics();
initialize();
animate();

function initialize() {
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", handleKeydown);
  bindPress(startButton, toggleGame);
  bindPress(resetButton, resetGame);
  bindPress(captureButton, captureScene);
  bindPress(leftButton, () => moveLane(-1));
  bindPress(rightButton, () => moveLane(1));
  bindPress(jumpButton, jump);

  resetGame();
  resize();
}

function bindPress(element, handler) {
  let lastPointerPress = 0;
  const run = (event) => {
    event.preventDefault();
    lastPointerPress = performance.now();
    handler();
  };
  element.addEventListener(
    "pointerdown",
    run,
    { passive: false },
  );
  element.addEventListener("click", (event) => {
    event.preventDefault();
    if (performance.now() - lastPointerPress < 350) {
      return;
    }
    handler();
  });
}

function readSessionHighScore() {
  try {
    const value = Number(
      window.sessionStorage.getItem("bicycle-dash-high-score") || 0,
    );
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function saveSessionHighScore(score) {
  try {
    window.sessionStorage.setItem(
      "bicycle-dash-high-score",
      String(Math.floor(score)),
    );
  } catch {
    // Storage can be unavailable in strict private browsing modes.
  }
}

function setStatusMessage(text, seconds = 0.9) {
  game.statusText = text;
  game.statusTimer = seconds;
}

function setStartButtonState() {
  startButton.textContent = game.running ? "Ⅱ PAUSE" : "▶ START";
  startButton.classList.toggle("is-running", game.running);
}

function createMaterials() {
  const envMapIntensity = 0.7;
  return {
    asphalt: new THREE.MeshStandardMaterial({
      color: "#2f353b",
      roughness: 0.9,
      metalness: 0.02,
    }),
    lane: new THREE.MeshStandardMaterial({
      color: "#f1ead8",
      roughness: 0.45,
      metalness: 0.04,
    }),
    shoulder: new THREE.MeshStandardMaterial({
      color: "#737b82",
      roughness: 0.72,
      metalness: 0.06,
    }),
    grass: new THREE.MeshStandardMaterial({
      color: "#becac1",
      roughness: 0.95,
      metalness: 0.01,
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: "#06070a",
      roughness: 0.58,
      metalness: 0.02,
    }),
    chrome: new THREE.MeshStandardMaterial({
      color: "#eff4f5",
      roughness: 0.13,
      metalness: 0.98,
      envMapIntensity,
    }),
    rim: new THREE.MeshStandardMaterial({
      color: "#dce3e7",
      roughness: 0.16,
      metalness: 0.96,
      envMapIntensity,
    }),
    spoke: new THREE.MeshStandardMaterial({
      color: "#f3f6f7",
      roughness: 0.2,
      metalness: 0.9,
      envMapIntensity,
    }),
    frame: new THREE.MeshStandardMaterial({
      color: "#14171c",
      roughness: 0.38,
      metalness: 0.56,
      envMapIntensity,
    }),
    leather: new THREE.MeshStandardMaterial({
      color: "#121418",
      roughness: 0.52,
      metalness: 0.08,
    }),
    jacket: new THREE.MeshStandardMaterial({
      color: "#29424a",
      roughness: 0.58,
      metalness: 0.05,
    }),
    jacketPanel: new THREE.MeshStandardMaterial({
      color: "#3f6f73",
      roughness: 0.52,
      metalness: 0.08,
    }),
    denim: new THREE.MeshStandardMaterial({
      color: "#253847",
      roughness: 0.66,
      metalness: 0.03,
    }),
    glove: new THREE.MeshStandardMaterial({
      color: "#0b0d11",
      roughness: 0.45,
      metalness: 0.08,
    }),
    boot: new THREE.MeshStandardMaterial({
      color: "#090b0e",
      roughness: 0.52,
      metalness: 0.12,
    }),
    helmet: new THREE.MeshStandardMaterial({
      color: "#121720",
      roughness: 0.24,
      metalness: 0.42,
      envMapIntensity,
    }),
    visor: new THREE.MeshStandardMaterial({
      color: "#0a1620",
      roughness: 0.07,
      metalness: 0.28,
      transparent: true,
      opacity: 0.74,
    }),
    skin: new THREE.MeshStandardMaterial({
      color: "#c58a66",
      roughness: 0.62,
      metalness: 0.02,
    }),
    cone: new THREE.MeshStandardMaterial({
      color: "#d86f31",
      roughness: 0.5,
      metalness: 0.03,
    }),
    coneBand: new THREE.MeshStandardMaterial({
      color: "#fff7e8",
      roughness: 0.42,
      metalness: 0.03,
    }),
    barrier: new THREE.MeshStandardMaterial({
      color: "#d8dde0",
      roughness: 0.42,
      metalness: 0.24,
    }),
    warning: new THREE.MeshStandardMaterial({
      color: "#c9a45f",
      roughness: 0.42,
      metalness: 0.08,
    }),
    riskRoute: new THREE.MeshBasicMaterial({
      color: "#ffd15c",
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
    oil: new THREE.MeshStandardMaterial({
      color: "#10151a",
      roughness: 0.18,
      metalness: 0.34,
      transparent: true,
      opacity: 0.86,
    }),
    trap: new THREE.MeshStandardMaterial({
      color: "#e24d4d",
      roughness: 0.38,
      metalness: 0.16,
    }),
    spike: new THREE.MeshStandardMaterial({
      color: "#f0f5f6",
      roughness: 0.24,
      metalness: 0.72,
      envMapIntensity,
    }),
    bonus: new THREE.MeshBasicMaterial({ color: "#63e0a3" }),
    heart: new THREE.MeshBasicMaterial({ color: "#ff6686" }),
    shield: new THREE.MeshBasicMaterial({ color: "#64c7ff" }),
    star: new THREE.MeshBasicMaterial({ color: "#ffd15c" }),
  };
}

function createLights() {
  const hemi = new THREE.HemisphereLight("#ffffff", "#78828a", 1.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight("#fff7ed", 3.4);
  sun.position.set(-4.5, 7.5, 4.8);
  scene.add(sun);

  const rim = new THREE.PointLight("#bdefff", 1.5, 18);
  rim.position.set(4.2, 2.6, -3.4);
  scene.add(rim);

  const headlight = new THREE.SpotLight(
    "#fff2bd",
    8,
    26,
    Math.PI * 0.12,
    0.48,
    1.1,
  );
  headlight.position.set(0, 1.31, 1.72);
  headlight.target.position.set(0, 0.35, 9);
  bikeRig.add(headlight, headlight.target);
  return { hemi, sun, rim, headlight };
}

function createRoad() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 130),
    materials.grass,
  );
  ground.rotation.x = -Math.PI * 0.5;
  ground.position.y = -0.045;
  worldGroup.add(ground);

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 150),
    materials.asphalt,
  );
  road.rotation.x = -Math.PI * 0.5;
  roadGroup.add(road);

  riskRouteMarker = new THREE.Mesh(
    new THREE.PlaneGeometry(0.98, 150),
    materials.riskRoute,
  );
  riskRouteMarker.rotation.x = -Math.PI * 0.5;
  riskRouteMarker.position.y = 0.014;
  riskRouteMarker.visible = false;
  roadGroup.add(riskRouteMarker);

  [-3.15, 3.15].forEach((x) => {
    const shoulder = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 150),
      materials.shoulder,
    );
    shoulder.rotation.x = -Math.PI * 0.5;
    shoulder.position.set(x, 0.006, 0);
    roadGroup.add(shoulder);
  });

  [-0.86, 0.86].forEach((x) => {
    for (let index = 0; index < ROAD_MARKER_ROWS; index += 1) {
      const marker = new THREE.Mesh(
        new RoundedBoxGeometry(0.09, 0.012, 2.0, 2, 0.004),
        materials.lane,
      );
      marker.position.set(x, 0.018, index * -5.6 + 34);
      roadMarkers.push(marker);
      roadGroup.add(marker);
    }
  });
}

function createEnvironment() {
  const railMaterial = new THREE.MeshStandardMaterial({
    color: "#b7c1c6",
    roughness: 0.45,
    metalness: 0.42,
  });
  [-4.25, 4.25].forEach((x) => {
    const rail = new THREE.Mesh(
      new RoundedBoxGeometry(0.16, 0.2, 120, 3, 0.04),
      railMaterial,
    );
    rail.position.set(x, 0.52, -6);
    worldGroup.add(rail);
  });

  const postMaterial = new THREE.MeshStandardMaterial({
    color: "#596168",
    roughness: 0.55,
    metalness: 0.35,
  });
  for (let index = 0; index < ROADSIDE_POST_ROWS; index += 1) {
    [-4.25, 4.25].forEach((x) => {
      const post = new THREE.Mesh(
        new RoundedBoxGeometry(0.12, 0.78, 0.12, 2, 0.02),
        postMaterial,
      );
      post.position.set(x, 0.34, index * -5.2 + 40);
      roadsideObjects.push(post);
      worldGroup.add(post);
    });
  }

  const buildingMaterials = [
    new THREE.MeshStandardMaterial({
      color: "#9aa6ae",
      roughness: 0.82,
      metalness: 0.03,
    }),
    new THREE.MeshStandardMaterial({
      color: "#bbb4a8",
      roughness: 0.82,
      metalness: 0.02,
    }),
    new THREE.MeshStandardMaterial({
      color: "#7d8992",
      roughness: 0.84,
      metalness: 0.03,
    }),
  ];
  for (let index = 0; index < BUILDING_COUNT; index += 1) {
    const height = 1.4 + (index % 5) * 0.42;
    const width = 0.9 + (index % 3) * 0.34;
    const building = new THREE.Mesh(
      new RoundedBoxGeometry(width, height, 1.15, 2, 0.025),
      buildingMaterials[index % buildingMaterials.length],
    );
    const side = index % 2 === 0 ? -1 : 1;
    building.position.set(
      side * (6.2 + (index % 4) * 0.58),
      height / 2 - 0.02,
      index * -5.4 + 30,
    );
    roadsideObjects.push(building);
    worldGroup.add(building);
  }
}

function createLightBicycle() {
  const rearWheel = createWheel("rear");
  rearWheel.position.set(0, 0.58, 1.14);
  bikeGroup.add(rearWheel);
  wheelMeshes.push(rearWheel);

  const frontWheel = createWheel("front");
  frontWheel.position.set(0, 0.58, -1.18);
  bikeGroup.add(frontWheel);
  wheelMeshes.push(frontWheel);

  const frameTubes = [
    [v3(0, 0.68, 1.1), v3(0, 1.18, 0.2), 0.035],
    [v3(0, 0.68, -0.98), v3(0, 1.18, 0.2), 0.035],
    [v3(0, 0.68, 1.1), v3(0, 0.72, -0.72), 0.032],
    [v3(0, 0.68, -0.98), v3(0, 0.72, -0.72), 0.032],
    [v3(0, 0.72, -0.72), v3(0, 1.18, 0.2), 0.032],
    [v3(0, 1.18, 0.2), v3(0, 1.42, 0.86), 0.03],
  ];
  frameTubes.forEach(([start, end, radius]) =>
    bikeGroup.add(capsuleBetween(start, end, radius, materials.frame)),
  );

  bikeGroup.add(
    capsuleBetween(
      v3(-0.13, 0.58, 1.14),
      v3(-0.18, 0.85, 0.18),
      0.026,
      materials.frame,
    ),
    capsuleBetween(
      v3(0.13, 0.58, 1.14),
      v3(0.18, 0.85, 0.18),
      0.026,
      materials.frame,
    ),
    capsuleBetween(
      v3(-0.12, 0.58, -1.18),
      v3(-0.24, 1.3, -0.88),
      0.028,
      materials.chrome,
    ),
    capsuleBetween(
      v3(0.12, 0.58, -1.18),
      v3(0.24, 1.3, -0.88),
      0.028,
      materials.chrome,
    ),
    capsuleBetween(
      v3(-0.52, 1.45, -0.86),
      v3(0.52, 1.45, -0.86),
      0.032,
      materials.chrome,
    ),
    capsuleBetween(
      v3(-0.52, 1.45, -0.86),
      v3(-0.72, 1.42, -0.78),
      0.038,
      materials.rubber,
    ),
    capsuleBetween(
      v3(0.52, 1.45, -0.86),
      v3(0.72, 1.42, -0.78),
      0.038,
      materials.rubber,
    ),
  );

  const crank = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.06, 28),
    materials.chrome,
  );
  crank.rotation.z = Math.PI * 0.5;
  crank.position.set(0, 0.78, -0.18);

  const pedalLeft = new THREE.Mesh(
    new RoundedBoxGeometry(0.36, 0.045, 0.11, 2, 0.01),
    materials.rubber,
  );
  pedalLeft.position.set(-0.34, 0.78, -0.18);
  pedalLeft.rotation.z = 0.2;
  const pedalRight = pedalLeft.clone();
  pedalRight.position.x = 0.34;
  pedalRight.rotation.z = -0.2;

  const chain = capsuleBetween(
    v3(-0.08, 0.71, -0.18),
    v3(-0.12, 0.62, 1.12),
    0.014,
    materials.chrome,
  );
  const saddlePost = capsuleBetween(
    v3(0, 1.18, 0.2),
    v3(0, 1.48, 0.52),
    0.028,
    materials.chrome,
  );
  const saddle = new THREE.Mesh(
    new RoundedBoxGeometry(0.48, 0.1, 0.42, 4, 0.04),
    materials.leather,
  );
  saddle.position.set(0, 1.55, 0.62);
  saddle.rotation.x = 0.06;

  bikeGroup.add(crank, pedalLeft, pedalRight, chain, saddlePost, saddle);

  markShadow(bikeGroup);
}

function createWheel() {
  const wheel = new THREE.Group();
  const tire = new THREE.Mesh(
    new THREE.TorusGeometry(0.52, 0.042, 10, 44),
    materials.rubber,
  );
  tire.rotation.y = Math.PI * 0.5;
  wheel.add(tire);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.012, 8, 36),
    materials.rim,
  );
  rim.rotation.y = Math.PI * 0.5;
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 0.14, 16),
    materials.rim,
  );
  hub.rotation.z = Math.PI * 0.5;
  wheel.add(rim, hub);

  for (let index = 0; index < 14; index += 1) {
    const spoke = new THREE.Mesh(
      new RoundedBoxGeometry(0.007, 0.007, 0.42, 1, 0.002),
      materials.spoke,
    );
    spoke.rotation.y = Math.PI * 0.5;
    spoke.rotation.z = (index * Math.PI) / 7;
    spoke.position.x = index % 2 === 0 ? -0.018 : 0.018;
    wheel.add(spoke);
  }

  return wheel;
}

function createRider() {
  riderGroup.add(createHumanoidTorso(), createHelmet());

  const limbs = [
    [v3(-0.24, 2.1, -0.18), v3(-0.43, 1.8, -0.5), 0.058, materials.jacket],
    [v3(0.24, 2.1, -0.18), v3(0.43, 1.8, -0.5), 0.058, materials.jacket],
    [
      v3(-0.43, 1.8, -0.5),
      v3(-0.72, 1.44, -0.78),
      0.046,
      materials.jacketPanel,
    ],
    [v3(0.43, 1.8, -0.5), v3(0.72, 1.44, -0.78), 0.046, materials.jacketPanel],
    [v3(-0.15, 1.5, 0.52), v3(-0.34, 1.08, 0.02), 0.086, materials.denim],
    [v3(0.15, 1.5, 0.52), v3(0.34, 1.08, 0.02), 0.086, materials.denim],
    [v3(-0.34, 1.08, 0.02), v3(-0.34, 0.79, -0.18), 0.066, materials.denim],
    [v3(0.34, 1.08, 0.02), v3(0.34, 0.79, -0.18), 0.066, materials.denim],
  ];
  limbs.forEach(([start, end, radius, material]) =>
    riderGroup.add(capsuleBetween(start, end, radius, material)),
  );

  [
    [-0.72, 1.44, -0.78],
    [0.72, 1.44, -0.78],
  ].forEach(([x, y, z]) => {
    const glove = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 18, 10),
      materials.glove,
    );
    glove.position.set(x, y, z);
    glove.scale.set(1.16, 0.88, 0.9);
    riderGroup.add(glove);
  });

  [
    [-0.34, 0.75, -0.2, -0.12],
    [0.34, 0.75, -0.2, 0.12],
  ].forEach(([x, y, z, yaw]) => {
    const shoe = new THREE.Mesh(
      new RoundedBoxGeometry(0.2, 0.12, 0.34, 5, 0.035),
      materials.boot,
    );
    shoe.position.set(x, y, z);
    shoe.rotation.y = yaw;
    shoe.rotation.x = -0.08;
    riderGroup.add(shoe);
  });

  [
    [-0.34, 1.08, 0.02],
    [0.34, 1.08, 0.02],
  ].forEach(([x, y, z]) => {
    const knee = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 16, 10),
      materials.jacketPanel,
    );
    knee.position.set(x, y, z);
    knee.scale.set(1, 0.72, 0.9);
    riderGroup.add(knee);
  });

  markShadow(riderGroup);
}

function createHumanoidTorso() {
  const group = new THREE.Group();

  const hips = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 24, 14),
    materials.denim,
  );
  hips.position.set(0, 1.5, 0.5);
  hips.scale.set(1.12, 0.56, 0.78);

  const torso = capsuleBetween(
    v3(0, 1.66, 0.34),
    v3(0, 2.12, -0.2),
    0.22,
    materials.jacket,
  );
  torso.scale.x = 0.9;
  torso.scale.z = 0.78;

  const chestPanel = new THREE.Mesh(
    new RoundedBoxGeometry(0.34, 0.42, 0.055, 5, 0.025),
    materials.jacketPanel,
  );
  chestPanel.position.set(0, 1.98, -0.36);
  chestPanel.rotation.x = -0.72;

  const neck = capsuleBetween(
    v3(0, 2.22, -0.28),
    v3(0, 2.35, -0.38),
    0.075,
    materials.skin,
  );

  [-0.24, 0.24].forEach((x) => {
    const shoulder = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 10),
      materials.jacketPanel,
    );
    shoulder.position.set(x, 2.1, -0.18);
    shoulder.scale.set(1.08, 0.7, 0.88);
    group.add(shoulder);
  });

  group.add(hips, torso, chestPanel, neck);
  return group;
}

function createHelmet() {
  const helmet = new THREE.Group();
  helmet.position.set(0, 2.46, -0.48);
  helmet.rotation.x = -0.18;

  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 22, 14),
    materials.skin,
  );
  face.position.set(0, -0.03, -0.04);
  face.scale.set(0.92, 1.02, 0.88);

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 28, 16),
    materials.helmet,
  );
  shell.position.y = 0.03;
  shell.scale.set(1, 0.82, 1.06);

  const strap = new THREE.Mesh(
    new RoundedBoxGeometry(0.29, 0.035, 0.035, 3, 0.012),
    materials.glove,
  );
  strap.position.set(0, -0.14, -0.02);
  strap.rotation.x = 0.26;

  const visor = new THREE.Mesh(
    new RoundedBoxGeometry(0.26, 0.055, 0.035, 5, 0.018),
    materials.visor,
  );
  visor.position.set(0, 0.01, -0.23);
  visor.rotation.x = -0.08;

  helmet.add(face, shell, strap, visor);
  return helmet;
}

function getObstacleProfile(type) {
  const profiles = {
    cone: { width: 0.32, jumpClear: 0.28, collision: "ground", scoreJump: true },
    spikes: { width: 0.52, jumpClear: 0.36, collision: "ground", scoreJump: true },
    oil: { width: 0.58, jumpClear: 0.2, collision: "slip", scoreJump: false },
    overhead: {
      width: 0.62,
      jumpClear: 999,
      collision: "air",
      airHitMin: 0.32,
      scoreJump: false,
    },
    sweeper: {
      width: 0.48,
      jumpClear: 999,
      collision: "ground",
      motion: "sweep",
      scoreJump: false,
    },
    barrier: { width: 0.58, jumpClear: 999, collision: "ground", scoreJump: false },
    drum: { width: 0.42, jumpClear: 999, collision: "ground", scoreJump: false },
  };
  return profiles[type] || profiles.drum;
}

function createObstacle(type) {
  const profile = getObstacleProfile(type);
  const group = new THREE.Group();
  group.userData = {
    type,
    hit: false,
    passed: false,
    width: profile.width,
    jumpClear: profile.jumpClear,
    collision: profile.collision,
    airHitMin: profile.airHitMin || 999,
    motion: profile.motion || "",
    motionPhase: Math.random() * Math.PI * 2,
    scoreJump: profile.scoreJump,
  };

  if (type === "cone") {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.76, 24),
      materials.cone,
    );
    cone.position.y = 0.38;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.23, 0.055, 24),
      materials.coneBand,
    );
    band.position.y = 0.42;
    group.add(cone, band);
  } else if (type === "barrier") {
    const beam = new THREE.Mesh(
      new RoundedBoxGeometry(1.1, 0.36, 0.18, 5, 0.035),
      materials.barrier,
    );
    beam.position.y = 0.52;
    const stripeA = new THREE.Mesh(
      new RoundedBoxGeometry(0.14, 0.39, 0.19, 2, 0.012),
      materials.warning,
    );
    stripeA.position.set(-0.28, 0.52, -0.01);
    stripeA.rotation.z = -0.55;
    const stripeB = stripeA.clone();
    stripeB.position.x = 0.28;
    group.add(beam, stripeA, stripeB);
  } else if (type === "spikes") {
    const base = new THREE.Mesh(
      new RoundedBoxGeometry(1.05, 0.08, 0.46, 3, 0.015),
      materials.trap,
    );
    base.position.y = 0.06;
    group.add(base);
    [-0.36, -0.12, 0.12, 0.36].forEach((x) => {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.105, 0.38, 4),
        materials.spike,
      );
      spike.position.set(x, 0.29, 0);
      spike.rotation.y = Math.PI * 0.25;
      group.add(spike);
    });
  } else if (type === "oil") {
    const slick = new THREE.Mesh(
      new RoundedBoxGeometry(1.08, 0.024, 0.78, 6, 0.08),
      materials.oil,
    );
    slick.position.y = 0.02;
    const glint = new THREE.Mesh(
      new RoundedBoxGeometry(0.58, 0.028, 0.055, 3, 0.02),
      materials.shield,
    );
    glint.position.set(-0.12, 0.04, -0.12);
    glint.rotation.y = -0.28;
    group.add(slick, glint);
  } else if (type === "overhead") {
    const beam = new THREE.Mesh(
      new RoundedBoxGeometry(1.08, 0.14, 0.18, 4, 0.03),
      materials.trap,
    );
    beam.position.y = 1.58;
    const stripeA = new THREE.Mesh(
      new RoundedBoxGeometry(0.13, 0.16, 0.19, 2, 0.01),
      materials.coneBand,
    );
    stripeA.position.set(-0.22, 1.58, -0.01);
    stripeA.rotation.z = -0.58;
    const stripeB = stripeA.clone();
    stripeB.position.x = 0.22;
    const postA = new THREE.Mesh(
      new RoundedBoxGeometry(0.08, 1.1, 0.08, 2, 0.015),
      materials.barrier,
    );
    postA.position.set(-0.48, 0.72, 0);
    const postB = postA.clone();
    postB.position.x = 0.48;
    group.add(beam, stripeA, stripeB, postA, postB);
  } else if (type === "sweeper") {
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(0.82, 0.28, 0.24, 5, 0.035),
      materials.trap,
    );
    body.position.y = 0.42;
    const capA = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.08, 18),
      materials.warning,
    );
    capA.rotation.z = Math.PI * 0.5;
    capA.position.set(-0.45, 0.42, 0);
    const capB = capA.clone();
    capB.position.x = 0.45;
    const warning = new THREE.Mesh(
      new RoundedBoxGeometry(0.56, 0.055, 0.25, 2, 0.01),
      materials.coneBand,
    );
    warning.position.y = 0.42;
    warning.rotation.z = -0.5;
    group.add(body, capA, capB, warning);
  } else {
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.74, 28),
      materials.warning,
    );
    drum.position.y = 0.37;
    const capA = new THREE.Mesh(
      new THREE.CylinderGeometry(0.29, 0.29, 0.04, 28),
      materials.barrier,
    );
    capA.position.y = 0.76;
    const capB = capA.clone();
    capB.position.y = 0.02;
    group.add(drum, capA, capB);
  }

  markShadow(group);
  return group;
}

function createItem(type) {
  const group = new THREE.Group();
  group.userData = {
    type,
    collected: false,
    radius: 0.86,
  };

  if (type === "heart") {
    const left = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 14, 10),
      materials.heart,
    );
    left.position.set(-0.08, 0.1, 0);
    const right = left.clone();
    right.position.x = 0.08;
    const point = new THREE.Mesh(
      new THREE.ConeGeometry(0.19, 0.26, 16),
      materials.heart,
    );
    point.position.y = -0.07;
    point.rotation.z = Math.PI;
    group.add(left, right, point);
  } else if (type === "shield") {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.035, 8, 24),
      materials.shield,
    );
    ring.rotation.x = Math.PI * 0.5;
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 12, 8),
      materials.shield,
    );
    group.add(ring, core);
  } else if (type === "star") {
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.24, 0),
      materials.star,
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.018, 6, 24),
      materials.star,
    );
    ring.rotation.x = Math.PI * 0.5;
    group.add(core, ring);
  } else {
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.06, 22),
      materials.bonus,
    );
    coin.rotation.x = Math.PI * 0.5;
    const glow = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.018, 6, 22),
      materials.bonus,
    );
    glow.rotation.x = Math.PI * 0.5;
    group.add(coin, glow);
  }

  group.position.y = 0.82;
  return group;
}

function spawnObstacle() {
  const difficulty = getDifficulty();
  if (obstacles.length >= getMaxObstacleCount(difficulty)) {
    return;
  }

  if (
    difficulty.level >= 220 &&
    Math.random() < 0.12 + difficulty.nightmare * 0.36
  ) {
    spawnBaitJumpTrap(difficulty);
    return;
  }

  if (
    difficulty.level >= 120 &&
    Math.random() < 0.14 + difficulty.chaos * 0.24
  ) {
    spawnSweepTrap(difficulty);
    return;
  }

  if (
    difficulty.level >= 70 &&
    Math.random() < 0.16 + difficulty.chaos * 0.3
  ) {
    spawnAirGate(difficulty);
    return;
  }

  if (difficulty.level >= 45 && Math.random() < 0.16 + difficulty.chaos * 0.34) {
    spawnSlalom(difficulty);
    return;
  }

  if (difficulty.level >= 14 && Math.random() < 0.22 + difficulty.factor * 0.34) {
    spawnStaggeredRows(difficulty);
    return;
  }

  if (
    difficulty.level >= 5 &&
    Math.random() < 0.24 + difficulty.factor * 0.38
  ) {
    spawnBlockedRow(difficulty, FRONT_SPAWN_Z);
    return;
  }

  spawnSingleObstacle(difficulty, FRONT_SPAWN_Z);
}

function spawnSingleObstacle(difficulty, z) {
  if (obstacles.length >= getMaxObstacleCount(difficulty)) {
    return;
  }
  const roll = Math.random();
  const type = chooseObstacleType(roll, difficulty);
  const lane = Math.floor(Math.random() * lanes.length);
  addObstacle(type, lane, z);
}

function spawnBlockedRow(difficulty, z) {
  const gapLane = Math.floor(Math.random() * lanes.length);
  lanes.forEach((_, lane) => {
    if (
      lane === gapLane ||
      obstacles.length >= getMaxObstacleCount(difficulty)
    ) {
      return;
    }
    addObstacle(chooseObstacleType(Math.random(), difficulty), lane, z);
  });
}

function spawnStaggeredRows(difficulty) {
  const firstGap = Math.floor(Math.random() * lanes.length);
  const secondGap = (firstGap + (Math.random() < 0.5 ? 1 : 2)) % lanes.length;
  spawnBlockedRowWithGap(difficulty, firstGap, FRONT_SPAWN_Z);
  spawnBlockedRowWithGap(
    difficulty,
    secondGap,
    FRONT_SPAWN_Z + THREE.MathUtils.lerp(9.5, 6.2, difficulty.factor),
  );
}

function spawnBlockedRowWithGap(difficulty, gapLane, z) {
  lanes.forEach((_, lane) => {
    if (
      lane === gapLane ||
      obstacles.length >= getMaxObstacleCount(difficulty)
    ) {
      return;
    }
    addObstacle(chooseObstacleType(Math.random(), difficulty), lane, z);
  });
}

function spawnSlalom(difficulty) {
  const firstGap = Math.floor(Math.random() * lanes.length);
  for (let row = 0; row < 3; row += 1) {
    const gap = (firstGap + row) % lanes.length;
    const spacing = THREE.MathUtils.lerp(8.4, 5.2, difficulty.pressure);
    spawnBlockedRowWithGap(difficulty, gap, FRONT_SPAWN_Z + row * spacing);
  }
}

function spawnAirGate(difficulty) {
  const lane = Math.floor(Math.random() * lanes.length);
  addObstacle("overhead", lane, FRONT_SPAWN_Z);
  if (difficulty.level >= 110 && obstacles.length < getMaxObstacleCount(difficulty)) {
    const secondLane = (lane + (Math.random() < 0.5 ? 1 : 2)) % lanes.length;
    addObstacle("spikes", secondLane, FRONT_SPAWN_Z + 4.8);
  }
}

function spawnSweepTrap(difficulty) {
  const lane = Math.floor(Math.random() * lanes.length);
  addObstacle("sweeper", lane, FRONT_SPAWN_Z);
  if (difficulty.level >= 180) {
    const gapLane = (lane + (Math.random() < 0.5 ? 1 : 2)) % lanes.length;
    spawnBlockedRowWithGap(
      difficulty,
      gapLane,
      FRONT_SPAWN_Z + THREE.MathUtils.lerp(7.2, 4.7, difficulty.pressure),
    );
  }
}

function spawnBaitJumpTrap(difficulty) {
  const lane = Math.floor(Math.random() * lanes.length);
  addObstacle(Math.random() < 0.5 ? "cone" : "spikes", lane, FRONT_SPAWN_Z);
  if (obstacles.length < getMaxObstacleCount(difficulty)) {
    addObstacle(
      "overhead",
      lane,
      FRONT_SPAWN_Z + THREE.MathUtils.lerp(6.2, 3.9, difficulty.nightmare),
    );
  }
  if (obstacles.length < getMaxObstacleCount(difficulty)) {
    const sideLane = (lane + (Math.random() < 0.5 ? 1 : 2)) % lanes.length;
    addObstacle("oil", sideLane, FRONT_SPAWN_Z + 2.6);
  }
}

function addObstacle(type, lane, z) {
  const obstacle = createObstacle(type);
  obstacle.position.set(lanes[lane], 0, z);
  obstacle.userData.lane = lane;
  obstacle.userData.baseX = obstacle.position.x;
  obstacles.push(obstacle);
  obstacleGroup.add(obstacle);
}

function spawnItem(difficulty) {
  if (items.length >= 3) {
    return;
  }
  const roll = Math.random();
  const aidPenalty = difficulty.nightmare * 0.1 + difficulty.absurd * 0.08;
  const supportScale = 1 - Math.min(0.55, aidPenalty * 2.2);
  const coinCutoff = 0.66 + aidPenalty;
  const shieldCutoff = coinCutoff + 0.14 * supportScale;
  const heartCutoff = shieldCutoff + 0.1 * supportScale;
  const type =
    roll < coinCutoff
      ? "coin"
      : roll < shieldCutoff
        ? "shield"
        : roll < heartCutoff
          ? "heart"
          : "star";
  const lane = Math.floor(Math.random() * lanes.length);
  const item = createItem(type);
  item.position.x = lanes[lane];
  item.position.z =
    FRONT_SPAWN_Z + THREE.MathUtils.randFloat(4, 13 - difficulty.factor * 4);
  item.userData.lane = lane;
  items.push(item);
  obstacleGroup.add(item);
}

function applyItem(item) {
  const type = item.userData.type;
  if (type === "heart") {
    game.lives = Math.min(4, game.lives + 1);
    bumpCombo(1);
    chargeRush(8);
    setStatusMessage("+LIFE");
  } else if (type === "shield") {
    game.shieldTimer = 4.8;
    bumpCombo(1);
    chargeRush(14);
    setStatusMessage("SHIELD");
  } else if (type === "star") {
    startRush();
    bumpCombo(3);
    awardScore(600 + getDifficulty().level * 10, "RUSH");
  } else {
    game.coins += 1;
    bumpCombo(1);
    chargeRush(10);
    awardScore(180 + getDifficulty().level * 8, "COIN");
  }
  checkMission();
  updateHighScore();
}

function chooseObstacleType(roll, difficulty) {
  if (difficulty.level < 8) {
    return roll < 0.58 ? "cone" : roll < 0.88 ? "drum" : "barrier";
  }
  if (difficulty.level < 28) {
    return roll < 0.42 ? "cone" : roll < 0.72 ? "drum" : roll < 0.9 ? "barrier" : "spikes";
  }
  if (difficulty.level < 75) {
    return roll < 0.28
      ? "cone"
      : roll < 0.54
        ? "drum"
        : roll < 0.76
          ? "barrier"
          : roll < 0.9
            ? "spikes"
            : "oil";
  }
  if (difficulty.level < 180) {
    return roll < 0.2
      ? "cone"
      : roll < 0.42
        ? "drum"
        : roll < 0.62
          ? "barrier"
          : roll < 0.78
            ? "spikes"
            : roll < 0.92
              ? "oil"
              : "sweeper";
  }
  return roll < 0.14
    ? "cone"
    : roll < 0.3
      ? "drum"
      : roll < 0.48
        ? "barrier"
        : roll < 0.66
          ? "spikes"
          : roll < 0.84
            ? "oil"
            : "sweeper";
}

function getDifficulty() {
  const level = THREE.MathUtils.clamp(
    Math.floor(game.score / DIFFICULTY_SCORE_STEP) + 1,
    1,
    MAX_DIFFICULTY_LEVEL,
  );
  const factor = Math.min(1, Math.log1p(level) / Math.log1p(420));
  const pressure = Math.min(1, level / 240);
  const chaos = Math.min(1, Math.max(0, level - 35) / 340);
  const nightmare = Math.min(1, Math.max(0, level - 160) / 1400);
  const absurd = Math.min(1, Math.max(0, level - 1200) / 5200);
  return { level, factor, pressure, chaos, nightmare, absurd };
}

function getTargetSpeed(difficulty) {
  const rushBoost = game.rushTimer > 0 ? 10 : 0;
  return (
    THREE.MathUtils.lerp(BASE_SPEED + 8, MAX_SPEED, difficulty.pressure) +
    difficulty.nightmare * 18 +
    difficulty.absurd * 12 +
    rushBoost
  );
}

function getSpawnDelay(difficulty) {
  let center =
    THREE.MathUtils.lerp(1.0, 0.19, difficulty.pressure) -
    difficulty.nightmare * 0.045 -
    difficulty.absurd * 0.035;
  if (game.eventType === "traffic") {
    center *= 0.72;
  } else if (game.eventType === "fog") {
    center *= 0.9;
  }
  const jitter = THREE.MathUtils.lerp(0.24, 0.035, difficulty.factor);
  return THREE.MathUtils.randFloat(Math.max(0.11, center - jitter), center + jitter);
}

function getItemDelay(difficulty) {
  const center =
    THREE.MathUtils.lerp(2.7, 1.36, difficulty.factor) +
    difficulty.nightmare * 0.42 +
    difficulty.absurd * 0.36;
  return THREE.MathUtils.randFloat(center * 0.72, center * 1.12);
}

function getMaxObstacleCount(difficulty) {
  const eventExtra = game.eventType === "traffic" ? 3 : game.eventType === "fog" ? 1 : 0;
  return Math.round(
    THREE.MathUtils.lerp(4, MAX_OBSTACLES, Math.max(difficulty.pressure, difficulty.nightmare)),
  ) + eventExtra;
}

function bumpCombo(amount = 1) {
  game.combo = THREE.MathUtils.clamp(game.combo + amount, 1, MAX_COMBO);
  game.comboTimer = COMBO_WINDOW;
  game.bestCombo = Math.max(game.bestCombo, game.combo);
}

function resetCombo() {
  game.combo = 1;
  game.comboTimer = 0;
}

function chargeRush(amount) {
  game.rushMeter = Math.min(100, game.rushMeter + amount);
  if (game.rushMeter >= 100) {
    startRush();
  }
}

function startRush() {
  game.rushMeter = 0;
  game.rushTimer = Math.max(game.rushTimer, RUSH_DURATION);
  game.shieldTimer = Math.max(game.shieldTimer, RUSH_DURATION);
  setStatusMessage("RUSH MODE", 1.2);
}

function getRiskLaneLabel(lane = game.riskLane) {
  return ["RIGHT", "CENTER", "LEFT"][lane] || "";
}

function isOnRiskRoute() {
  return (
    game.riskLane !== null &&
    game.riskTimer > 0 &&
    Math.abs(game.bikeX - lanes[game.riskLane]) < 0.5
  );
}

function getEventScoreMultiplier() {
  return game.eventTimer > 0 ? 1.16 : 1;
}

function addScore(amount, countsForRisk = false) {
  game.score += amount;
  if (countsForRisk && isOnRiskRoute()) {
    game.riskScore += amount;
  }
}

function awardScore(base, label = "") {
  const rushBonus = game.rushTimer > 0 ? 1.7 : 1;
  const riskBonus = isOnRiskRoute() ? RISK_ROUTE_SCORE_MULTIPLIER : 1;
  const eventBonus = getEventScoreMultiplier();
  const amount = Math.round(base * game.combo * rushBonus * riskBonus * eventBonus);
  addScore(amount, riskBonus > 1);
  if (label) {
    const prefix = riskBonus > 1 ? "RISK " : "";
    setStatusMessage(`${prefix}${label} +${amount}`);
  }
  updateHighScore();
}

function getMission() {
  return missions[game.missionIndex % missions.length];
}

function getMissionProgress(mission, difficulty = getDifficulty()) {
  if (mission.type === "coins") return game.coins;
  if (mission.type === "nearMisses") return game.nearMisses;
  if (mission.type === "jumpDodges") return game.jumpDodges;
  if (mission.type === "perfects") return game.perfects;
  if (mission.type === "riskScore") return Math.floor(game.riskScore);
  if (mission.type === "combo") return game.bestCombo;
  if (mission.type === "level") return difficulty.level;
  if (mission.type === "rush") return game.rushTimer > 0 ? 1 : 0;
  return 0;
}

function checkMission() {
  const mission = getMission();
  if (getMissionProgress(mission) < mission.target) {
    return;
  }
  const reward = mission.reward + getDifficulty().level * 20;
  game.score += reward;
  game.missionIndex += 1;
  game.coins = 0;
  game.nearMisses = 0;
  game.jumpDodges = 0;
  game.perfects = 0;
  game.riskScore = 0;
  game.bestCombo = game.combo;
  chargeRush(28);
  setStatusMessage(`GOAL +${reward}`, 1.35);
  updateHighScore();
}

function updateHighScore() {
  if (game.score <= game.highScore) {
    return;
  }
  game.highScore = game.score;
  saveSessionHighScore(game.highScore);
}

function getObstacleHitType(obstacle, lateral) {
  if (lateral >= obstacle.userData.width) {
    return "";
  }
  if (obstacle.userData.collision === "air") {
    return game.jumpHeight > obstacle.userData.airHitMin ? "hit" : "";
  }
  if (obstacle.userData.collision === "slip") {
    return game.jumpHeight > obstacle.userData.jumpClear ? "" : "slip";
  }
  return game.jumpHeight > obstacle.userData.jumpClear ? "" : "hit";
}

function getPassResult(obstacle, lateral) {
  const nearGap = lateral - obstacle.userData.width;
  const nearMiss = nearGap >= 0 && nearGap < 0.46;
  const jumpedObstacle =
    obstacle.userData.scoreJump &&
    lateral < obstacle.userData.width &&
    game.jumpHeight > obstacle.userData.jumpClear;
  const duckedAirGate =
    obstacle.userData.collision === "air" &&
    lateral < obstacle.userData.width &&
    game.jumpHeight < obstacle.userData.airHitMin * 0.45;

  if (nearMiss && nearGap < PERFECT_NEAR_MARGIN) {
    return { kind: "perfect", label: "PERFECT", base: 320 };
  }
  if (
    jumpedObstacle &&
    game.jumpHeight - obstacle.userData.jumpClear < PERFECT_JUMP_WINDOW
  ) {
    return { kind: "perfectJump", label: "PERFECT", base: 300 };
  }
  if (duckedAirGate && game.jumpHeight < PERFECT_DUCK_HEIGHT) {
    return { kind: "perfectLow", label: "PERFECT", base: 310 };
  }
  if (nearMiss) {
    return { kind: "near", label: "NEAR", base: 150 };
  }
  if (jumpedObstacle) {
    return { kind: "jump", label: "JUMP", base: 130 };
  }
  if (duckedAirGate) {
    return { kind: "low", label: "LOW", base: 145 };
  }
  return null;
}

function applyPassReward(result) {
  if (!result) {
    awardScore(82);
    return;
  }
  const isPerfect = result.kind.startsWith("perfect");
  if (result.kind === "near" || result.kind === "perfect") {
    game.nearMisses += 1;
  }
  if (result.kind === "jump" || result.kind === "perfectJump") {
    game.jumpDodges += 1;
  }
  if (isPerfect) {
    game.perfects += 1;
    game.perfectChain += 1;
    bumpCombo(2);
    chargeRush(18);
    awardScore(result.base + game.perfectChain * 24, result.label);
    if (game.perfectChain > 0 && game.perfectChain % 3 === 0) {
      awardScore(220 + game.perfectChain * 20, "CHAIN");
    }
  } else {
    game.perfectChain = 0;
    bumpCombo(1);
    chargeRush(result.kind === "near" ? 12 : 10);
    awardScore(result.base, result.label);
  }
  checkMission();
}

function applySlipTrap() {
  if (game.invulnerable > 0) {
    return;
  }
  const edgePush =
    game.targetLane === 0 ? 1 : game.targetLane === lanes.length - 1 ? -1 : 0;
  const direction = edgePush || (Math.random() < 0.5 ? -1 : 1);
  game.targetLane = THREE.MathUtils.clamp(
    game.targetLane + direction,
    0,
    lanes.length - 1,
  );
  game.speed = Math.max(BASE_SPEED, game.speed * 0.92);
  game.invulnerable = 0.16;
  game.perfectChain = 0;
  resetCombo();
  setStatusMessage("SLIP", 0.85);
}

function chooseRiskLane() {
  const previousLane = game.riskLane;
  let nextLane = Math.floor(Math.random() * lanes.length);
  if (previousLane !== null && lanes.length > 1 && nextLane === previousLane) {
    nextLane = (nextLane + (Math.random() < 0.5 ? 1 : 2)) % lanes.length;
  }
  game.riskLane = nextLane;
  game.riskTimer = RISK_ROUTE_DURATION;
  setStatusMessage(`RISK ${getRiskLaneLabel()} +45%`, 1.3);
}

function updateRiskRoute(delta, difficulty) {
  if (!game.running || game.over) {
    updateRiskRouteMarker();
    return;
  }
  if (game.riskTimer > 0) {
    game.riskTimer = Math.max(0, game.riskTimer - delta);
  } else {
    game.riskCooldown -= delta;
    if (game.riskCooldown <= 0) {
      chooseRiskLane();
      game.riskCooldown = THREE.MathUtils.randFloat(
        4.8,
        7.6 - difficulty.chaos * 1.4,
      );
    }
  }
  updateRiskRouteMarker();
}

function updateRiskRouteMarker() {
  if (!riskRouteMarker) {
    return;
  }
  riskRouteMarker.visible = game.riskLane !== null && game.riskTimer > 0;
  if (!riskRouteMarker.visible) {
    return;
  }
  riskRouteMarker.position.x = lanes[game.riskLane];
  materials.riskRoute.opacity =
    0.14 + Math.sin(clock.elapsedTime * 5.2) * 0.04 + (isOnRiskRoute() ? 0.08 : 0);
}

function getEventLabel(type = game.eventType) {
  if (type === "gust") return "GUST";
  if (type === "fog") return "FOG";
  if (type === "traffic") return "RUSH HOUR";
  return "";
}

function startRandomEvent(difficulty) {
  const candidates =
    difficulty.level < 12 ? ["gust", "fog"] : ["gust", "fog", "traffic"];
  game.eventType = candidates[Math.floor(Math.random() * candidates.length)];
  game.eventTimer =
    THREE.MathUtils.randFloat(RANDOM_EVENT_MIN_DURATION, RANDOM_EVENT_MAX_DURATION) +
    difficulty.nightmare * 3;
  setStatusMessage(`${getEventLabel()} EVENT`, 1.25);
}

function updateRandomEvent(delta, difficulty) {
  if (!game.running || game.over) {
    applyEventVisuals();
    return;
  }
  if (game.eventTimer > 0) {
    game.eventTimer = Math.max(0, game.eventTimer - delta);
    if (game.eventTimer === 0) {
      game.eventType = "";
      game.eventCooldown = THREE.MathUtils.randFloat(
        10.5,
        16 - difficulty.chaos * 3.2,
      );
      setStatusMessage("CLEAR", 0.7);
    }
  } else {
    game.eventCooldown -= delta;
    if (game.eventCooldown <= 0) {
      startRandomEvent(difficulty);
    }
  }
  applyEventVisuals();
}

function applyEventVisuals() {
  if (game.eventType === "fog") {
    scene.background.copy(eventFogColor);
    scene.fog.color.copy(eventFogColor);
    scene.fog.near = 7.5;
    scene.fog.far = 27;
    return;
  }
  scene.background.copy(defaultFogColor);
  scene.fog.color.copy(defaultFogColor);
  scene.fog.near = 14;
  scene.fog.far = 48;
}

function updateGame(delta) {
  const difficulty = getDifficulty();
  updateRiskRoute(delta, difficulty);
  updateRandomEvent(delta, difficulty);

  const eventDrift =
    game.eventType === "gust"
      ? Math.sin(clock.elapsedTime * 2.6) * THREE.MathUtils.lerp(0.15, 0.34, difficulty.chaos)
      : 0;
  const targetX = lanes[game.targetLane] + eventDrift;
  const previousX = game.bikeX;
  game.bikeX = THREE.MathUtils.lerp(
    game.bikeX,
    targetX,
    THREE.MathUtils.lerp(0.12, 0.17, difficulty.factor),
  );
  game.lean = THREE.MathUtils.lerp(
    game.lean,
    THREE.MathUtils.clamp((previousX - game.bikeX) * 1.8, -0.38, 0.38),
    0.18,
  );

  if (game.jumpCooldown > 0) {
    game.jumpCooldown = Math.max(0, game.jumpCooldown - delta);
  }
  if (game.jumpHeight > 0 || game.jumpVelocity > 0) {
    game.groundTimer = 0;
    game.jumpVelocity -= JUMP_GRAVITY * delta;
    game.jumpHeight += game.jumpVelocity * delta;
    if (game.jumpHeight <= 0) {
      game.jumpHeight = 0;
      game.jumpVelocity = 0;
      game.jumpCooldown = Math.max(
        game.jumpCooldown,
        JUMP_LANDING_RECOVERY + Math.min(0.24, game.jumpChain * 0.055),
      );
    }
  } else {
    game.groundTimer += delta;
    if (game.groundTimer > JUMP_CHAIN_RECOVERY && game.jumpChain > 0) {
      game.jumpChain = Math.max(0, game.jumpChain - delta * 1.8);
    }
  }

  const speedUnits = game.running ? game.speed / 3.6 : 0;
  if (game.running) {
    game.distance += (game.speed * delta) / 3600;
    const runScore =
      delta *
      game.speed *
      THREE.MathUtils.lerp(0.9, 1.42, difficulty.factor) *
      (game.rushTimer > 0 ? 1.45 : 1) *
      (isOnRiskRoute() ? RISK_ROUTE_SCORE_MULTIPLIER : 1) *
      getEventScoreMultiplier();
    addScore(runScore, isOnRiskRoute());
    game.spawnTimer -= delta;
    game.itemTimer -= delta;
    if (game.spawnTimer <= 0) {
      spawnObstacle();
      game.spawnTimer = getSpawnDelay(difficulty);
    }
    if (game.itemTimer <= 0) {
      spawnItem(difficulty);
      game.itemTimer = getItemDelay(difficulty);
    }
    game.speed = Math.min(
      getTargetSpeed(difficulty),
      game.speed +
        delta *
          (1.65 +
            difficulty.pressure * 26 +
            difficulty.nightmare * 24 +
            difficulty.absurd * 32),
    );
    updateHighScore();
    if (game.comboTimer > 0) {
      game.comboTimer = Math.max(0, game.comboTimer - delta);
      if (game.comboTimer === 0) {
        game.combo = 1;
      }
    }
    if (game.rushTimer > 0) {
      game.rushTimer = Math.max(0, game.rushTimer - delta);
      checkMission();
    }
  }

  roadMarkers.forEach((marker) => wrapZ(marker, speedUnits * delta, 38, -92));
  roadsideObjects.forEach((object) =>
    wrapZ(object, speedUnits * delta * 0.72, 42, -96),
  );
  obstacles.forEach((obstacle) => {
    const previousZ = obstacle.position.z;
    obstacle.position.z -= speedUnits * delta;
    if (obstacle.userData.motion === "sweep") {
      const minLaneX = Math.min(...lanes);
      const maxLaneX = Math.max(...lanes);
      const amplitude = THREE.MathUtils.lerp(0.45, 1.35, difficulty.chaos);
      const motionSpeed = THREE.MathUtils.lerp(1.8, 3.8, difficulty.nightmare);
      obstacle.position.x = THREE.MathUtils.clamp(
        obstacle.userData.baseX +
          Math.sin(clock.elapsedTime * motionSpeed + obstacle.userData.motionPhase) *
            amplitude,
        minLaneX,
        maxLaneX,
      );
    }
    obstacle.rotation.y += delta * 0.35;
    if (
      !obstacle.userData.hit &&
      previousZ > HIT_ZONE_BACK_Z &&
      obstacle.position.z < HIT_ZONE_FRONT_Z
    ) {
      const lateral = Math.abs(obstacle.position.x - game.bikeX);
      const hitType = getObstacleHitType(obstacle, lateral);
      if (hitType && game.shieldTimer > 0) {
        obstacle.userData.hit = true;
        game.shieldTimer = 0;
        bumpCombo(1);
        chargeRush(8);
        awardScore(120, "GUARD");
        checkMission();
      } else if (hitType === "slip") {
        obstacle.userData.hit = true;
        applySlipTrap();
      } else if (hitType === "hit") {
        obstacle.userData.hit = true;
        registerHit();
      }
    }
    if (!obstacle.userData.passed && obstacle.position.z < PASS_Z) {
      obstacle.userData.passed = true;
      if (obstacle.userData.hit) {
        return;
      }
      const lateral = Math.abs(obstacle.position.x - game.bikeX);
      applyPassReward(getPassResult(obstacle, lateral));
    }
  });

  items.forEach((item) => {
    item.position.z -= speedUnits * delta;
    item.rotation.y += delta * 2.3;
    item.position.y =
      0.82 + Math.sin(clock.elapsedTime * 5.2 + item.position.x) * 0.06;
    if (
      !item.userData.collected &&
      item.position.z > -0.72 &&
      item.position.z < 0.72
    ) {
      const lateral = Math.abs(item.position.x - game.bikeX);
      if (lateral < item.userData.radius) {
        item.userData.collected = true;
        applyItem(item);
      }
    }
  });

  for (let index = obstacles.length - 1; index >= 0; index -= 1) {
    if (obstacles[index].position.z < BACK_DESPAWN_Z) {
      obstacleGroup.remove(obstacles[index]);
      disposeObject(obstacles[index]);
      obstacles.splice(index, 1);
    }
  }

  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (
      items[index].position.z < BACK_DESPAWN_Z ||
      items[index].userData.collected
    ) {
      obstacleGroup.remove(items[index]);
      disposeObject(items[index]);
      items.splice(index, 1);
    }
  }

  if (game.invulnerable > 0) {
    game.invulnerable = Math.max(0, game.invulnerable - delta);
  }
  if (game.shieldTimer > 0) {
    game.shieldTimer = Math.max(0, game.shieldTimer - delta);
  }
  if (game.statusTimer > 0) {
    game.statusTimer = Math.max(0, game.statusTimer - delta);
  }

  bikeRig.position.x = game.bikeX;
  bikeRig.position.y =
    game.jumpHeight +
    Math.sin(clock.elapsedTime * 12) * (game.running ? 0.008 : 0.002);
  bikeRig.rotation.z = game.lean;
  bikeRig.rotation.x =
    game.jumpHeight > 0 ? Math.sin(clock.elapsedTime * 7) * 0.035 : 0;
  riderGroup.rotation.z = game.lean * 0.16;
  riderGroup.rotation.x = game.jumpHeight > 0 ? -0.06 : 0;

  wheelMeshes.forEach((wheel) => {
    wheel.rotation.x += delta * (game.running ? game.speed : 16) * 0.18;
  });

  cameraTarget.set(0, 1.18 + game.jumpHeight * 0.18, 1.08);
  controls.target.lerp(cameraTarget, 0.045);
}

function registerHit() {
  if (game.invulnerable > 0) {
    return;
  }
  game.lives -= 1;
  game.invulnerable = 0.52;
  game.perfectChain = 0;
  resetCombo();
  if (game.lives > 0) {
    setStatusMessage("HIT", 0.8);
  } else {
    gameStatus.textContent = "";
  }
  if (game.lives <= 0) {
    game.running = false;
    game.over = true;
    setStartButtonState();
    showGameOver();
  }
}

function moveLane(direction) {
  if (game.over) {
    resetGame();
  }
  game.targetLane = THREE.MathUtils.clamp(
    game.targetLane + direction,
    0,
    lanes.length - 1,
  );
}

function jump() {
  if (game.over) {
    resetGame();
  }
  if (game.jumpHeight > 0.02 || game.jumpVelocity > 0.1) {
    return;
  }
  if (game.jumpCooldown > 0) {
    setStatusMessage("LANDING", 0.35);
    return;
  }
  game.running = true;
  game.jumpChain = Math.min(MAX_JUMP_CHAIN, Math.floor(game.jumpChain) + 1);
  const fatigue = game.jumpChain / MAX_JUMP_CHAIN;
  game.jumpVelocity = THREE.MathUtils.lerp(
    JUMP_BASE_VELOCITY,
    JUMP_MIN_VELOCITY,
    fatigue,
  );
  game.groundTimer = 0;
  setStartButtonState();
}

function toggleGame() {
  if (game.over) {
    resetGame();
  }
  game.running = !game.running;
  setStartButtonState();
}

function resetGame() {
  game.running = false;
  game.over = false;
  game.lane = 1;
  game.targetLane = 1;
  game.bikeX = 0;
  game.score = 0;
  game.distance = 0;
  game.lives = 3;
  game.combo = 1;
  game.comboTimer = 0;
  game.bestCombo = 1;
  game.rushMeter = 0;
  game.rushTimer = 0;
  game.coins = 0;
  game.nearMisses = 0;
  game.jumpDodges = 0;
  game.perfects = 0;
  game.perfectChain = 0;
  game.riskScore = 0;
  game.riskLane = null;
  game.riskTimer = 0;
  game.riskCooldown = 1.5;
  game.eventType = "";
  game.eventTimer = 0;
  game.eventCooldown = 5.5;
  game.speed = BASE_SPEED;
  game.spawnTimer = 0.8;
  game.itemTimer = 1.7;
  game.invulnerable = 0;
  game.shieldTimer = 0;
  game.statusTimer = 0;
  game.statusText = "";
  game.jumpHeight = 0;
  game.jumpVelocity = 0;
  game.jumpCooldown = 0;
  game.jumpChain = 0;
  game.groundTimer = 1;
  updateRiskRouteMarker();
  applyEventVisuals();
  bikeRig.position.set(0, 0, 0);
  bikeRig.rotation.set(0, 0, 0);
  obstacles.splice(0).forEach((obstacle) => {
    obstacleGroup.remove(obstacle);
    disposeObject(obstacle);
  });
  items.splice(0).forEach((item) => {
    obstacleGroup.remove(item);
    disposeObject(item);
  });
  setStartButtonState();
  hideGameOver();
  updateHud();
}

function handleKeydown(event) {
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
    moveLane(-1);
  } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
    moveLane(1);
  } else if (
    event.key === " " ||
    event.key === "ArrowUp" ||
    event.key.toLowerCase() === "w"
  ) {
    event.preventDefault();
    jump();
  } else if (event.key.toLowerCase() === "p") {
    toggleGame();
  }
}

function showGameOver() {
  updateHighScore();
  finalScoreValue.textContent = String(Math.floor(game.score)).padStart(4, "0");
  gameOverOverlay.setAttribute("aria-hidden", "false");
  gameOverOverlay.classList.add("is-visible");
}

function hideGameOver() {
  gameOverOverlay.setAttribute("aria-hidden", "true");
  gameOverOverlay.classList.remove("is-visible");
}

function updateLifeHud() {
  const currentLives = Math.max(0, game.lives);
  const maxLives = 4;
  lifeValue.setAttribute("aria-label", `Life ${currentLives}`);
  lifeValue.replaceChildren(
    ...Array.from({ length: maxLives }, (_, index) => {
      const dot = document.createElement("span");
      dot.className = `life-dot${index < currentLives ? " is-filled" : ""}`;
      return dot;
    }),
  );
}

function updateHud() {
  const difficulty = getDifficulty();
  const mission = getMission();
  const missionProgress = Math.min(
    getMissionProgress(mission, difficulty),
    mission.target,
  );
  scoreValue.textContent = String(Math.floor(game.score)).padStart(4, "0");
  levelValue.textContent = String(difficulty.level).padStart(4, "0");
  rushValue.textContent =
    game.rushTimer > 0 ? `${Math.ceil(game.rushTimer)}s` : `${Math.floor(game.rushMeter)}%`;
  updateLifeHud();
  comboValue.textContent = `x${game.combo}`;
  highScoreValue.textContent = String(Math.floor(game.highScore)).padStart(
    4,
    "0",
  );
  goalText.textContent = `${mission.label} ${missionProgress}/${mission.target}`;
  if (game.statusTimer > 0) {
    gameStatus.textContent = game.statusText;
  } else if (game.rushTimer > 0) {
    gameStatus.textContent = `RUSH ${Math.ceil(game.rushTimer)}`;
  } else if (game.shieldTimer > 0) {
    gameStatus.textContent = `SHIELD ${Math.ceil(game.shieldTimer)}`;
  } else if (game.eventTimer > 0) {
    gameStatus.textContent = `${getEventLabel()} ${Math.ceil(game.eventTimer)}`;
  } else if (game.riskTimer > 0) {
    gameStatus.textContent = `RISK ${getRiskLaneLabel()}`;
  } else if (game.jumpHeight > 0.05) {
    gameStatus.textContent = "JUMP";
  } else if (game.combo > 1) {
    gameStatus.textContent = `COMBO x${game.combo}`;
  } else {
    gameStatus.textContent = "";
  }
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);
  updateGame(delta);
  hudRefreshTimer += delta;
  if (hudRefreshTimer >= HUD_REFRESH_INTERVAL || game.over || !game.running) {
    updateHud();
    hudRefreshTimer = 0;
  }
  controls.update();
  renderer.render(scene, camera);

  diagnostics.frame += 1;
  if (
    diagnostics.frame === 1 ||
    diagnostics.frame % DIAGNOSTICS_FRAME_INTERVAL === 0
  ) {
    publishDiagnostics();
  }

  requestAnimationFrame(animate);
}

function capsuleBetween(start, end, radius, material) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(
      radius,
      Math.max(length - radius * 2, 0.02),
      8,
      18,
    ),
    material,
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  return mesh;
}

function wrapZ(object, shift, front, back) {
  object.position.z -= shift;
  if (object.position.z < back) {
    object.position.z = front;
  }
}

function markShadow(group) {
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = false;
    }
  });
}

function disposeObject(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
  });
}

function captureScene() {
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = renderer.domElement.toDataURL("image/png");
  link.download = `bicycle-dash-${date}.png`;
  link.click();
}

function installDiagnostics() {
  diagnostics.node = document.createElement("meta");
  diagnostics.node.id = "rideDiagnostics";
  diagnostics.node.name = "ride-diagnostics";
  document.head.append(diagnostics.node);
}

function publishDiagnostics() {
  const difficulty = getDifficulty();
  diagnostics.node.content = JSON.stringify({
    canvas: readCanvasStats(),
    state: {
      running: game.running,
      over: game.over,
      lane: game.targetLane,
      bikeX: Number(game.bikeX.toFixed(3)),
      score: Math.floor(game.score),
      highScore: Math.floor(game.highScore),
      combo: game.combo,
      bestCombo: game.bestCombo,
      comboTimer: Number(game.comboTimer.toFixed(2)),
      perfects: game.perfects,
      perfectChain: game.perfectChain,
      riskLane: game.riskLane,
      riskTimer: Number(game.riskTimer.toFixed(2)),
      riskScore: Math.floor(game.riskScore),
      eventType: game.eventType,
      eventTimer: Number(game.eventTimer.toFixed(2)),
      rushMeter: Math.floor(game.rushMeter),
      rushTimer: Number(game.rushTimer.toFixed(2)),
      mission: getMission().label,
      distance: Number(game.distance.toFixed(2)),
      lives: game.lives,
      speed: Math.round(game.speed),
      shieldTimer: Number(game.shieldTimer.toFixed(2)),
      difficultyLevel: difficulty.level,
      difficultyFactor: Number(difficulty.factor.toFixed(3)),
      difficultyChaos: Number(difficulty.chaos.toFixed(3)),
      difficultyNightmare: Number(difficulty.nightmare.toFixed(3)),
      difficultyAbsurd: Number(difficulty.absurd.toFixed(3)),
      targetSpeed: Math.round(getTargetSpeed(difficulty)),
      maxObstacles: getMaxObstacleCount(difficulty),
      obstacles: obstacles.length,
      items: items.length,
      obstacleZ: obstacles
        .map((obstacle) => Number(obstacle.position.z.toFixed(2)))
        .slice(0, 5),
      jumpHeight: Number(game.jumpHeight.toFixed(3)),
      jumpCooldown: Number(game.jumpCooldown.toFixed(2)),
      jumpChain: Number(game.jumpChain.toFixed(2)),
      model: modelState.source,
      modelLoaded: Boolean(modelState.imported),
      modelWheelNodes: wheelMeshes.length,
      wheelRotationX: wheelMeshes.length
        ? Number(wheelMeshes[0].rotation.x.toFixed(3))
        : null,
      modelLoadError: modelState.loadError,
      travelDirection: "bicycle-front-positive-z",
    },
  });
}

function readCanvasStats() {
  const width = renderer.domElement.width;
  const height = renderer.domElement.height;
  return {
    cssWidth: renderer.domElement.clientWidth,
    cssHeight: renderer.domElement.clientHeight,
    width,
    height,
    pixelRatio: renderer.getPixelRatio(),
    renderPixels: width * height,
  };
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setPixelRatio(MOBILE_RENDER_SCALE);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (width < 820) {
    camera.position.set(0, 2.8, -11.2);
  } else {
    camera.position.set(0.35, 2.9, -10.8);
  }
}

function v3(x, y, z) {
  return new THREE.Vector3(x, y, z);
}
