// The simulation of Solmar Bay: the player on foot and in cars, traffic, pedestrians,
// police who chase a wanted level, three story missions and combat. It owns no
// rendering beyond moving its meshes; the camera and HUD live in main.js and hud.js.
// Every rule here runs on fixed steps from a seeded source, so a scripted run
// always plays the same way.
import {
  BUSTED_FINE, CAR, CITY_HALF, MISSION_REWARDS, PALETTE, PED_COUNT, PARKED_COUNT,
  PLACES, PLAYER, ROADS, ROAD_WIDTH, TRAFFIC_COUNT, WANTED_DECAY_SECONDS,
} from './config.js';
import { pick, range } from './random.js';
import { nearestRoad, resolveCircle } from './city.js';

export const EVENT_PICKUP = 1;
export const EVENT_CRIME = 2;
export const EVENT_MISSION = 4;
export const EVENT_BUSTED = 8;
export const EVENT_WASTED = 16;
export const EVENT_SHOT = 32;
export const EVENT_CRASH = 64;
export const EVENT_CASE = 128;

function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function turnToward(current, target, maxTurn) {
  const d = angleDiff(target, current);
  if (d > maxTurn) return current + maxTurn;
  if (d < -maxTurn) return current - maxTurn;
  return target;
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function createWorld(random, city, scene) {
  const colliders = city.colliders;
  const marker = city.makeMarker();
  marker.visible = false;
  scene.add(marker);

  const state = {
    time: 0,
    cash: 0,
    health: PLAYER.maxHealth,
    wanted: 0,
    crimeTimer: 0,
    missionIndex: 0,
    missionStage: 0,
    missionText: '',
    message: '',
    messageTimer: 0,
    shootCooldown: 0,
    bustedTimer: 0,
    lastDamage: -99,
    rivalsLeft: 0,
    hasCase: false,
    player: null,
    cars: [],
    peds: [],
    cops: [],
    enemies: [],
  };

  function showMessage(text, seconds) {
    state.message = text;
    state.messageTimer = seconds || 4;
  }

  function addCrime(levels) {
    if (state.wanted < 5) state.wanted = Math.min(5, state.wanted + levels);
    state.crimeTimer = 0;
  }

  function spawnCar(x, z, heading, color, kind) {
    const mesh = kind === 'cop' ? city.makeCopCar() : city.makeCar(color);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const car = {
      mesh, x, z, heading, speed: 0,
      axis: 'x', road: 0, lane: 0, dir: 1,
      traffic: kind === 'traffic', parked: kind === 'parked',
      cop: kind === 'cop', gold: kind === 'gold',
      stolen: false, targetSpeed: 0, flashTimer: 0,
    };
    state.cars.push(car);
    if (car.cop) state.cops.push(car);
    return car;
  }

  function spawnTrafficCar() {
    const horizontal = random() < 0.5;
    const road = pick(random, ROADS);
    const dir = random() < 0.5 ? 1 : -1;
    const lane = (random() < 0.5 ? -3.5 : 3.5) * dir;
    const along = range(random, -CITY_HALF, CITY_HALF);
    const x = horizontal ? along : road + lane;
    const z = horizontal ? road + lane : along;
    const heading = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const car = spawnCar(x, z, heading, pick(random, city.carColors), 'traffic');
    car.axis = horizontal ? 'x' : 'z';
    car.road = road;
    car.lane = lane;
    car.dir = dir;
    car.targetSpeed = range(random, 8, 14);
    car.speed = car.targetSpeed;
    return car;
  }

  function spawnParkedCar() {
    const road = pick(random, ROADS);
    const horizontal = random() < 0.5;
    const along = range(random, -170, 170);
    const side = random() < 0.5 ? -1 : 1;
    const x = horizontal ? along : road + side * (ROAD_WIDTH / 2 + 1.5);
    const z = horizontal ? road + side * (ROAD_WIDTH / 2 + 1.5) : along;
    const heading = horizontal ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI);
    const car = spawnCar(x, z, heading, pick(random, city.carColors), 'parked');
    car.axis = horizontal ? 'x' : 'z';
    car.road = road;
    return car;
  }

  function spawnPed() {
    const horizontal = random() < 0.5;
    const road = pick(random, ROADS);
    const dir = random() < 0.5 ? 1 : -1;
    const side = (random() < 0.5 ? -1 : 1) * (ROAD_WIDTH / 2 + 2.5);
    const along = range(random, -CITY_HALF, CITY_HALF);
    const x = horizontal ? along : road + side;
    const z = horizontal ? road + side : along;
    const mesh = city.makePerson(pick(random, city.shirtColors));
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const ped = {
      mesh, x, z, axis: horizontal ? 'x' : 'z', road, dir,
      side, speed: range(random, 1.1, 2.2), angle: horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      flee: 0, down: 0, downTimer: 0,
    };
    state.peds.push(ped);
    return ped;
  }

  function spawnRival(x, z) {
    const mesh = city.makePerson(0x2c1a4d);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const enemy = { mesh, x, z, angle: range(random, 0, Math.PI * 2), health: 50, shootTimer: range(random, 0.4, 1.2) };
    state.enemies.push(enemy);
    return enemy;
  }

  function clearEnemies() {
    for (const enemy of state.enemies) scene.remove(enemy.mesh);
    state.enemies = [];
    state.rivalsLeft = 0;
  }

  function missionTarget() {
    const i = state.missionIndex;
    const s = state.missionStage;
    if (i === 0) return s === 0 ? PLACES.pickup : PLACES.garage;
    if (i === 1) return s === 0 ? PLACES.goldCar : PLACES.garage;
    if (i === 2) {
      if (s === 0) return PLACES.warehouse;
      if (s === 2) return PLACES.warehouse;
      if (s === 3) return PLACES.hideout;
      return PLACES.warehouse;
    }
    return PLACES.hideout;
  }

  function missionLabel() {
    const i = state.missionIndex;
    const s = state.missionStage;
    if (i === 0) {
      state.missionText = s === 0
        ? 'Mission 1 — The Pickup: reach the green marker and collect the package'
        : 'Mission 1 — The Pickup: deliver the package to Lena\'s Garage';
    } else if (i === 1) {
      state.missionText = s === 0
        ? 'Mission 2 — Hot Wheels: steal the gold Comet at the marker (E to enter)'
        : 'Mission 2 — Hot Wheels: deliver the Comet to Lena\'s Garage — the cops are on you';
    } else if (i === 2) {
      if (s === 0) state.missionText = 'Mission 3 — The Big Score: reach the warehouse';
      else if (s === 1) state.missionText = `Mission 3 — The Big Score: take down the rivals (${state.rivalsLeft} left)`;
      else if (s === 2) state.missionText = 'Mission 3 — The Big Score: grab the case';
      else state.missionText = 'Mission 3 — The Big Score: escape to the Hideout';
    } else {
      state.missionText = 'Story complete — Solmar Bay is yours. Press M to replay the missions.';
    }
  }

  function placeMarker() {
    const target = missionTarget();
    if (state.missionIndex >= 3) {
      marker.visible = false;
      return;
    }
    marker.visible = true;
    marker.position.set(target.x, 0, target.z);
  }

  function completeMission() {
    const reward = MISSION_REWARDS[state.missionIndex];
    state.cash += reward;
    showMessage(`Mission complete! +$${reward}`, 5);
    state.missionIndex += 1;
    state.missionStage = 0;
    state.hasCase = false;
    missionLabel();
    placeMarker();
    return EVENT_MISSION;
  }

  function reset() {
    for (const car of state.cars) scene.remove(car.mesh);
    for (const ped of state.peds) scene.remove(ped.mesh);
    if (state.player) scene.remove(state.player.mesh);
    clearEnemies();
    state.cars = [];
    state.peds = [];
    state.cops = [];
    state.time = 0;
    state.cash = 0;
    state.health = PLAYER.maxHealth;
    state.wanted = 0;
    state.crimeTimer = 0;
    state.missionIndex = 0;
    state.missionStage = 0;
    state.rivalsLeft = 0;
    state.hasCase = false;
    state.shootCooldown = 0;
    state.bustedTimer = 0;
    state.lastDamage = -99;
    showMessage('', 0);

    const playerMesh = city.makePerson(PALETTE.playerShirt);
    playerMesh.position.set(PLACES.hideout.x + 6, 0, PLACES.hideout.z);
    scene.add(playerMesh);
    state.player = {
      mesh: playerMesh, x: PLACES.hideout.x + 6, z: PLACES.hideout.z,
      angle: Math.PI / 4, speed: 0, onFoot: true, car: null, walkPhase: 0,
    };
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) spawnTrafficCar();
    for (let i = 0; i < PARKED_COUNT; i += 1) spawnParkedCar();
    for (let i = 0; i < PED_COUNT; i += 1) spawnPed();
    // The gold Comet waits at its marker for mission 2.
    spawnCar(PLACES.goldCar.x, PLACES.goldCar.z, Math.PI / 2, PALETTE.goldCar, 'gold');
    missionLabel();
    placeMarker();
  }

  function bustPlayer() {
    const fine = Math.min(state.cash, BUSTED_FINE);
    state.cash -= fine;
    state.wanted = 0;
    state.bustedTimer = 0;
    state.health = PLAYER.maxHealth;
    if (state.player.car) {
      state.player.car.speed = 0;
      state.player.car = null;
    }
    state.player.onFoot = true;
    state.player.mesh.visible = true;
    state.player.x = PLACES.hideout.x + 6;
    state.player.z = PLACES.hideout.z;
    showMessage(fine > 0 ? `BUSTED! The cops took $${fine}.` : 'BUSTED! You spent a night in the cells.', 5);
    return EVENT_BUSTED;
  }

  function wastePlayer() {
    const fine = Math.min(state.cash, BUSTED_FINE);
    state.cash -= fine;
    state.wanted = 0;
    state.health = PLAYER.maxHealth;
    state.missionStage = 0;
    state.hasCase = false;
    clearEnemies();
    if (state.player.car) {
      state.player.car.speed = 0;
      state.player.car = null;
    }
    state.player.onFoot = true;
    state.player.mesh.visible = true;
    state.player.x = PLACES.hideout.x + 6;
    state.player.z = PLACES.hideout.z;
    missionLabel();
    placeMarker();
    showMessage(fine > 0 ? `WASTED! You woke up at the Hideout, $${fine} lighter.` : 'WASTED! You woke up at the Hideout.', 5);
    return EVENT_WASTED;
  }

  function nearestCar(x, z, maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const car of state.cars) {
      const d = dist2(x, z, car.x, car.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar(car) {
    const p = state.player;
    p.car = car;
    p.onFoot = false;
    p.mesh.visible = false;
    car.speed = 0;
    car.traffic = false;
    car.parked = false;
    if (!car.stolen && !car.cop) {
      car.stolen = true;
      addCrime(1);
      showMessage(car.gold ? 'You stole the gold Comet! The cops are coming!' : 'Car stolen! Wanted level up.', 4);
      return EVENT_CRIME;
    }
    return 0;
  }

  function exitCar() {
    const p = state.player;
    const car = p.car;
    if (!car) return 0;
    const sideX = Math.cos(car.heading);
    const sideZ = -Math.sin(car.heading);
    p.x = car.x + sideX * 3;
    p.z = car.z + sideZ * 3;
    p.angle = car.heading;
    p.car = null;
    p.onFoot = true;
    p.mesh.visible = true;
    car.speed = 0;
    return 0;
  }

  function shoot() {
    const p = state.player;
    if (!p.onFoot || state.shootCooldown > 0) return 0;
    state.shootCooldown = 0.3;
    let events = EVENT_SHOT;
    // Hit the nearest rival in a cone in front of the player.
    let best = null;
    let bestD = 35 * 35;
    for (const enemy of state.enemies) {
      const d = dist2(p.x, p.z, enemy.x, enemy.z);
      if (d > bestD) continue;
      const aim = Math.atan2(enemy.x - p.x, enemy.z - p.z);
      if (Math.abs(angleDiff(aim, p.angle)) > 0.4) continue;
      best = enemy;
      bestD = d;
    }
    if (best) {
      best.health -= 34;
      if (best.health <= 0) {
        scene.remove(best.mesh);
        state.enemies.splice(state.enemies.indexOf(best), 1);
        state.rivalsLeft = state.enemies.length;
        state.cash += 25;
        showMessage('Rival down! +$25', 3);
        missionLabel();
      }
      return events;
    }
    // No rival in the sights: a pedestrian hit by a stray shot is still a crime.
    for (const ped of state.peds) {
      if (ped.down) continue;
      const d = dist2(p.x, p.z, ped.x, ped.z);
      if (d > 35 * 35) continue;
      const aim = Math.atan2(ped.x - p.x, ped.z - p.z);
      if (Math.abs(angleDiff(aim, p.angle)) > 0.4) continue;
      ped.down = 1;
      ped.downTimer = 3;
      ped.mesh.rotation.x = Math.PI / 2;
      addCrime(1);
      showMessage('You shot a pedestrian! Wanted level up.', 4);
      return events | EVENT_CRIME;
    }
    return events;
  }

  function stepPlayer(dt, ctl) {
    const p = state.player;
    if (state.shootCooldown > 0) state.shootCooldown -= dt;
    if (ctl.enter) {
      if (p.onFoot) {
        const car = nearestCar(p.x, p.z, 5);
        if (car && !car.cop) return enterCar(car);
        if (car && car.cop) showMessage('That is a police car!', 2);
      } else {
        return exitCar();
      }
    }
    if (ctl.shoot) {
      const ev = shoot();
      if (ev) return ev;
    }
    if (p.onFoot) {
      const speed = ctl.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const cam = ctl.camYaw || 0;
      const fwdX = Math.sin(cam);
      const fwdZ = Math.cos(cam);
      const strafeX = Math.cos(cam);
      const strafeZ = -Math.sin(cam);
      const mx = fwdX * ctl.forward + strafeX * ctl.steer;
      const mz = fwdZ * ctl.forward + strafeZ * ctl.steer;
      const len = Math.hypot(mx, mz);
      if (len > 0.01) {
        const nx = mx / len;
        const nz = mz / len;
        p.x += nx * speed * dt;
        p.z += nz * speed * dt;
        p.angle = turnToward(p.angle, Math.atan2(nx, nz), PLAYER.turnSpeed * dt);
        p.walkPhase += dt * speed * 1.6;
      }
      p.x = Math.max(-CITY_HALF - 30, Math.min(CITY_HALF + 30, p.x));
      p.z = Math.max(-CITY_HALF - 30, Math.min(CITY_HALF + 30, p.z));
      resolveCircle(p, PLAYER.radius, colliders);
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.angle;
      const swing = len > 0.01 ? Math.sin(p.walkPhase) * 0.5 : 0;
      p.mesh.userData.armL.rotation.x = swing;
      p.mesh.userData.armR.rotation.x = -swing;
      p.speed = len > 0.01 ? speed : 0;
    } else {
      const car = p.car;
      if (ctl.forward > 0) car.speed += CAR.accel * dt;
      else if (ctl.forward < 0) car.speed -= CAR.brake * dt;
      else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 12 * dt);
      if (ctl.forward === 0 && Math.abs(car.speed) < 0.5) car.speed = 0;
      car.speed = Math.max(-CAR.reverseMax, Math.min(CAR.maxSpeed, car.speed));
      const steerAmount = ctl.steer * CAR.turnRate * dt * Math.min(1, Math.abs(car.speed) / 8);
      car.heading += (car.speed >= 0 ? steerAmount : -steerAmount) * Math.sign(car.speed || 1);
      const nx = car.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.z + Math.cos(car.heading) * car.speed * dt;
      const probe = { x: nx, z: nz };
      resolveCircle(probe, 2.2, colliders);
      const hitWall = probe.x !== nx || probe.z !== nz;
      if (hitWall && Math.abs(car.speed) > 6) {
        car.speed *= 0.4;
        return EVENT_CRASH;
      }
      car.x = Math.max(-CITY_HALF - 30, Math.min(CITY_HALF + 30, probe.x));
      car.z = Math.max(-CITY_HALF - 30, Math.min(CITY_HALF + 30, probe.z));
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      car.mesh.userData.body.rotation.z = -ctl.steer * 0.04 * Math.min(1, Math.abs(car.speed) / 10);
      p.x = car.x;
      p.z = car.z;
      p.angle = car.heading;
      p.speed = Math.abs(car.speed);
    }
    return 0;
  }

  function stepTraffic(dt) {
    const p = state.player;
    for (const car of state.cars) {
      if (!car.traffic) continue;
      // Slow down for the car ahead in the same lane.
      let ahead = null;
      let aheadD = 12;
      for (const other of state.cars) {
        if (other === car || other.axis !== car.axis || other.road !== car.road) continue;
        const along = car.axis === 'x' ? (other.x - car.x) * car.dir : (other.z - car.z) * car.dir;
        if (along > 0 && along < aheadD && Math.abs((car.axis === 'x' ? other.z : other.x) - (car.axis === 'x' ? car.z : car.x)) < 4) {
          ahead = other;
          aheadD = along;
        }
      }
      if (ahead) car.speed = Math.max(0, Math.min(car.speed, ahead.speed * 0.9));
      else car.speed = Math.min(car.targetSpeed, car.speed + 4 * dt);
      if (car.axis === 'x') car.x += car.dir * car.speed * dt;
      else car.z += car.dir * car.speed * dt;
      const along = car.axis === 'x' ? car.x : car.z;
      if (along > CITY_HALF + 10 || along < -CITY_HALF - 10) {
        if (car.axis === 'x') car.x = -car.dir * (CITY_HALF + 10);
        else car.z = -car.dir * (CITY_HALF + 10);
      }
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
    }
    // The player's car shoves other cars aside and takes a knock.
    if (!p.onFoot && p.car) {
      for (const car of state.cars) {
        if (car.cop || car === p.car) continue;
        const dx = car.x - p.car.x;
        const dz = car.z - p.car.z;
        const d = Math.hypot(dx, dz);
        if (d < 4.4 && d > 0.01) {
          const push = 4.4 - d;
          car.x += (dx / d) * push;
          car.z += (dz / d) * push;
          car.mesh.position.set(car.x, 0, car.z);
          if (Math.abs(p.car.speed) > 10) {
            p.car.speed *= 0.6;
            return EVENT_CRASH;
          }
        }
      }
    }
    return 0;
  }

  function stepPeds(dt) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.down) {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.down = 0;
          ped.mesh.rotation.x = 0;
          ped.x = range(random, -180, 180);
          ped.z = pick(random, ROADS) + (random() < 0.5 ? -1 : 1) * (ROAD_WIDTH / 2 + 2.5);
          ped.mesh.position.set(ped.x, 0, ped.z);
        }
        continue;
      }
      const playerSpeed = p.onFoot ? 0 : Math.abs(p.car ? p.car.speed : 0);
      const dPlayer = dist2(p.x, p.z, ped.x, ped.z);
      if (dPlayer < 36 && (!p.onFoot && playerSpeed > 8)) ped.flee = 2;
      if (ped.flee > 0) {
        ped.flee -= dt;
        const away = Math.atan2(ped.x - p.x, ped.z - p.z);
        ped.angle = turnToward(ped.angle, away, 6 * dt);
        ped.x += Math.sin(ped.angle) * 5 * dt;
        ped.z += Math.cos(ped.angle) * 5 * dt;
      } else {
        if (ped.axis === 'x') ped.x += ped.dir * ped.speed * dt;
        else ped.z += ped.dir * ped.speed * dt;
        const along = ped.axis === 'x' ? ped.x : ped.z;
        if (along > CITY_HALF + 5 || along < -CITY_HALF - 5) ped.dir *= -1;
        if (random() < 0.0004) ped.dir *= -1;
      }
      ped.x = Math.max(-CITY_HALF - 20, Math.min(CITY_HALF + 20, ped.x));
      ped.z = Math.max(-CITY_HALF - 20, Math.min(CITY_HALF + 20, ped.z));
      resolveCircle(ped, 0.7, colliders);
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.angle;
      const swing = Math.sin(state.time * 6 + ped.x) * 0.4;
      ped.mesh.userData.armL.rotation.x = swing;
      ped.mesh.userData.armR.rotation.x = -swing;
      // Run over by the player's car: a crime, and the pedestrian goes down.
      if (!p.onFoot && p.car && Math.abs(p.car.speed) > 3 && dPlayer < 2.4 * 2.4) {
        ped.down = 1;
        ped.downTimer = 4;
        ped.mesh.rotation.x = Math.PI / 2;
        addCrime(1);
        showMessage('You hit a pedestrian! Wanted level up.', 4);
        return EVENT_CRIME;
      }
    }
    return 0;
  }

  function stepPolice(dt) {
    const p = state.player;
    // Keep the number of pursuit cars equal to the wanted level.
    while (state.cops.length < state.wanted) {
      const road = nearestRoad(p.z);
      const angle = range(random, 0, Math.PI * 2);
      const x = p.x + Math.sin(angle) * range(random, 60, 100);
      const z = p.z + Math.cos(angle) * range(random, 60, 100);
      const cop = spawnCar(x, z, 0, 0, 'cop');
      cop.axis = 'x';
      cop.road = road;
      cop.targetSpeed = 30 + state.wanted * 1.5;
    }
    while (state.cops.length > state.wanted) {
      const cop = state.cops.pop();
      state.cars.splice(state.cars.indexOf(cop), 1);
      scene.remove(cop.mesh);
    }
    let events = 0;
    for (const cop of state.cops) {
      // Chase a point trailing the player, so the pursuit car stays in view
      // behind them instead of driving into their bumper.
      const trail = p.onFoot ? 0 : 12;
      const tx = p.x - Math.sin(p.angle) * trail;
      const tz = p.z - Math.cos(p.angle) * trail;
      const targetAngle = Math.atan2(tx - cop.x, tz - cop.z);
      cop.heading = turnToward(cop.heading, targetAngle, 2.4 * dt);
      cop.speed = Math.min(cop.targetSpeed, cop.speed + 10 * dt);
      const nx = cop.x + Math.sin(cop.heading) * cop.speed * dt;
      const nz = cop.z + Math.cos(cop.heading) * cop.speed * dt;
      const probe = { x: nx, z: nz };
      resolveCircle(probe, 2.2, colliders);
      if (probe.x === nx && probe.z === nz) {
        cop.x = nx;
        cop.z = nz;
      } else {
        cop.speed *= 0.5;
      }
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
      cop.flashTimer += dt;
      const on = Math.floor(cop.flashTimer * 6) % 2 === 0;
      cop.mesh.userData.lightRed.material.color.setHex(on ? 0xff2020 : 0x550000);
      cop.mesh.userData.lightBlue.material.color.setHex(on ? 0x101050 : 0x2050ff);
      const d = dist2(p.x, p.z, cop.x, cop.z);
      // Keep the pursuit car beside the player instead of inside their car.
      if (!p.onFoot && d < 4.8 * 4.8) {
        const dd = Math.sqrt(d) || 0.001;
        const push = 4.8 - dd;
        cop.x += ((cop.x - p.x) / dd) * push;
        cop.z += ((cop.z - p.z) / dd) * push;
        cop.mesh.position.set(cop.x, 0, cop.z);
      }
      if (p.onFoot && d < 2.8 * 2.8) {
        state.bustedTimer += dt;
        if (state.bustedTimer > 1.2) return bustPlayer();
      } else if (!p.onFoot && d < 4.6 * 4.6) {
        p.car.speed *= 0.92;
        if (state.time - state.lastDamage > 2) {
          state.lastDamage = state.time;
          state.health -= 4;
          showMessage('The cops are ramming you!', 2);
        }
      }
    }
    if (state.cops.length === 0) state.bustedTimer = 0;
    return events;
  }

  function stepEnemies(dt) {
    const p = state.player;
    for (const enemy of state.enemies) {
      const d = dist2(p.x, p.z, enemy.x, enemy.z);
      enemy.angle = turnToward(enemy.angle, Math.atan2(p.x - enemy.x, p.z - enemy.z), 3 * dt);
      enemy.mesh.rotation.y = enemy.angle;
      if (d < 30 * 30) {
        enemy.shootTimer -= dt;
        if (enemy.shootTimer <= 0) {
          enemy.shootTimer = 0.9;
          state.health -= 6;
          state.lastDamage = state.time;
          showMessage('Rival gang is shooting at you!', 2);
          return EVENT_SHOT;
        }
      }
    }
    return 0;
  }

  function stepMissions(dt) {
    const p = state.player;
    const target = missionTarget();
    const d = Math.sqrt(dist2(p.x, p.z, target.x, target.z));
    const i = state.missionIndex;
    if (i >= 3) return 0;
    if (i === 0) {
      if (d < 5) {
        if (state.missionStage === 0) {
          state.missionStage = 1;
          missionLabel();
          placeMarker();
          showMessage('Package collected! Deliver it to Lena\'s Garage.', 4);
          return EVENT_PICKUP;
        }
        return completeMission();
      }
    } else if (i === 1) {
      if (state.missionStage === 0) {
        const gold = state.cars.find((c) => c.gold);
        if (p.car === gold) {
          state.missionStage = 1;
          state.wanted = Math.max(state.wanted, 2);
          missionLabel();
          placeMarker();
          showMessage('The Comet is yours — now lose the cops and deliver it!', 4);
        }
      } else if (d < 6 && p.car && p.car.gold) {
        return completeMission();
      }
    } else if (i === 2) {
      if (state.missionStage === 0 && d < 6) {
        state.missionStage = 1;
        for (let k = 0; k < 5; k += 1) {
          spawnRival(PLACES.warehouse.x + range(random, -12, 12), PLACES.warehouse.z + range(random, -12, 12));
        }
        state.rivalsLeft = 5;
        missionLabel();
        showMessage('Ambush! The Vipers are here — fight back (click or F to shoot).', 5);
      } else if (state.missionStage === 1 && state.enemies.length === 0) {
        state.missionStage = 2;
        missionLabel();
        placeMarker();
        showMessage('All rivals down. Grab the case!', 4);
      } else if (state.missionStage === 2 && d < 5) {
        state.missionStage = 3;
        state.hasCase = true;
        missionLabel();
        placeMarker();
        showMessage('Case secured! Escape to the Hideout.', 4);
        return EVENT_CASE;
      } else if (state.missionStage === 3 && d < 6) {
        return completeMission();
      }
    }
    return 0;
  }

  // One fixed step. `ctl` carries the player's input for this step; the returned
  // bit flags tell the caller what happened (pickup, crime, mission done, busted...).
  function step(dt, ctl) {
    let events = 0;
    state.time += dt;
    if (state.messageTimer > 0) {
      state.messageTimer -= dt;
      if (state.messageTimer <= 0) state.message = '';
    }
    if (state.wanted > 0) {
      state.crimeTimer += dt;
      if (state.crimeTimer >= WANTED_DECAY_SECONDS) {
        state.wanted -= 1;
        state.crimeTimer = 0;
        if (state.wanted === 0) showMessage('You lost the cops.', 3);
      }
    }
    // Health comes back slowly when nobody has hurt the player for a while.
    if (state.time - state.lastDamage > 6 && state.health < PLAYER.maxHealth) {
      state.health = Math.min(PLAYER.maxHealth, state.health + 3 * dt);
    }

    events |= stepPlayer(dt, ctl);
    events |= stepTraffic(dt);
    events |= stepPeds(dt);
    events |= stepPolice(dt);
    events |= stepEnemies(dt);
    events |= stepMissions(dt);

    if (state.health <= 0) events |= wastePlayer();
    if (marker.visible) {
      const pulse = 1 + Math.sin(state.time * 3) * 0.15;
      marker.scale.set(pulse, 1, pulse);
    }
    return events;
  }

  function save() {
    return {
      cash: state.cash,
      health: state.health,
      missionIndex: state.missionIndex,
      x: state.player.x,
      z: state.player.z,
      angle: state.player.angle,
    };
  }

  function load(data) {
    if (!data || typeof data !== 'object') return false;
    state.cash = Number(data.cash) || 0;
    state.health = Number(data.health) || PLAYER.maxHealth;
    state.missionIndex = Math.min(3, Math.max(0, Number(data.missionIndex) || 0));
    state.missionStage = 0;
    state.player.x = Number(data.x) || PLACES.hideout.x + 6;
    state.player.z = Number(data.z) || PLACES.hideout.z;
    state.player.angle = Number(data.angle) || 0;
    state.player.mesh.position.set(state.player.x, 0, state.player.z);
    missionLabel();
    placeMarker();
    return true;
  }

  function replayMissions() {
    state.missionIndex = 0;
    state.missionStage = 0;
    state.hasCase = false;
    clearEnemies();
    missionLabel();
    placeMarker();
    showMessage('Missions restarted — Mission 1: The Pickup.', 4);
  }

  reset();
  return { state, reset, step, save, load, replayMissions, missionTarget };
}
