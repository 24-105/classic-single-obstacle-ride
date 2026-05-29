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
const gameStatus = document.querySelector("#gameStatus");
const gameOverOverlay = document.querySelector("#gameOverOverlay");
const finalScoreValue = document.querySelector("#finalScoreValue");

const lanes = [-1.72, 0, 1.72];
const game = {
  running: false,
  over: false,
  lane: 1,
  targetLane: 1,
  bikeX: 0,
  score: 0,
  distance: 0,
  lives: 3,
  speed: 52,
  spawnTimer: 1.1,
  invulnerable: 0,
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
const BASE_SPEED = 52;
const MAX_SPEED = 150;
const MAX_OBSTACLES = 8;
const DIFFICULTY_SCORE_STEP = 900;
const MAX_DIFFICULTY_LEVEL = 12;
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

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 140);
camera.position.set(3.6, 2.15, -7.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.enablePan = false;
controls.minDistance = 3.1;
controls.maxDistance = 13;
controls.minPolarAngle = 0.12;
controls.maxPolarAngle = Math.PI * 0.82;
controls.target.set(0, 1.16, 1.15);

const clock = new THREE.Clock();
const diagnostics = { node: null, frame: 0 };
const cameraTarget = new THREE.Vector3();
let hudRefreshTimer = 0;
const wheelMeshes = [];
const roadMarkers = [];
const roadsideObjects = [];
const obstacles = [];
const modelState = {
  source: "procedural-mobile",
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
createClassicSingle();
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
  bindPress(leftButton, () => moveLane(1));
  bindPress(rightButton, () => moveLane(-1));
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

function createMaterials() {
  const envMapIntensity = 0.7;
  return {
    asphalt: new THREE.MeshStandardMaterial({ color: "#2f353b", roughness: 0.9, metalness: 0.02 }),
    lane: new THREE.MeshStandardMaterial({ color: "#f1ead8", roughness: 0.45, metalness: 0.04 }),
    shoulder: new THREE.MeshStandardMaterial({ color: "#737b82", roughness: 0.72, metalness: 0.06 }),
    grass: new THREE.MeshStandardMaterial({ color: "#becac1", roughness: 0.95, metalness: 0.01 }),
    rubber: new THREE.MeshStandardMaterial({ color: "#06070a", roughness: 0.58, metalness: 0.02 }),
    tireSide: new THREE.MeshStandardMaterial({ color: "#11141a", roughness: 0.78, metalness: 0.02 }),
    chrome: new THREE.MeshStandardMaterial({ color: "#eff4f5", roughness: 0.13, metalness: 0.98, envMapIntensity }),
    rim: new THREE.MeshStandardMaterial({ color: "#dce3e7", roughness: 0.16, metalness: 0.96, envMapIntensity }),
    spoke: new THREE.MeshStandardMaterial({ color: "#f3f6f7", roughness: 0.2, metalness: 0.9, envMapIntensity }),
    frame: new THREE.MeshStandardMaterial({ color: "#14171c", roughness: 0.38, metalness: 0.56, envMapIntensity }),
    tank: new THREE.MeshStandardMaterial({ color: "#757c82", roughness: 0.22, metalness: 0.66, envMapIntensity }),
    tankDark: new THREE.MeshStandardMaterial({ color: "#24282d", roughness: 0.34, metalness: 0.5, envMapIntensity }),
    pinstripe: new THREE.MeshStandardMaterial({ color: "#e7dec2", roughness: 0.34, metalness: 0.1 }),
    engine: new THREE.MeshStandardMaterial({ color: "#7f878d", roughness: 0.3, metalness: 0.88, envMapIntensity }),
    engineDark: new THREE.MeshStandardMaterial({ color: "#16191e", roughness: 0.34, metalness: 0.7, envMapIntensity }),
    leather: new THREE.MeshStandardMaterial({ color: "#121418", roughness: 0.52, metalness: 0.08 }),
    jacket: new THREE.MeshStandardMaterial({ color: "#24282e", roughness: 0.54, metalness: 0.08 }),
    jacketPanel: new THREE.MeshStandardMaterial({ color: "#333941", roughness: 0.48, metalness: 0.12 }),
    denim: new THREE.MeshStandardMaterial({ color: "#253847", roughness: 0.66, metalness: 0.03 }),
    glove: new THREE.MeshStandardMaterial({ color: "#0b0d11", roughness: 0.45, metalness: 0.08 }),
    boot: new THREE.MeshStandardMaterial({ color: "#090b0e", roughness: 0.52, metalness: 0.12 }),
    helmet: new THREE.MeshStandardMaterial({ color: "#101218", roughness: 0.22, metalness: 0.48, envMapIntensity }),
    visor: new THREE.MeshStandardMaterial({
      color: "#0a1620",
      roughness: 0.07,
      metalness: 0.28,
      transparent: true,
      opacity: 0.74,
    }),
    skin: new THREE.MeshStandardMaterial({ color: "#c58a66", roughness: 0.62, metalness: 0.02 }),
    glass: new THREE.MeshStandardMaterial({
      color: "#e4f8ff",
      roughness: 0.08,
      metalness: 0.08,
      transparent: true,
      opacity: 0.82,
    }),
    headlightGlow: new THREE.MeshBasicMaterial({ color: "#fff3c2" }),
    signal: new THREE.MeshBasicMaterial({ color: "#f3a035" }),
    brake: new THREE.MeshBasicMaterial({ color: "#dc2e38" }),
    cone: new THREE.MeshStandardMaterial({ color: "#d86f31", roughness: 0.5, metalness: 0.03 }),
    coneBand: new THREE.MeshStandardMaterial({ color: "#fff7e8", roughness: 0.42, metalness: 0.03 }),
    barrier: new THREE.MeshStandardMaterial({ color: "#d8dde0", roughness: 0.42, metalness: 0.24 }),
    warning: new THREE.MeshStandardMaterial({ color: "#c9a45f", roughness: 0.42, metalness: 0.08 }),
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

  const headlight = new THREE.SpotLight("#fff2bd", 8, 26, Math.PI * 0.12, 0.48, 1.1);
  headlight.position.set(0, 1.31, 1.72);
  headlight.target.position.set(0, 0.35, 9);
  bikeRig.add(headlight, headlight.target);
  return { hemi, sun, rim, headlight };
}

function createRoad() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 130), materials.grass);
  ground.rotation.x = -Math.PI * 0.5;
  ground.position.y = -0.045;
  worldGroup.add(ground);

  const road = new THREE.Mesh(new THREE.PlaneGeometry(8, 150), materials.asphalt);
  road.rotation.x = -Math.PI * 0.5;
  roadGroup.add(road);

  [-3.15, 3.15].forEach((x) => {
    const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 150), materials.shoulder);
    shoulder.rotation.x = -Math.PI * 0.5;
    shoulder.position.set(x, 0.006, 0);
    roadGroup.add(shoulder);
  });

  [-0.86, 0.86].forEach((x) => {
    for (let index = 0; index < ROAD_MARKER_ROWS; index += 1) {
      const marker = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.012, 2.0, 2, 0.004), materials.lane);
      marker.position.set(x, 0.018, index * -5.6 + 34);
      roadMarkers.push(marker);
      roadGroup.add(marker);
    }
  });
}

