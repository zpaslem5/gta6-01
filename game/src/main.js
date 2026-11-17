// Boot and the one loop for Solmar Bay: input is read every frame, the world
// advances in fixed 1/60 s steps (several in a slow frame, none in a fast one), and
// the three.js renderer paints what is there. The game moves between four screens:
// title, play, paused and busted/wasted.
//
// ?seed=N fixes the city and traffic. ?shot=start|play|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createCity } from './city.js';
import { createWorld, EVENT_BUSTED, EVENT_CASE, EVENT_CRASH, EVENT_MISSION, EVENT_PICKUP, EVENT_SHOT, EVENT_WASTED } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MISSION, ACTION_PAUSE, ACTION_SHOOT, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const titleEl = document.getElementById('title-screen');
const pauseEl = document.getElementById('pause-screen');
const overEl = document.getElementById('over-screen');
const overTitle = document.getElementById('over-title');
const overText = document.getElementById('over-text');
const bannerEl = document.getElementById('banner');
const endCardEl = document.getElementById('shot-end');
const continueBtn = document.getElementById('btn-continue');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);

const random = createRandom(seed);
const city = createCity(scene, random);
const world = createWorld(random, city, scene);
const hud = createHud(document);
const audio = createAudio();

let camYaw = world.state.player.angle;
let camPitch = 0.25;
let titleOrbit = 0;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// The camera sits behind the player (or their car) and looks where they face;
// the mouse drags it around, and while driving it eases back behind the car.
function placeCamera() {
  const p = world.state.player;
  const driving = !p.onFoot;
  const dist = driving ? 12 : 8;
  const height = (driving ? 5.2 : 3.6) + camPitch * 4;
  const fx = Math.sin(camYaw);
  const fz = Math.cos(camYaw);
  camera.position.set(
    p.x - fx * dist,
    height,
    p.z - fz * dist,
  );
  camera.lookAt(p.x + fx * 4, 1.2, p.z + fz * 4);
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.save()));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function hasSave() {
  return readSave() !== null;
}

function showOnly(el) {
  for (const other of [titleEl, pauseEl, overEl]) other.classList.add('hidden');
  if (el) el.classList.remove('hidden');
}

function showBanner(text) {
  bannerEl.textContent = text;
  bannerEl.classList.remove('hidden');
  window.setTimeout(() => bannerEl.classList.add('hidden'), 4500);
}

