// The city of Solmar Bay: a sun-soaked coastal grid of roads, blocks, towers,
// palms and lamps, built once from a seeded source. Everything here is boxes,
// cylinders and canvas textures — no outside art. The builder also hands out the
// car and person meshes the world drives, and the collision boxes the rules use.
import { CITY_HALF, PALETTE, ROADS, ROAD_WIDTH } from './config.js';
import { pick, range } from './random.js';

const BUILDING_COLORS = [PALETTE.buildingA, PALETTE.buildingB, PALETTE.buildingC, PALETTE.buildingD];
const CAR_COLORS = [0xc0392b, 0x2471a3, 0x1e8449, 0x7d3c98, 0xd4ac0d, 0x5d6d7e, 0xe67e22, 0x16a085];
const SHIRT_COLORS = [0x2e86c1, 0x28b463, 0xf39c12, 0x8e44ad, 0xecf0f1, 0x1abc9c, 0xe74c3c, 0x34495e];

// A little window texture drawn on a canvas, so the towers read as buildings
// instead of plain boxes. Lit windows glow warm at dusk.
function windowTexture(random, base) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#' + base.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, 64, 128);
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const lit = random() < 0.35;
      ctx.fillStyle = lit ? '#ffd97a' : '#2c3e50';
      ctx.fillRect(6 + col * 14, 8 + row * 15, 9, 10);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function box(w, h, d, color, x, y, z, material) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    material || new THREE.MeshLambertMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// A drivable car: body, cabin, wheels and lights. `flash` marks a police light bar.
export function makeCar(color) {
  const group = new THREE.Group();
  const body = box(2.0, 0.62, 4.4, color, 0, 0.55, 0);
  const cabin = box(1.7, 0.55, 2.2, 0x1c2833, 0, 1.1, -0.2);
  group.add(body, cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    group.add(wheel);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  for (const wx of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.1), lightMat);
    lamp.position.set(wx, 0.62, 2.22);
    group.add(lamp);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd21f1f });
  for (const wx of [-0.6, 0.6]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.1), tailMat);
    tail.position.set(wx, 0.62, -2.22);
    group.add(tail);
  }
  group.userData.body = body;
  return group;
}

export function makeCopCar() {
  const group = makeCar(PALETTE.copWhite);
  const stripe = box(2.02, 0.2, 4.42, PALETTE.copBlue, 0, 0.72, 0);
  group.add(stripe);
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: 0x2050ff }));
  red.position.set(-0.45, 1.45, -0.2);
  blue.position.set(0.45, 1.45, -0.2);
  group.add(red, blue);
  group.userData.lightRed = red;
  group.userData.lightBlue = blue;
  return group;
}

// A person on foot: legs, torso, head and arms, about 1.8 m tall.
export function makePerson(shirt) {
  const group = new THREE.Group();
  const skin = 0xc98d64;
  const legs = box(0.5, 0.8, 0.3, 0x2c3e50, 0, 0.4, 0);
  const torso = box(0.62, 0.7, 0.36, shirt, 0, 1.15, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), new THREE.MeshLambertMaterial({ color: skin }));
  head.position.set(0, 1.68, 0);
  head.castShadow = true;
  const armGeo = new THREE.BoxGeometry(0.16, 0.62, 0.16);
  const armMat = new THREE.MeshLambertMaterial({ color: shirt });
  const armL = new THREE.Mesh(armGeo, armMat);
  armL.position.set(-0.4, 1.15, 0);
  const armR = new THREE.Mesh(armGeo, armMat);
  armR.position.set(0.4, 1.15, 0);
  group.add(legs, torso, head, armL, armR);
  group.userData.armL = armL;
  group.userData.armR = armR;
  group.userData.legs = legs;
  return group;
}

// The glowing mission beacon: a light pillar and a ring on the ground.
export function makeMarker() {
  const group = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 30, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 15;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.4, 24),
    new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  group.add(pillar, ring);
  group.userData.pillar = pillar;
  group.userData.ring = ring;
  return group;
}

function palm(random) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.22, 4.2, 8),
    new THREE.MeshLambertMaterial({ color: 0x8a6d3b }),
  );
  trunk.position.y = 2.1;
  trunk.castShadow = true;
  group.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57 });
  for (let i = 0; i < 6; i += 1) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.4, 4), leafMat);
    const angle = (i / 6) * Math.PI * 2 + random() * 0.4;
    leaf.position.set(Math.cos(angle) * 0.9, 4.4, Math.sin(angle) * 0.9);
    leaf.rotation.z = Math.cos(angle) * 1.1;
    leaf.rotation.x = -Math.sin(angle) * 1.1;
    leaf.castShadow = true;
    group.add(leaf);
  }
  return group;
}