function createEnvironment() {
  const railMaterial = new THREE.MeshStandardMaterial({ color: "#b7c1c6", roughness: 0.45, metalness: 0.42 });
  [-4.25, 4.25].forEach((x) => {
    const rail = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.2, 120, 3, 0.04), railMaterial);
    rail.position.set(x, 0.52, -6);
    worldGroup.add(rail);
  });

  const postMaterial = new THREE.MeshStandardMaterial({ color: "#596168", roughness: 0.55, metalness: 0.35 });
  for (let index = 0; index < ROADSIDE_POST_ROWS; index += 1) {
    [-4.25, 4.25].forEach((x) => {
      const post = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.78, 0.12, 2, 0.02), postMaterial);
      post.position.set(x, 0.34, index * -5.2 + 40);
      roadsideObjects.push(post);
      worldGroup.add(post);
    });
  }

  const buildingMaterials = [
    new THREE.MeshStandardMaterial({ color: "#9aa6ae", roughness: 0.82, metalness: 0.03 }),
    new THREE.MeshStandardMaterial({ color: "#bbb4a8", roughness: 0.82, metalness: 0.02 }),
    new THREE.MeshStandardMaterial({ color: "#7d8992", roughness: 0.84, metalness: 0.03 }),
  ];
  for (let index = 0; index < BUILDING_COUNT; index += 1) {
    const height = 1.4 + (index % 5) * 0.42;
    const width = 0.9 + (index % 3) * 0.34;
    const building = new THREE.Mesh(new RoundedBoxGeometry(width, height, 1.15, 2, 0.025), buildingMaterials[index % buildingMaterials.length]);
    const side = index % 2 === 0 ? -1 : 1;
    building.position.set(side * (6.2 + (index % 4) * 0.58), height / 2 - 0.02, index * -5.4 + 30);
    roadsideObjects.push(building);
    worldGroup.add(building);
  }
}

