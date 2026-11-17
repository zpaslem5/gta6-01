// The HUD of Solmar Bay: cash, health, wanted stars, the mission line and a live
// minimap drawn on a small canvas. All of it is plain DOM over the 3D view, updated
// every frame from the world state.
import { CITY_HALF, ROADS } from './config.js';

const MINIMAP = 190;

export function createHud(document) {
  const cashEl = document.getElementById('hud-cash');
  const healthFill = document.getElementById('hud-health-fill');
  const healthText = document.getElementById('hud-health-text');
  const starsEl = document.getElementById('hud-stars');
  const missionEl = document.getElementById('hud-mission');
  const messageEl = document.getElementById('hud-message');
  const speedEl = document.getElementById('hud-speed');
  const hintEl = document.getElementById('hud-hint');
  const map = document.getElementById('hud-minimap');
  const mapCtx = map.getContext('2d');

  function toMap(x, z) {
    const s = MINIMAP / (CITY_HALF * 2 + 60);
    return [(x + CITY_HALF + 30) * s, (z + CITY_HALF + 30) * s];
  }

  function drawMinimap(world, markerPos) {
    const ctx = mapCtx;
    ctx.fillStyle = '#0e1a24';
    ctx.fillRect(0, 0, MINIMAP, MINIMAP);
    // Ocean on the west edge.
    ctx.fillStyle = '#2e7f9e';
    ctx.fillRect(0, 0, 14, MINIMAP);
    ctx.fillStyle = '#e0c98f';
    ctx.fillRect(14, 0, 4, MINIMAP);
    // Roads.
    ctx.fillStyle = '#4a4d55';
    for (const road of ROADS) {
      const [rx] = toMap(road, 0);
      const [, rz] = toMap(0, road);
      ctx.fillRect(rx - 3, 0, 6, MINIMAP);
      ctx.fillRect(0, rz - 3, MINIMAP, 6);
    }
    // Mission marker, pulsing.
    if (markerPos) {
      const [mx, my] = toMap(markerPos.x, markerPos.z);
      const pulse = 5 + Math.sin(world.state.time * 5) * 2;
      ctx.fillStyle = '#39ff88';
      ctx.beginPath();
      ctx.arc(mx, my, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Traffic (white), police (flashing blue/red), pedestrians (grey).
    for (const car of world.state.cars) {
      const [cx, cy] = toMap(car.x, car.z);
      ctx.fillStyle = car.cop ? (Math.floor(world.state.time * 3.3) % 2 === 0 ? '#ff2020' : '#2050ff') : '#e8e8e8';
      ctx.fillRect(cx - 2, cy - 2, 4, 4);
    }
    for (const ped of world.state.peds) {
      if (ped.down) continue;
      const [px, py] = toMap(ped.x, ped.z);
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
    // The player: a yellow arrow pointing where they face.
    const p = world.state.player;
    const [px, py] = toMap(p.x, p.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(Math.sin(p.angle), Math.cos(p.angle)) + Math.PI);
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  return {
    update(world, driving, speedKmh) {
      const s = world.state;
      cashEl.textContent = `$${s.cash.toLocaleString('en-US')}`;
      const health = Math.max(0, Math.round(s.health));
      healthFill.style.width = `${health}%`;
      healthFill.style.background = health > 50 ? '#39d353' : health > 25 ? '#f2b705' : '#e5534b';
      healthText.textContent = `${health}`;
      let stars = '';
      for (let i = 0; i < 5; i += 1) stars += i < s.wanted ? '★' : '☆';
      starsEl.textContent = stars;
      starsEl.style.color = s.wanted > 0 ? '#ffd23e' : '#8b93a3';
      missionEl.textContent = s.missionText;
      messageEl.textContent = s.message;
      messageEl.style.opacity = s.message ? '1' : '0';
      speedEl.textContent = driving ? `${Math.round(speedKmh)} km/h` : '';
      hintEl.textContent = driving
        ? 'W/S drive · A/D steer · E exit car · P pause'
        : 'WASD move · Shift run · E enter car · Click/F shoot · P pause · M missions';
      const target = world.missionTarget();
      drawMinimap(world, s.missionIndex < 3 ? target : null);
    },
  };
}
