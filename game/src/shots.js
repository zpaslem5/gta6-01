// The screenshot scenes behind ?shot=start|play|end. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot, so the frame is what a short game really looks like and the same seed
// always gives the same frame.
import { STEP } from './config.js';

const START_SECONDS = 5;
const WALK_LIMIT_SECONDS = 30;
const DRIVE_SECONDS = 18;
const END_DRIVE_SECONDS = 10;

function idleCtl() {
  return { forward: 0, steer: 0, run: false, enter: false, shoot: false, camYaw: 0 };
}

function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Walk the player toward the nearest parked car, get in, then drive a loop around
// the outer ring of roads (corner to corner), so the frame stays on the streets
// with traffic and the chasing police in view.
function makeDriver() {
  let axis = null;
  let road = 0;
  let dir = 1;
  let canTurn = true;

  function startDriving(car) {
    const alongX = Math.abs(Math.sin(car.heading)) > Math.abs(Math.cos(car.heading));
    axis = alongX ? 'x' : 'z';
    let bestRoad = 0;
    let bestD = Infinity;
    for (const r of [-160, -80, 0, 80, 160]) {
      const cross = alongX ? car.z : car.x;
      const d = Math.abs(r - cross);
      if (d < bestD) {
        bestD = d;
        bestRoad = r;
      }
    }
    road = bestRoad;
    dir = alongX ? Math.sign(Math.sin(car.heading)) || 1 : Math.sign(Math.cos(car.heading)) || 1;
  }

  return function autopilotDrive(world) {
    const state = world.state;
    const p = state.player;
    // On foot: head for the nearest parked car and climb in.
    if (p.onFoot) {
      let best = null;
      let bestD = Infinity;
      for (const car of state.cars) {
        if (!car.parked || car.cop) continue;
        const dx = car.x - p.x;
        const dz = car.z - p.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = car;
        }
      }
      if (!best) return idleCtl();
      if (bestD < 20) return { forward: 0, steer: 0, run: false, enter: true, shoot: false, camYaw: 0 };
      const camYaw = Math.atan2(best.x - p.x, best.z - p.z);
      return { forward: 1, steer: 0, run: true, enter: false, shoot: false, camYaw };
    }
    // Driving: follow the current road; slow for the corner, then turn onto the ring road.
    const car = p.car;
    if (!axis) startDriving(car);
    const along = axis === 'x' ? car.x : car.z;
    if (Math.abs(along) < 100) canTurn = true;
    if (canTurn && Math.abs(along) > 145) {
      const edge = Math.sign(along) * 160;
      if (axis === 'x') {
        axis = 'z';
        road = edge;
        dir = Math.sign(along);
      } else {
        axis = 'x';
        road = edge;
        dir = -Math.sign(along);
      }
      canTurn = false;
    }
    const targetX = axis === 'x' ? car.x + dir * 40 : road;
    const targetZ = axis === 'x' ? road : car.z + dir * 40;
    const wanted = Math.atan2(targetX - car.x, targetZ - car.z);
    const diff = angleDiff(wanted, car.heading);
    const steer = diff > 0.12 ? 1 : diff < -0.12 ? -1 : 0;
    // Brake before the corner so the turn stays on the road.
    const forward = Math.abs(along) > 120 && Math.abs(car.speed) > 18 ? -1 : 1;
    return { forward, steer, run: false, enter: false, shoot: false, camYaw: car.heading };
  };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and
 * return the screen to draw over it.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, idleCtl());
    return { screen: 'title' };
  }
  if (name === 'play') {
    const drive = makeDriver();
    for (let i = 0; i < (WALK_LIMIT_SECONDS + DRIVE_SECONDS) / STEP; i += 1) {
      world.step(STEP, drive(world));
      if (!world.state.player.onFoot && world.state.wanted < 2) {
        world.state.wanted = 2;
      }
    }
    return { screen: 'play' };
  }
  // End: the big score is done — the player stands by the Comet at the hideout,
  // pockets full, story complete.
  const drive = makeDriver();
  for (let i = 0; i < END_DRIVE_SECONDS / STEP; i += 1) world.step(STEP, drive(world));
  world.state.cash = 2300;
  world.state.missionIndex = 3;
  world.state.wanted = 0;
  world.state.missionText = 'Story complete — Solmar Bay is yours. Press M to replay the missions.';
  world.state.message = 'THE BIG SCORE — Mission complete! +$1500';
  world.state.messageTimer = 999;
  return { screen: 'end' };
}