function createClassicSingle() {
  const rearWheel = createWheel("rear");
  rearWheel.position.set(0, 0.58, 1.22);
  bikeGroup.add(rearWheel);
  wheelMeshes.push(rearWheel);

  const frontWheel = createWheel("front");
  frontWheel.position.set(0, 0.58, -1.45);
  bikeGroup.add(frontWheel);
  wheelMeshes.push(frontWheel);

  const frameTubes = [
    [v3(0, 0.82, 1.08), v3(0, 1.18, -0.48), 0.05],
    [v3(0, 0.82, 1.08), v3(0, 0.72, -0.34), 0.044],
    [v3(0, 0.72, -0.34), v3(0, 1.34, -1.13), 0.05],
    [v3(0, 1.18, -0.48), v3(0, 1.34, -1.13), 0.046],
    [v3(0, 1.18, -0.48), v3(0, 1.3, 0.86), 0.048],
    [v3(0, 0.82, 1.08), v3(0, 1.3, 0.86), 0.044],
  ];
  frameTubes.forEach(([start, end, radius]) => bikeGroup.add(capsuleBetween(start, end, radius, materials.frame)));

  bikeGroup.add(
    capsuleBetween(v3(-0.18, 0.58, 1.22), v3(-0.25, 0.84, 0.12), 0.034, materials.frame),
    capsuleBetween(v3(0.18, 0.58, 1.22), v3(0.25, 0.84, 0.12), 0.034, materials.frame),
    capsuleBetween(v3(-0.17, 0.58, -1.45), v3(-0.29, 1.43, -1.09), 0.036, materials.chrome),
    capsuleBetween(v3(0.17, 0.58, -1.45), v3(0.29, 1.43, -1.09), 0.036, materials.chrome),
  );

  createEngine();
  createTankAndSeat();
  createFrontCluster();
  createRearDetails();
  createExhaustAndControls();

  markShadow(bikeGroup);
}

function createEngine() {
  const engineCase = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.42, 0.56, 6, 0.055), materials.engine);
  engineCase.position.set(0, 0.78, -0.08);
  bikeGroup.add(engineCase);

  [-0.38, 0.38].forEach((x) => {
    const crank = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.055, 32), materials.chrome);
    crank.rotation.z = Math.PI * 0.5;
    crank.position.set(x, 0.78, -0.02);
    bikeGroup.add(crank);
  });

  const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.62, 32), materials.engine);
  cylinder.position.set(0, 1.06, -0.14);
  bikeGroup.add(cylinder);

  for (let index = 0; index < 10; index += 1) {
    const fin = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.014, 32), index % 2 ? materials.engine : materials.engineDark);
    fin.position.set(0, 0.78 + index * 0.057, -0.14);
    bikeGroup.add(fin);
  }

  const sparkPlug = capsuleBetween(v3(0.15, 1.26, -0.2), v3(0.32, 1.39, -0.28), 0.017, materials.chrome);
  const cable = capsuleBetween(v3(0.32, 1.39, -0.28), v3(0.46, 1.26, 0.05), 0.011, materials.frame);
  bikeGroup.add(sparkPlug, cable);
}

function createTankAndSeat() {
  const tank = new THREE.Mesh(new THREE.SphereGeometry(0.58, 40, 22), materials.tank);
  tank.position.set(0, 1.46, -0.34);
  tank.scale.set(0.84, 0.42, 1.25);
  tank.rotation.x = -0.04;
  bikeGroup.add(tank);

  const stripe = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.014, 1.08, 3, 0.006), materials.pinstripe);
  stripe.position.set(0, 1.735, -0.34);
  stripe.rotation.x = -0.04;
  bikeGroup.add(stripe, createTankBadge(-1), createTankBadge(1));

  const seatBase = new THREE.Mesh(new RoundedBoxGeometry(0.78, 0.1, 1.62, 6, 0.04), materials.frame);
  seatBase.position.set(0, 1.29, 0.68);
  const seat = new THREE.Mesh(new RoundedBoxGeometry(0.76, 0.17, 1.58, 8, 0.075), materials.leather);
  seat.position.set(0, 1.4, 0.64);
  bikeGroup.add(seatBase, seat);

  const sideLeft = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.32, 0.45, 5, 0.035), materials.tankDark);
  sideLeft.position.set(-0.42, 1.02, 0.38);
  const sideRight = sideLeft.clone();
  sideRight.position.x = 0.42;
  bikeGroup.add(sideLeft, sideRight);
}

