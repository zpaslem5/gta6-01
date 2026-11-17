// Keyboard and mouse input for Solmar Bay. Held keys steer; one-shot presses
// (enter a car, shoot, pause, confirm) are queued as bit flags and taken once by the
// loop, so a press between two frames is never lost and never counted twice. Dragging
// with the mouse orbits the camera; a plain click shoots while on foot.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_SHOOT = 8;
export const ACTION_MISSION = 16;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const SHOOT_KEY = new Set(['KeyF']);
const MISSION = new Set(['KeyM']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let camYaw = 0;
  let camPitch = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let downX = 0;
  let downY = 0;

  window.addEventListener('keydown', (event) => {
    held.add(event.code);
    if (event.repeat) return;
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (ENTER.has(event.code)) actions |= ACTION_ENTER;
    else if (SHOOT_KEY.has(event.code)) actions |= ACTION_SHOOT;
    else if (MISSION.has(event.code)) actions |= ACTION_MISSION;
    if (FORWARD.has(event.code) || BACK.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code) || event.code === 'Space') {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    dragging = false;
  });

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    downX = event.clientX;
    downY = event.clientY;
  });
  window.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    camYaw -= (event.clientX - lastX) * 0.005;
    camPitch = Math.max(-0.1, Math.min(0.9, camPitch + (event.clientY - lastY) * 0.003));
    lastX = event.clientX;
    lastY = event.clientY;
  });
  window.addEventListener('pointerup', (event) => {
    if (!dragging) return;
    dragging = false;
    const moved = Math.hypot(event.clientX - downX, event.clientY - downY);
    if (moved < 6) actions |= ACTION_SHOOT;
  });

  return {
    // Steering: forward in [-1, 1] (W/S), steer in [-1, 1] (A/D).
    drive() {
      let fwd = 0;
      let back = 0;
      let left = 0;
      let right = 0;
      FORWARD.forEach((code) => { if (held.has(code)) fwd = 1; });
      BACK.forEach((code) => { if (held.has(code)) back = 1; });
      LEFT.forEach((code) => { if (held.has(code)) left = 1; });
      RIGHT.forEach((code) => { if (held.has(code)) right = 1; });
      return { forward: fwd - back, steer: right - left };
    },
    running() {
      let run = false;
      RUN.forEach((code) => { if (held.has(code)) run = true; });
      return run;
    },
    // Camera orbit deltas since the last call, in radians.
    takeCamera() {
      const out = { yaw: camYaw, pitch: camPitch };
      camYaw = 0;
      camPitch = 0;
      return out;
    },
    // The one-shot presses since the last call, as ACTION_* flags.
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