function runShot(name) {
  const staged = stageShot(name, world);
  titleEl.classList.add('hidden');
  endCardEl.classList.add('hidden');
  if (staged.screen === 'title') {
    camYaw = 2.4;
    camPitch = 0.4;
    titleEl.classList.remove('hidden');
  } else if (staged.screen === 'end') {
    camYaw = world.state.player.angle + 0.6;
    endCardEl.classList.remove('hidden');
  } else {
    camYaw = world.state.player.angle;
  }
  hud.update(world, !world.state.player.onFoot, Math.abs(world.state.player.speed || 0) * 3.6);
  let painted = 0;
  function paint() {
    if (staged.screen === 'title') {
      // A high view from the south-west corner, looking across the city grid.
      camera.position.set(-150, 30, -170);
      camera.lookAt(60, 6, 60);
    } else {
      placeCamera();
    }
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = 'title';
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startFresh() {
    world.reset();
    camYaw = world.state.player.angle;
    accumulator = 0;
    screen = 'play';
    showOnly(null);
    announce('Playing. Milo is on the streets of Solmar Bay.');
  }

  function startContinued() {
    const save = readSave();
    world.reset();
    if (save) world.load(save);
    camYaw = world.state.player.angle;
    accumulator = 0;
    screen = 'play';
    showOnly(null);
    announce('Welcome back to Solmar Bay.');
  }

  function pauseGame() {
    screen = 'paused';
    showOnly(pauseEl);
    saveGame();
    announce('Paused. Progress saved.');
  }

  function resumeGame() {
    screen = 'play';
    showOnly(null);
    announce('Playing.');
  }

  function endScreen(title, text) {
    screen = 'over';
    overTitle.textContent = title;
    overText.textContent = text;
    showOnly(overEl);
    saveGame();
    announce(`${title} ${text}`);
  }

  function handleEvents(events) {
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_CASE) audio.pickup();
    if (events & EVENT_MISSION) {
      audio.missionDone();
      showBanner(world.state.message);
      saveGame();
    }
    if (events & EVENT_BUSTED) {
      audio.busted();
      endScreen('BUSTED', world.state.message);
    } else if (events & EVENT_WASTED) {
      audio.busted();
      endScreen('WASTED', world.state.message);
    }
  }

  function stepWorld(actions) {
    const drive = input.drive();
    const cam = input.takeCamera();
    camYaw += cam.yaw;
    camPitch = Math.max(0, Math.min(0.9, camPitch + cam.pitch));
    const ctl = {
      forward: drive.forward,
      steer: drive.steer,
      run: input.running(),
      enter: Boolean(actions & ACTION_ENTER),
      shoot: Boolean(actions & ACTION_SHOOT),
      camYaw,
    };
    if (actions & ACTION_MISSION) world.replayMissions();
    if (!world.state.player.onFoot) {
      // Ease the camera back behind the car while driving.
      let diff = world.state.player.angle - camYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      camYaw += diff * 0.03;
    }
    const events = world.step(STEP, ctl);
    handleEvents(events);
    const driving = !world.state.player.onFoot;
    audio.engine(driving, driving ? Math.abs(world.state.player.car.speed) / 40 : 0);
    audio.siren(world.state.wanted > 0);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    let actions = input.takeActions();
    if (screen === 'title') {
      titleOrbit += 0.0004;
      camYaw = world.state.player.angle + 1.2 + Math.sin(titleOrbit) * 0.6;
      if (actions & ACTION_CONFIRM) startFresh();
      while (accumulator >= STEP) {
        world.step(STEP, { forward: 0, steer: 0, run: false, enter: false, shoot: false, camYaw });
        accumulator -= STEP;
      }
    } else if (screen === 'play') {
      if (actions & ACTION_PAUSE) {
        pauseGame();
      } else {
        while (accumulator >= STEP && screen === 'play') {
          stepWorld(actions);
          actions = 0;
          accumulator -= STEP;
        }
      }
    } else if (screen === 'paused') {
      accumulator = 0;
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) resumeGame();
    } else if (screen === 'over') {
      accumulator = 0;
      if (actions & ACTION_CONFIRM) {
        screen = 'play';
        showOnly(null);
      }
    }
    placeCamera();
    hud.update(world, !world.state.player.onFoot, Math.abs(world.state.player.speed || 0) * 3.6);
    renderer.render(scene, camera);
  }

  // Leaving the tab pauses a running game rather than letting the cops catch the player unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') pauseGame();
  });
  window.addEventListener('beforeunload', () => {
    if (screen === 'play') saveGame();
  });

  document.getElementById('btn-start').addEventListener('click', () => {
    audio.unlock();
    startFresh();
  });
  continueBtn.addEventListener('click', () => {
    audio.unlock();
    startContinued();
  });
  document.getElementById('btn-resume').addEventListener('click', resumeGame);
  document.getElementById('btn-quit-title').addEventListener('click', () => {
    saveGame();
    screen = 'title';
    showOnly(titleEl);
    if (hasSave()) continueBtn.classList.remove('hidden');
  });
  document.getElementById('btn-over').addEventListener('click', () => {
    screen = 'play';
    showOnly(null);
  });
  canvas.addEventListener('pointerdown', () => audio.unlock());

  if (hasSave()) continueBtn.classList.remove('hidden');
  announce('Solmar Bay. Press Space or click Start to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