function createFrontCluster() {
  bikeGroup.add(createFender(-1.45, 0.58, 0.64, 0.035, materials.chrome));

  const headlightBucket = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.18, 32), materials.chrome);
  headlightBucket.position.set(0, 1.31, -1.7);
  headlightBucket.rotation.x = Math.PI * 0.5;
  const headlightLens = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.035, 32), materials.glass);
  headlightLens.position.set(0, 1.31, -1.795);
  headlightLens.rotation.x = Math.PI * 0.5;
  const headlightGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.018, 32), materials.headlightGlow);
  headlightGlow.position.set(0, 1.31, -1.82);
  headlightGlow.rotation.x = Math.PI * 0.5;
  bikeGroup.add(headlightBucket, headlightLens, headlightGlow);

  const handlebar = capsuleBetween(v3(-0.68, 1.55, -0.96), v3(0.68, 1.55, -0.96), 0.03, materials.chrome);
  const leftGrip = capsuleBetween(v3(-0.68, 1.55, -0.96), v3(-0.92, 1.53, -0.9), 0.042, materials.rubber);
  const rightGrip = capsuleBetween(v3(0.68, 1.55, -0.96), v3(0.92, 1.53, -0.9), 0.042, materials.rubber);
  const gauges = createGaugeCluster();
  gauges.position.set(0, 1.56, -1.18);
  bikeGroup.add(handlebar, leftGrip, rightGrip, createMirror(-1), createMirror(1), gauges);

  [-0.35, 0.35].forEach((x) => {
    const signal = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 10), materials.signal);
    signal.position.set(x, 1.22, -1.66);
    bikeGroup.add(signal);
  });
}

function createRearDetails() {
  const rearFender = createFender(1.22, 0.58, 0.66, 0.035, materials.chrome);
  rearFender.rotation.z = Math.PI * 0.08;
  const tailMount = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.12, 0.48, 5, 0.04), materials.frame);
  tailMount.position.set(0, 1.2, 1.18);
  const brakeLight = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.075, 0.06, 4, 0.025), materials.brake);
  brakeLight.position.set(0, 1.16, 1.62);
  bikeGroup.add(rearFender, tailMount, brakeLight);

  [-0.32, 0.32].forEach((x) => {
    const signal = new THREE.Mesh(new THREE.SphereGeometry(0.052, 16, 10), materials.signal);
    signal.position.set(x, 1.12, 1.56);
    bikeGroup.add(signal);
  });

  bikeGroup.add(
    createSpring(v3(-0.34, 0.75, 1.08), v3(-0.34, 1.25, 0.55), 0.085, 7),
    createSpring(v3(0.34, 0.75, 1.08), v3(0.34, 1.25, 0.55), 0.085, 7),
  );
}

function createExhaustAndControls() {
  bikeGroup.add(
    capsuleBetween(v3(0.25, 0.92, -0.24), v3(0.42, 0.6, 0.26), 0.045, materials.chrome),
    capsuleBetween(v3(0.42, 0.6, 0.26), v3(0.53, 0.76, 1.76), 0.082, materials.chrome),
    capsuleBetween(v3(-0.31, 0.62, 1.2), v3(-0.31, 0.75, -0.02), 0.022, materials.frame),
    capsuleBetween(v3(-0.31, 0.5, 1.18), v3(-0.31, 0.58, -0.02), 0.019, materials.frame),
    capsuleBetween(v3(0.43, 0.84, -0.18), v3(0.55, 0.42, 0.16), 0.024, materials.chrome),
    capsuleBetween(v3(0.46, 0.42, 0.22), v3(0.72, 0.42, 0.22), 0.028, materials.rubber),
    capsuleBetween(v3(-0.54, 0.76, 0.26), v3(-0.82, 0.76, 0.26), 0.026, materials.rubber),
    capsuleBetween(v3(0.54, 0.76, 0.26), v3(0.82, 0.76, 0.26), 0.026, materials.rubber),
  );

  const exhaustTip = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 24), materials.frame);
  exhaustTip.position.set(0.53, 0.77, 1.84);
  exhaustTip.rotation.x = Math.PI * 0.5;
  bikeGroup.add(exhaustTip);

  for (let index = 0; index < 15; index += 1) {
    const link = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.022, 0.05, 2, 0.01), materials.chrome);
    link.position.set(-0.34, 0.58 + index * 0.012, 1.02 - index * 0.083);
    link.rotation.y = 0.12;
    bikeGroup.add(link);
  }
}

