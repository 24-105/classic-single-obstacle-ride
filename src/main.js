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
const distanceValue = document.querySelector("#distanceValue");
const speedValue = document.querySelector("#speedValue");
const lifeValue = document.querySelector("#lifeValue");
const comboValue = document.querySelector("#comboValue");
const highScoreValue = document.querySelector("#highScoreValue");
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
  lean: 0,
};
const MOBILE_RENDER_SCALE = 1;
const HUD_REFRESH_INTERVAL = 0.12;
const DIAGNOSTICS_FRAME_INTERVAL = 120;
const ROAD_MARKER_ROWS = 14;
const ROADSIDE_POST_ROWS = 12;
const BUILDING_COUNT = 8;
const BASE_SPEED = 26;
const MAX_SPEED = 64;
const MAX_OBSTACLES = 7;
const DIFFICULTY_SCORE_STEP = 900;
const MAX_DIFFICULTY_LEVEL = 12;
const MAX_COMBO = 9;
const COMBO_WINDOW = 4.2;
const FRONT_SPAWN_Z = 62;
const BACK_DESPAWN_Z = -12;
const PASS_Z = -1.28;

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
let hudRefreshTimer = 0;
const wheelMeshes = [];
const roadMarkers = [];
const roadsideObjects = [];
const obstacles = [];
const items = [];
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
  element.addEventListener(
    "pointerdown",
    (event) => {
      event.preventDefault();
      handler();
    },
    { passive: false },
  );
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
    bonus: new THREE.MeshBasicMaterial({ color: "#63e0a3" }),
    heart: new THREE.MeshBasicMaterial({ color: "#ff6686" }),
    shield: new THREE.MeshBasicMaterial({ color: "#64c7ff" }),
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