// Push a circle (x, z, radius) out of every building box it overlaps.
export function resolveCircle(pos, radius, colliders) {
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius) {
      if (distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        pos.x = cx + (dx / dist) * radius;
        pos.z = cz + (dz / dist) * radius;
      } else {
        pos.x = c.maxX + radius;
      }
    }
  }
}

export function nearestRoad(value) {
  let best = ROADS[0];
  for (const road of ROADS) {
    if (Math.abs(road - value) < Math.abs(best - value)) best = road;
  }
  return best;
}

export function createCity(scene, random) {
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 180, 520);

  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.4);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220;
  sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 600;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.1));

  // Ground, beach and ocean: the city ends at the water on its west side.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 80, CITY_HALF * 2 + 80),
    new THREE.MeshLambertMaterial({ color: 0x6f7f5a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(260, CITY_HALF * 2 + 400),
    new THREE.MeshLambertMaterial({ color: PALETTE.ocean }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(-CITY_HALF - 130, -0.4, 0);
  scene.add(ocean);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(18, CITY_HALF * 2 + 80),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(-CITY_HALF - 9, -0.1, 0);
  sand.receiveShadow = true;
  scene.add(sand);

  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8c96a });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  for (const road of ROADS) {
    for (const horizontal of [true, false]) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2 + 40, ROAD_WIDTH + 6), walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(0, 0.01, 0);
      if (horizontal) walk.position.set(0, 0.01, road);
      else { walk.rotation.z = Math.PI / 2; walk.position.set(road, 0.01, 0); }
      walk.receiveShadow = true;
      scene.add(walk);
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2 + 40, ROAD_WIDTH), roadMat);
      strip.rotation.x = -Math.PI / 2;
      if (horizontal) strip.position.set(0, 0.02, road);
      else { strip.rotation.z = Math.PI / 2; strip.position.set(road, 0.02, 0); }
      strip.receiveShadow = true;
      scene.add(strip);
      const line = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2 + 40, 0.3), lineMat);
      line.rotation.x = -Math.PI / 2;
      if (horizontal) line.position.set(0, 0.03, road);
      else { line.rotation.z = Math.PI / 2; line.position.set(road, 0.03, 0); }
      scene.add(line);
    }
  }

  const colliders = [];
  const textures = BUILDING_COLORS.map((color) => windowTexture(random, color));
  // One or two towers per block, with a gap between them for alleys.
  for (let bx = 0; bx < 4; bx += 1) {
    for (let bz = 0; bz < 4; bz += 1) {
      const blockX = -120 + bx * 80;
      const blockZ = -120 + bz * 80;
      const count = random() < 0.6 ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        const w = range(random, 18, 30);
        const d = range(random, 18, 30);
        const h = range(random, 9, 42);
        const ox = count === 1 ? 0 : (i === 0 ? -14 : 14);
        const oz = count === 1 ? 0 : (i === 0 ? -12 : 12);
        const x = blockX + ox;
        const z = blockZ + oz;
        const tex = pick(random, textures);
        const tower = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshLambertMaterial({ map: tex }),
        );
        tower.position.set(x, h / 2, z);
        tower.castShadow = true;
        tower.receiveShadow = true;
        scene.add(tower);
        // A flat roof box so the skyline varies.
        const roof = box(Math.min(w, 10), 1.2, Math.min(d, 10), 0x5a5a5a, x + w * 0.2, h + 0.6, z - d * 0.15);
        scene.add(roof);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
    }
  }

  // Palms and lamps along the roads.
  for (const road of ROADS) {
    for (let t = -180; t <= 180; t += 45) {
      if (random() < 0.5) {
        const tree = palm(random);
        tree.position.set(t, 0, road + ROAD_WIDTH / 2 + 4);
        scene.add(tree);
      }
      if (random() < 0.5) {
        const tree = palm(random);
        tree.position.set(road + ROAD_WIDTH / 2 + 4, 0, t);
        scene.add(tree);
      }
      const lamp = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 5, 8), new THREE.MeshLambertMaterial({ color: 0x2c3e50 }));
      pole.position.y = 2.5;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
      head.position.y = 5.1;
      lamp.add(pole, head);
      lamp.position.set(t + 20, 0, road - ROAD_WIDTH / 2 - 3.5);
      scene.add(lamp);
    }
  }

  // The hideout: a small house with a red roof near the south-west corner.
  const house = box(10, 5, 8, 0xe8dcc0, -168, 2.5, -168);
  scene.add(house);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(7.5, 3, 4), new THREE.MeshLambertMaterial({ color: 0xa93226 }));
  roof.position.set(-168, 6.5, -168);
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  scene.add(roof);
  colliders.push({ minX: -173, maxX: -163, minZ: -172, maxZ: -164 });

  return {
    colliders,
    makeCar,
    makeCopCar,
    makePerson,
    makeMarker,
    carColors: CAR_COLORS,
    shirtColors: SHIRT_COLORS,
  };
}