function createWheel(kind) {
  const wheel = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 16, 64), materials.rubber);
  tire.rotation.y = Math.PI * 0.5;
  wheel.add(tire);

  for (let index = 0; index < 18; index += 1) {
    const angle = (index / 18) * Math.PI * 2;
    const block = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.01, 0.04, 2, 0.004), materials.tireSide);
    block.position.set(0, Math.sin(angle) * 0.55, Math.cos(angle) * 0.55);
    block.rotation.x = -angle;
    block.rotation.z = index % 2 === 0 ? 0.16 : -0.16;
    wheel.add(block);
  }

  [-0.052, 0.052].forEach((x) => {
    const sidewall = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.01, 10, 48), materials.tireSide);
    sidewall.rotation.y = Math.PI * 0.5;
    sidewall.position.x = x;
    wheel.add(sidewall);
  });

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.032, 12, 48), materials.rim);
  rim.rotation.y = Math.PI * 0.5;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.22, 28), materials.rim);
  hub.rotation.z = Math.PI * 0.5;
  wheel.add(rim, hub);

  if (kind === "front") {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.014, 40), materials.chrome);
    disc.rotation.z = Math.PI * 0.5;
    disc.position.x = -0.09;
    const caliper = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.16, 0.1, 4, 0.025), materials.tankDark);
    caliper.position.set(-0.12, 0.23, -0.16);
    caliper.rotation.x = 0.35;
    wheel.add(disc, caliper);
  } else {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.13, 32), materials.chrome);
    drum.rotation.z = Math.PI * 0.5;
    wheel.add(drum);
  }

  for (let index = 0; index < 22; index += 1) {
    const spoke = new THREE.Mesh(new RoundedBoxGeometry(0.01, 0.01, 0.58, 2, 0.003), materials.spoke);
    spoke.rotation.y = Math.PI * 0.5;
    spoke.rotation.z = (index * Math.PI) / 11;
    spoke.position.x = index % 2 === 0 ? -0.018 : 0.018;
    wheel.add(spoke);
  }

  return wheel;
}

function createRider() {
  riderGroup.add(createHumanoidTorso(), createHelmet());

  const limbSpecs = [
    ["leftUpperArm", v3(-0.32, 2.24, -0.02), v3(-0.54, 1.88, -0.54), 0.074, materials.jacket],
    ["rightUpperArm", v3(0.32, 2.24, -0.02), v3(0.54, 1.88, -0.54), 0.074, materials.jacket],
    ["leftForearm", v3(-0.54, 1.88, -0.54), v3(-0.9, 1.53, -0.9), 0.058, materials.jacketPanel],
    ["rightForearm", v3(0.54, 1.88, -0.54), v3(0.9, 1.53, -0.9), 0.058, materials.jacketPanel],
    ["leftThigh", v3(-0.21, 1.42, 0.45), v3(-0.47, 1.02, -0.03), 0.105, materials.denim],
    ["rightThigh", v3(0.21, 1.42, 0.45), v3(0.47, 1.02, -0.03), 0.105, materials.denim],
    ["leftShin", v3(-0.47, 1.02, -0.03), v3(-0.56, 0.62, 0.3), 0.082, materials.denim],
    ["rightShin", v3(0.47, 1.02, -0.03), v3(0.56, 0.62, 0.3), 0.082, materials.denim],
  ];
  limbSpecs.forEach(([, start, end, radius, material]) => riderGroup.add(capsuleBetween(start, end, radius, material)));

  [
    [-0.9, 1.53, -0.9],
    [0.9, 1.53, -0.9],
  ].forEach(([x, y, z]) => {
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.092, 18, 10), materials.glove);
    glove.position.set(x, y, z);
    glove.scale.set(1.1, 0.92, 0.96);
    riderGroup.add(glove);
  });

  [
    [-0.56, 0.51, 0.4, -0.16],
    [0.56, 0.51, 0.4, 0.16],
  ].forEach(([x, y, z, yaw]) => {
    const boot = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.16, 0.42, 6, 0.045), materials.boot);
    boot.position.set(x, y, z);
    boot.rotation.y = yaw;
    boot.rotation.x = -0.1;
    riderGroup.add(boot);
  });

  [
    [-0.47, 1.02, -0.11],
    [0.47, 1.02, -0.11],
  ].forEach(([x, y, z]) => {
    const knee = new THREE.Mesh(new RoundedBoxGeometry(0.19, 0.13, 0.08, 5, 0.028), materials.jacketPanel);
    knee.position.set(x, y, z);
    knee.rotation.x = -0.38;
    riderGroup.add(knee);
  });

  markShadow(riderGroup);
}