function createObstacle(type) {
  const group = new THREE.Group();
  group.userData = {
    type,
    hit: false,
    passed: false,
    width: type === "barrier" ? 0.58 : type === "cone" ? 0.32 : 0.42,
    jumpClear: type === "cone" ? 0.22 : 999,
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

  if (difficulty.level >= 8 && Math.random() < 0.3 + difficulty.factor * 0.28) {
    spawnStaggeredRows(difficulty);
    return;
  }

  if (
    difficulty.level >= 3 &&
    Math.random() < 0.18 + difficulty.factor * 0.42
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

function addObstacle(type, lane, z) {
  const obstacle = createObstacle(type);
  obstacle.position.set(lanes[lane], 0, z);
  obstacle.userData.lane = lane;
  obstacles.push(obstacle);
  obstacleGroup.add(obstacle);
}

function spawnItem(difficulty) {
  if (items.length >= 3) {
    return;
  }
  const roll = Math.random();
  const type = roll < 0.68 ? "coin" : roll < 0.86 ? "shield" : "heart";
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
    setStatusMessage("+LIFE");
  } else if (type === "shield") {
    game.shieldTimer = 4.8;
    bumpCombo(1);
    setStatusMessage("SHIELD");
  } else {
    bumpCombo(1);
    awardScore(220 + getDifficulty().level * 30, "COIN");
  }
  updateHighScore();
}

function chooseObstacleType(roll, difficulty) {
  if (difficulty.level < 3) {
    return roll < 0.62 ? "cone" : roll < 0.9 ? "drum" : "barrier";
  }
  if (difficulty.level < 8) {
    return roll < 0.38 ? "cone" : roll < 0.72 ? "drum" : "barrier";
  }
  return roll < 0.24 ? "cone" : roll < 0.58 ? "drum" : "barrier";
}

function getDifficulty() {
  const level = THREE.MathUtils.clamp(
    Math.floor(game.score / DIFFICULTY_SCORE_STEP),
    0,
    MAX_DIFFICULTY_LEVEL,
  );
  return {
    level,
    factor: level / MAX_DIFFICULTY_LEVEL,
  };
}

function getTargetSpeed(difficulty) {
  return THREE.MathUtils.lerp(BASE_SPEED + 8, MAX_SPEED, difficulty.factor);
}

function getSpawnDelay(difficulty) {
  const center = THREE.MathUtils.lerp(1.06, 0.32, difficulty.factor);
  const jitter = THREE.MathUtils.lerp(0.26, 0.07, difficulty.factor);
  return THREE.MathUtils.randFloat(center - jitter, center + jitter);
}

function getItemDelay(difficulty) {
  const center = THREE.MathUtils.lerp(2.8, 1.75, difficulty.factor);
  return THREE.MathUtils.randFloat(center * 0.72, center * 1.18);
}

function getMaxObstacleCount(difficulty) {
  return Math.round(THREE.MathUtils.lerp(4, MAX_OBSTACLES, difficulty.factor));
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

function awardScore(base, label = "") {
  const amount = Math.round(base * game.combo);
  game.score += amount;
  if (label) {
    setStatusMessage(`${label} +${amount}`);
  }
  updateHighScore();
}

function updateHighScore() {
  if (game.score <= game.highScore) {
    return;
  }
  game.highScore = game.score;
  saveSessionHighScore(game.highScore);
}

function updateGame(delta) {
  const difficulty = getDifficulty();
  const targetX = lanes[game.targetLane];
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

  if (game.jumpHeight > 0 || game.jumpVelocity > 0) {
    game.jumpVelocity -= 8.8 * delta;
    game.jumpHeight += game.jumpVelocity * delta;
    if (game.jumpHeight <= 0) {
      game.jumpHeight = 0;
      game.jumpVelocity = 0;
    }
  }

  const speedUnits = game.running ? game.speed / 3.6 : 0;
  if (game.running) {
    game.distance += (game.speed * delta) / 3600;
    game.score +=
      delta * game.speed * THREE.MathUtils.lerp(0.9, 1.28, difficulty.factor);
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
      game.speed + delta * (1.65 + difficulty.level * 0.28),
    );
    updateHighScore();
    if (game.comboTimer > 0) {
      game.comboTimer = Math.max(0, game.comboTimer - delta);
      if (game.comboTimer === 0) {
        game.combo = 1;
      }
    }
  }

  roadMarkers.forEach((marker) => wrapZ(marker, speedUnits * delta, 38, -92));
  roadsideObjects.forEach((object) =>
    wrapZ(object, speedUnits * delta * 0.72, 42, -96),
  );
  obstacles.forEach((obstacle) => {
    obstacle.position.z -= speedUnits * delta;
    obstacle.rotation.y += delta * 0.35;
    if (!obstacle.userData.passed && obstacle.position.z < PASS_Z) {
      obstacle.userData.passed = true;
      const lateral = Math.abs(obstacle.position.x - game.bikeX);
      const jumpedCone =
        obstacle.userData.jumpClear < 999 && game.jumpHeight > 0.15;
      const nearMiss =
        lateral >= obstacle.userData.width &&
        lateral < obstacle.userData.width + 0.46;
      if (nearMiss || jumpedCone) {
        bumpCombo(1);
        awardScore(nearMiss ? 150 : 130, nearMiss ? "NEAR" : "JUMP");
      } else {
        awardScore(82);
      }
    }
    if (
      !obstacle.userData.hit &&
      obstacle.position.z > -0.45 &&
      obstacle.position.z < 0.28
    ) {
      const lateral = Math.abs(obstacle.position.x - game.bikeX);
      const canJump = game.jumpHeight > obstacle.userData.jumpClear;
      if (
        lateral < obstacle.userData.width &&
        !canJump &&
        game.shieldTimer > 0
      ) {
        obstacle.userData.hit = true;
        bumpCombo(1);
        awardScore(120, "GUARD");
      } else if (lateral < obstacle.userData.width && !canJump) {
        obstacle.userData.hit = true;
        registerHit();
      }
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
  game.invulnerable = 1.1;
  resetCombo();
  gameStatus.textContent = game.lives > 0 ? "HIT" : "GAME OVER";
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
  game.running = true;
  game.jumpVelocity = 4.6;
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
  game.speed = BASE_SPEED;
  game.spawnTimer = 0.8;
  game.itemTimer = 1.7;
  game.invulnerable = 0;
  game.shieldTimer = 0;
  game.statusTimer = 0;
  game.statusText = "";
  game.jumpHeight = 0;
  game.jumpVelocity = 0;
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

function updateHud() {
  const difficulty = getDifficulty();
  scoreValue.textContent = String(Math.floor(game.score)).padStart(4, "0");
  distanceValue.textContent = game.distance.toFixed(1);
  speedValue.textContent = String(Math.round(game.speed));
  lifeValue.textContent = String(Math.max(0, game.lives));
  comboValue.textContent = `x${game.combo}`;
  highScoreValue.textContent = String(Math.floor(game.highScore)).padStart(
    4,
    "0",
  );
  if (game.over) {
    gameStatus.textContent = "GAME OVER";
  } else if (game.statusTimer > 0) {
    gameStatus.textContent = game.statusText;
  } else if (game.shieldTimer > 0) {
    gameStatus.textContent = `SHIELD ${Math.ceil(game.shieldTimer)}`;
  } else if (!game.running) {
    gameStatus.textContent = "READY";
  } else if (game.jumpHeight > 0.05) {
    gameStatus.textContent = `JUMP LV ${difficulty.level + 1}`;
  } else if (game.combo > 1) {
    gameStatus.textContent = `COMBO x${game.combo}`;
  } else {
    gameStatus.textContent = `LV ${difficulty.level + 1}`;
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
      distance: Number(game.distance.toFixed(2)),
      lives: game.lives,
      speed: Math.round(game.speed),
      shieldTimer: Number(game.shieldTimer.toFixed(2)),
      difficultyLevel: difficulty.level,
      difficultyFactor: Number(difficulty.factor.toFixed(3)),
      targetSpeed: Math.round(getTargetSpeed(difficulty)),
      maxObstacles: getMaxObstacleCount(difficulty),
      obstacles: obstacles.length,
      items: items.length,
      obstacleZ: obstacles
        .map((obstacle) => Number(obstacle.position.z.toFixed(2)))
        .slice(0, 5),
      jumpHeight: Number(game.jumpHeight.toFixed(3)),
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
