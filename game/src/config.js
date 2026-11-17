// Every tuning number for Solmar Bay in one place, so the rules of the open world
// can be read without digging through the simulation. The city is a fixed 400 by 400
// metre grid; the renderer scales nothing here, every rule works in world metres.
export const STEP = 1 / 60;

export const CITY_HALF = 200;
export const ROADS = [-160, -80, 0, 80, 160];
export const ROAD_WIDTH = 14;

export const SAVE_KEY = 'solmar-bay.save.v1';

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10.5,
  radius: 0.9,
  maxHealth: 100,
  turnSpeed: 10,
};

export const CAR = {
  accel: 24,
  brake: 38,
  reverseMax: 11,
  maxSpeed: 40,
  turnRate: 2.1,
  length: 4.6,
  width: 2.1,
};

export const TRAFFIC_COUNT = 14;
export const PED_COUNT = 24;
export const PARKED_COUNT = 6;

export const WANTED_DECAY_SECONDS = 25;
export const BUSTED_FINE = 200;

export const MISSION_REWARDS = [500, 800, 1500];

// Mission waypoints, in world metres. The hideout is the player's home base,
// Lena's garage is where deliveries go, the warehouse is the rivals' turf.
export const PLACES = {
  hideout: { x: -168, z: -168, label: 'Hideout' },
  pickup: { x: 128, z: -128, label: 'The Pickup' },
  garage: { x: -128, z: 128, label: "Lena's Garage" },
  goldCar: { x: 84, z: 84, label: 'Gold Comet' },
  warehouse: { x: 168, z: 168, label: 'Warehouse' },
};

export const PALETTE = {
  sky: 0x87b5d6,
  fog: 0xa8c4d4,
  sun: 0xfff1c9,
  ocean: 0x2e7f9e,
  sand: 0xe0c98f,
  grass: 0x5d8a4a,
  asphalt: 0x33363d,
  sidewalk: 0x9a9a92,
  buildingA: 0xd8c9a8,
  buildingB: 0xb8c4cc,
  buildingC: 0xc9a06a,
  buildingD: 0x8fa3b8,
  playerShirt: 0xe8503a,
  copBlue: 0x2a4fd7,
  copWhite: 0xf2f2f2,
  goldCar: 0xf2b705,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