function createHumanoidTorso() {
  const group = new THREE.Group();

  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.34, 28, 16), materials.denim);
  hips.position.set(0, 1.52, 0.46);
  hips.scale.set(1.08, 0.58, 0.72);

  const abdomen = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.34, 10, 20), materials.jacket);
  abdomen.position.set(0, 1.84, 0.24);
  abdomen.rotation.x = 0.24;
  abdomen.scale.set(1.02, 1, 0.82);

  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.58, 10, 22), materials.jacket);
  chest.position.set(0, 2.16, 0.08);
  chest.rotation.x = 0.22;
  chest.scale.set(1.04, 1.06, 0.76);

  const spinePad = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.74, 0.12, 6, 0.05), materials.jacketPanel);
  spinePad.position.set(0, 2.1, 0.36);
  spinePad.rotation.x = 0.22;

  const zipper = new THREE.Mesh(new RoundedBoxGeometry(0.035, 0.86, 0.018, 3, 0.008), materials.chrome);
  zipper.position.set(0, 2.08, -0.17);
  zipper.rotation.x = 0.22;

  [-0.34, 0.34].forEach((x) => {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 10), materials.jacketPanel);
    shoulder.position.set(x, 2.32, 0.02);
    shoulder.scale.set(1.2, 0.62, 0.86);
    group.add(shoulder);
  });

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.2, 20), materials.skin);
  neck.position.set(0, 2.53, -0.05);
  neck.rotation.x = 0.18;

  group.add(hips, abdomen, chest, spinePad, zipper, neck);
  return group;
}

function createHelmet() {
  const helmet = new THREE.Group();
  helmet.position.set(0, 2.76, -0.2);
  helmet.rotation.x = 0.18;

  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.35, 32, 18), materials.helmet);
  shell.scale.set(0.98, 0.98, 1.08);
  const chin = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.18, 0.22, 7, 0.06), materials.helmet);
  chin.position.set(0, -0.18, -0.28);
  const visor = new THREE.Mesh(new RoundedBoxGeometry(0.45, 0.17, 0.038, 8, 0.036), materials.visor);
  visor.position.set(0, 0.04, -0.35);
  visor.rotation.x = 0.08;
  const brow = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.045, 0.06, 5, 0.02), materials.helmet);
  brow.position.set(0, 0.16, -0.34);

  [-0.24, 0.24].forEach((x) => {
    const vent = new THREE.Mesh(new RoundedBoxGeometry(0.085, 0.045, 0.02, 3, 0.012), materials.chrome);
    vent.position.set(x, -0.05, -0.385);
    helmet.add(vent);
  });

  helmet.add(shell, chin, visor, brow);
  return helmet;
}

function createObstacle(type) {
  const group = new THREE.Group();
  group.userData = {
    type,
    hit: false,
    passed: false,
    width: type === "barrier" ? 0.98 : type === "cone" ? 0.58 : 0.66,
    jumpClear: type === "cone" ? 0.36 : 999,
  };

  if (type === "cone") {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.76, 24), materials.cone);
    cone.position.y = 0.38;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.055, 24), materials.coneBand);
    band.position.y = 0.42;
    group.add(cone, band);
  } else if (type === "barrier") {
    const beam = new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.36, 0.18, 5, 0.035), materials.barrier);
    beam.position.y = 0.52;
    const stripeA = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.39, 0.19, 2, 0.012), materials.warning);
    stripeA.position.set(-0.28, 0.52, -0.01);
    stripeA.rotation.z = -0.55;
    const stripeB = stripeA.clone();
    stripeB.position.x = 0.28;
    group.add(beam, stripeA, stripeB);
  } else {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.74, 28), materials.warning);
    drum.position.y = 0.37;
    const capA = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.04, 28), materials.barrier);
    capA.position.y = 0.76;
    const capB = capA.clone();
    capB.position.y = 0.02;
    group.add(drum, capA, capB);
  }

  markShadow(group);
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

  if (difficulty.level >= 3 && Math.random() < 0.18 + difficulty.factor * 0.42) {
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
    if (lane === gapLane || obstacles.length >= getMaxObstacleCount(difficulty)) {
      return;
    }
    addObstacle(chooseObstacleType(Math.random(), difficulty), lane, z);
  });
}

function spawnStaggeredRows(difficulty) {
  const firstGap = Math.floor(Math.random() * lanes.length);
  const secondGap = (firstGap + (Math.random() < 0.5 ? 1 : 2)) % lanes.length;
  spawnBlockedRowWithGap(difficulty, firstGap, FRONT_SPAWN_Z);
  spawnBlockedRowWithGap(difficulty, secondGap, FRONT_SPAWN_Z + THREE.MathUtils.lerp(9.5, 6.2, difficulty.factor));
}

function spawnBlockedRowWithGap(difficulty, gapLane, z) {
  lanes.forEach((_, lane) => {
    if (lane === gapLane || obstacles.length >= getMaxObstacleCount(difficulty)) {
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
  const level = THREE.MathUtils.clamp(Math.floor(game.score / DIFFICULTY_SCORE_STEP), 0, MAX_DIFFICULTY_LEVEL);
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

function getMaxObstacleCount(difficulty) {
  return Math.round(THREE.MathUtils.lerp(4, MAX_OBSTACLES, difficulty.factor));
}

function updateGame(delta) {
  const difficulty = getDifficulty();
  const targetX = lanes[game.targetLane];
  const previousX = game.bikeX;
  game.bikeX = THREE.MathUtils.lerp(game.bikeX, targetX, THREE.MathUtils.lerp(0.12, 0.17, difficulty.factor));
  game.lean = THREE.MathUtils.lerp(game.lean, THREE.MathUtils.clamp((previousX - game.bikeX) * 1.8, -0.38, 0.38), 0.18);

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
    game.score += delta * game.speed * THREE.MathUtils.lerp(0.9, 1.28, difficulty.factor);
    game.spawnTimer -= delta;
    if (game.spawnTimer <= 0) {
      spawnObstacle();
      game.spawnTimer = getSpawnDelay(difficulty);
    }
    game.speed = Math.min(getTargetSpeed(difficulty), game.speed + delta * (1.65 + difficulty.level * 0.28));
  }

  roadMarkers.forEach((marker) => wrapZ(marker, speedUnits * delta, 38, -92));
  roadsideObjects.forEach((object) => wrapZ(object, speedUnits * delta * 0.72, 42, -96));
  obstacles.forEach((obstacle) => {
    obstacle.position.z -= speedUnits * delta;
    obstacle.rotation.y += delta * 0.35;
    if (!obstacle.userData.passed && obstacle.position.z < PASS_Z) {
      obstacle.userData.passed = true;
      game.score += 120;
    }
    if (!obstacle.userData.hit && obstacle.position.z > -0.86 && obstacle.position.z < 0.56) {
      const lateral = Math.abs(obstacle.position.x - game.bikeX);
      const canJump = game.jumpHeight > obstacle.userData.jumpClear;
      if (lateral < obstacle.userData.width && !canJump) {
        obstacle.userData.hit = true;
        registerHit();
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

  if (game.invulnerable > 0) {
    game.invulnerable = Math.max(0, game.invulnerable - delta);
  }

  bikeRig.position.x = game.bikeX;
  bikeRig.position.y = game.jumpHeight + Math.sin(clock.elapsedTime * 12) * (game.running ? 0.008 : 0.002);
  bikeRig.rotation.z = game.lean;
  bikeRig.rotation.x = game.jumpHeight > 0 ? Math.sin(clock.elapsedTime * 7) * 0.035 : 0;
  riderGroup.rotation.z = game.lean * 0.16;
  riderGroup.rotation.x = game.jumpHeight > 0 ? -0.06 : 0;

  wheelMeshes.forEach((wheel) => {
    wheel.rotation.x += delta * (game.running ? game.speed : 16) * 0.18;
  });

  cameraTarget.set(game.bikeX, 1.16 + game.jumpHeight * 0.35, 1.15);
  controls.target.lerp(cameraTarget, 0.08);
}

function registerHit() {
  if (game.invulnerable > 0) {
    return;
  }
  game.lives -= 1;
  game.invulnerable = 1.1;
  gameStatus.textContent = game.lives > 0 ? "Hit" : "Game Over";
  if (game.lives <= 0) {
    game.running = false;
    game.over = true;
    startButton.textContent = "Start";
    showGameOver();
  }
}

function moveLane(direction) {
  if (game.over) {
    resetGame();
  }
  game.targetLane = THREE.MathUtils.clamp(game.targetLane + direction, 0, lanes.length - 1);
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
  startButton.textContent = "Pause";
}

function toggleGame() {
  if (game.over) {
    resetGame();
  }
  game.running = !game.running;
  startButton.textContent = game.running ? "Pause" : "Start";
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
  game.speed = BASE_SPEED;
  game.spawnTimer = 0.8;
  game.invulnerable = 0;
  game.jumpHeight = 0;
  game.jumpVelocity = 0;
  bikeRig.position.set(0, 0, 0);
  bikeRig.rotation.set(0, 0, 0);
  obstacles.splice(0).forEach((obstacle) => {
    obstacleGroup.remove(obstacle);
    disposeObject(obstacle);
  });
  startButton.textContent = "Start";
  hideGameOver();
  updateHud();
}

function handleKeydown(event) {
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
    moveLane(1);
  } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
    moveLane(-1);
  } else if (event.key === " " || event.key === "ArrowUp" || event.key.toLowerCase() === "w") {
    event.preventDefault();
    jump();
  } else if (event.key.toLowerCase() === "p") {
    toggleGame();
  }
}

function showGameOver() {
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
  if (game.over) {
    gameStatus.textContent = "Game Over";
  } else if (!game.running) {
    gameStatus.textContent = "Ready";
  } else if (game.jumpHeight > 0.05) {
    gameStatus.textContent = `Jump Lv ${difficulty.level + 1}`;
  } else {
    gameStatus.textContent = `Lv ${difficulty.level + 1}`;
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
  if (diagnostics.frame === 1 || diagnostics.frame % DIAGNOSTICS_FRAME_INTERVAL === 0) {
    publishDiagnostics();
  }

  requestAnimationFrame(animate);
}

function createTankBadge(side) {
  const badgeCanvas = document.createElement("canvas");
  badgeCanvas.width = 256;
  badgeCanvas.height = 80;
  const context = badgeCanvas.getContext("2d");
  context.clearRect(0, 0, badgeCanvas.width, badgeCanvas.height);
  context.fillStyle = "#f1ead2";
  context.strokeStyle = "#17191d";
  context.lineWidth = 5;
  drawRoundRect(context, 9, 14, 238, 52, 13);
  context.fill();
  context.stroke();

  const texture = new THREE.CanvasTexture(badgeCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.15), material);
  badge.position.set(side * 0.5, 1.48, -0.36);
  badge.rotation.y = side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
  badge.rotation.z = side > 0 ? -0.03 : 0.03;
  return badge;
}

function createFender(z, y, radius, tube, material) {
  const fender = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 48, Math.PI * 1.12), material);
  fender.position.set(0, y + 0.04, z);
  fender.rotation.y = Math.PI * 0.5;
  fender.rotation.z = Math.PI * 0.94;
  fender.scale.x = 0.58;
  return fender;
}

function createGaugeCluster() {
  const cluster = new THREE.Group();
  [-0.13, 0.13].forEach((x) => {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.1, 0.07, 24), materials.chrome);
    cup.position.set(x, 0, 0);
    cup.rotation.x = Math.PI * 0.5;
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.012, 24), new THREE.MeshBasicMaterial({ color: "#111318" }));
    face.position.set(x, 0, -0.042);
    face.rotation.x = Math.PI * 0.5;
    cluster.add(cup, face);
  });
  cluster.add(capsuleBetween(v3(-0.18, -0.04, 0.02), v3(0.18, -0.04, 0.02), 0.018, materials.frame));
  return cluster;
}

function createMirror(side) {
  const group = new THREE.Group();
  const stalk = capsuleBetween(v3(side * 0.58, 1.56, -1.0), v3(side * 0.92, 1.78, -1.08), 0.018, materials.chrome);
  const mirror = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.035, 24), materials.chrome);
  mirror.position.set(side * 1.0, 1.82, -1.1);
  mirror.rotation.x = Math.PI * 0.5;
  mirror.rotation.y = side * 0.22;
  group.add(stalk, mirror);
  return group;
}

function createSpring(start, end, radius, turns) {
  const group = new THREE.Group();
  group.add(capsuleBetween(start, end, 0.025, materials.spoke));

  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const points = [];
  const steps = turns * 10;
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const angle = t * turns * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, t * length - length / 2, Math.sin(angle) * radius));
  }
  const spring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), steps, 0.012, 5), materials.tank);
  spring.position.copy(start).add(end).multiplyScalar(0.5);
  spring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  group.add(spring);
  return group;
}

function capsuleBetween(start, end, radius, material) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(length - radius * 2, 0.02), 8, 18), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
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
  link.download = `classic-obstacle-ride-${date}.png`;
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
      distance: Number(game.distance.toFixed(2)),
      lives: game.lives,
      speed: Math.round(game.speed),
      difficultyLevel: difficulty.level,
      difficultyFactor: Number(difficulty.factor.toFixed(3)),
      targetSpeed: Math.round(getTargetSpeed(difficulty)),
      maxObstacles: getMaxObstacleCount(difficulty),
      obstacles: obstacles.length,
      obstacleZ: obstacles.map((obstacle) => Number(obstacle.position.z.toFixed(2))).slice(0, 5),
      jumpHeight: Number(game.jumpHeight.toFixed(3)),
      model: modelState.source,
      modelLoaded: Boolean(modelState.imported),
      modelWheelNodes: wheelMeshes.length,
      wheelRotationX: wheelMeshes.length ? Number(wheelMeshes[0].rotation.x.toFixed(3)) : null,
      modelLoadError: modelState.loadError,
      travelDirection: "bike-front-positive-z",
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
    camera.position.set(3.7, 2.25, -7.8);
  } else {
    camera.position.set(4.8, 2.35, -6.8);
  }
}

function drawRoundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function v3(x, y, z) {
  return new THREE.Vector3(x, y, z);
}
