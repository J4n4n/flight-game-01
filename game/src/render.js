// Drawing only: the world's state in, pixels out. A pseudo-3D chase view — the
// camera sits behind the plane and looks down the valley — with the sky, clouds,
// patchwork terrain, river, strips, town, rings, balloons and towers, all
// projected with one pinhole camera, and the aircraft drawn in screen space.
// The 1280x720 playfield is scaled to fit the window and centred.
//
// Pitch is counted once: the camera's ray tilt (cp) moves the world, the
// horizon stays fixed. When the plane banks, the whole world rolls with it —
// sky, sun, clouds and ground tilt as one coherent frame, never the ground
// alone while the sky stays locked at 0°.

import { FIELD, FONT, PALETTE } from './config.js';
import { drawClouds, drawSky } from './sky.js';
import { drawLandingBeacon, drawRiver, drawStrips, drawTerrain, drawTown } from './terrainDraw.js';
import { drawCrashFx, drawPlane } from './plane.js';

const FOCAL = FIELD.height * 0.95;
const CX = FIELD.width / 2;

export function createRenderer(canvas, terrain, rings) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();
  /** The ring label, painted after the plane so the nose never chops it. */
  let pendingLabel = null;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align = 'left', baseline = 'alphabetic') {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = baseline;
    context.fillText(value, x, y);
  }

  /** A world point in camera space; f is the forward distance. */
  function camSpace(cam, wx, wy, wz) {
    const dx = wx - cam.x;
    const dz = wz - cam.z;
    return {
      r: dx * cam.rx + dz * cam.rz,
      u: wy - cam.y,
      f: dx * cam.fx + dz * cam.fz,
    };
  }

  /** Project a world point into screen space; null when behind the camera. */
  function project(cam, wx, wy, wz) {
    const c = camSpace(cam, wx, wy, wz);
    if (c.f < 6) return null;
    return {
      x: CX + (c.r * FOCAL) / c.f,
      y: cam.horizon - ((c.u - c.f * cam.cp) * FOCAL) / c.f,
      f: c.f,
    };
  }

  function drawRing(cam, time) {
    const ring = rings.currentRing();
    if (!ring) return;
    const p = project(cam, ring.x, ring.y, ring.z);
    const fuel = ring.fuel;
    if (!p) return; // behind the camera: the miss is decided by the rules
    if (p.f < 12) return; // right on top of it: the pass is decided by the rules
    const radius = (ring.radius * FOCAL) / p.f;
    const pulse = 1 + Math.sin(time * 4) * 0.04;
    const main = fuel ? PALETTE.ringFuel : PALETTE.ring;
    const glow = fuel ? PALETTE.ringFuelGlow : PALETTE.ringGlow;
    context.strokeStyle = glow;
    context.lineWidth = radius * 0.28 * pulse;
    context.beginPath();
    context.arc(p.x, p.y, radius * pulse, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = main;
    context.lineWidth = Math.max(2, radius * 0.1);
    context.beginPath();
    context.arc(p.x, p.y, radius * pulse, 0, Math.PI * 2);
    context.stroke();
    // Tick marks at the quarters, so the ring reads as a gate, not a halo.
    context.lineWidth = Math.max(2, radius * 0.08);
    for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      const inner = radius * 0.82;
      const outer = radius * 1.18;
      context.beginPath();
      context.moveTo(p.x + Math.cos(a) * inner, p.y + Math.sin(a) * inner);
      context.lineTo(p.x + Math.cos(a) * outer, p.y + Math.sin(a) * outer);
      context.stroke();
    }
    // The label is deferred: it is painted after the plane, on top, with a
    // dark pill behind it — never chopped by the nose, never washed out on
    // snow or a balloon.
    if (p.f > 350) {
      pendingLabel = {
        text: `${fuel ? 'REFUEL ' : ''}RING ${Math.round(p.f)}m`,
        x: p.x,
        y: p.y + radius + 26,
        color: main,
      };
    }
    // Off-screen: an arrow at the edge points the way.
    if (p.x < 60 || p.x > FIELD.width - 60) {
      const ax = Math.max(40, Math.min(FIELD.width - 40, p.x));
      const ay = FIELD.height * 0.3;
      const dir = p.x < 60 ? -1 : 1;
      context.fillStyle = main;
      context.beginPath();
      context.moveTo(ax + dir * 18, ay);
      context.lineTo(ax - dir * 10, ay - 12);
      context.lineTo(ax - dir * 10, ay + 12);
      context.closePath();
      context.fill();
      pendingLabel = { text: `${Math.round(p.f)}m`, x: ax, y: ay + 34, color: main };
    }
  }

  /** A ring-distance label on a small dark pill, painted last so it is always
   *  legible. Only the anchor is rotated with the world roll, so the pill
   *  lands where the ring is but stays perfectly horizontal — a tilted pill
   *  reads as a bug in a banked turn. */
  function drawPendingLabel(roll) {
    if (!pendingLabel) return;
    const label = pendingLabel;
    pendingLabel = null;
    const px = label.x - CX;
    const py = label.y - FIELD.height * 0.44;
    const cos = Math.cos(-roll);
    const sin = Math.sin(-roll);
    const rx = CX + px * cos - py * sin;
    const ry = FIELD.height * 0.44 + px * sin + py * cos;
    context.font = `bold 15px ${FONT}`;
    const w = context.measureText(label.text).width + 18;
    const h = 24;
    const x = rx - w / 2;
    const y = ry - h / 2;
    context.fillStyle = 'rgba(10, 16, 28, 0.78)';
    context.beginPath();
    context.roundRect(x, y, w, h, 12);
    context.fill();
    context.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    context.lineWidth = 1;
    context.stroke();
    context.fillStyle = label.color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label.text, rx, ry + 1);
  }

  function drawObstacles(cam, time) {
    const balloonColors = {
      red: PALETTE.balloonRed,
      yellow: PALETTE.balloonYellow,
      blue: PALETTE.balloonBlue,
    };
    for (const o of rings.obstacles()) {
      if (o.kind === 'balloon') {
        const p = project(cam, o.x, o.y, o.z);
        if (!p || p.f > 2400 || p.f < 8) continue;
        const r = Math.max(2, (o.radius * FOCAL) / p.f);
        // An egg-shaped envelope with panel seams, not a flat circle.
        context.fillStyle = balloonColors[o.hue] || PALETTE.balloonRed;
        context.beginPath();
        context.ellipse(p.x, p.y, r, r * 1.08, 0, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = 'rgba(0, 0, 0, 0.18)';
        context.lineWidth = Math.max(1, r * 0.06);
        for (const fx of [-0.45, 0, 0.45]) {
          context.beginPath();
          context.ellipse(p.x, p.y, r * Math.abs(fx) + r * 0.12, r * 1.08, 0, -Math.PI * 0.42, Math.PI * 0.42);
          context.stroke();
        }
        context.fillStyle = 'rgba(255,255,255,0.35)';
        context.beginPath();
        context.ellipse(p.x - r * 0.3, p.y - r * 0.35, r * 0.3, r * 0.22, 0, 0, Math.PI * 2);
        context.fill();
        const basket = Math.max(2, r * 0.3);
        context.fillStyle = '#6b4a2f';
        context.fillRect(p.x - basket / 2, p.y + r * 1.08 + basket * 0.3, basket, basket);
        context.strokeStyle = 'rgba(60, 40, 20, 0.6)';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(p.x - r * 0.4, p.y + r * 0.9);
        context.lineTo(p.x - basket / 2, p.y + r * 1.08 + basket * 0.3);
        context.moveTo(p.x + r * 0.4, p.y + r * 0.9);
        context.lineTo(p.x + basket / 2, p.y + r * 1.08 + basket * 0.3);
        context.stroke();
      } else {
        const base = project(cam, o.x, o.y, o.z);
        const top = project(cam, o.x, o.y + o.height, o.z);
        if (!base || !top) continue;
        const wBase = Math.max(2, (o.radius * 2 * FOCAL) / base.f);
        const wTop = Math.max(1, (o.radius * 0.5 * FOCAL) / top.f);
        // Red-and-white painted stripes on a tapered lattice tower — never a
        // flat grey tombstone cross. The stripes are clipped to the tower's
        // silhouette; thin diagonals read as the lattice.
        context.save();
        context.beginPath();
        context.moveTo(base.x - wBase / 2, base.y);
        context.lineTo(top.x - wTop / 2, top.y);
        context.lineTo(top.x + wTop / 2, top.y);
        context.lineTo(base.x + wBase / 2, base.y);
        context.closePath();
        context.clip();
        const bands = 6;
        for (let i = 0; i < bands; i += 1) {
          const y0 = base.y + (top.y - base.y) * (i / bands);
          const y1 = base.y + (top.y - base.y) * ((i + 1) / bands);
          context.fillStyle = i % 2 === 0 ? '#d8402e' : '#f2f2e8';
          context.fillRect(Math.min(base.x, top.x) - wBase, y0, wBase * 2, y1 - y0 + 1);
        }
        context.strokeStyle = 'rgba(40, 40, 48, 0.55)';
        context.lineWidth = Math.max(1, wBase * 0.08);
        for (let i = 0; i < bands; i += 1) {
          const y0 = base.y + (top.y - base.y) * (i / bands);
          const y1 = base.y + (top.y - base.y) * ((i + 1) / bands);
          context.beginPath();
          context.moveTo(base.x - wBase / 2, y1);
          context.lineTo(base.x + wBase / 2, y0);
          context.stroke();
        }
        context.restore();
        context.strokeStyle = '#3a3f4a';
        context.lineWidth = Math.max(1, wBase * 0.1);
        context.beginPath();
        context.moveTo(base.x - wBase / 2, base.y);
        context.lineTo(top.x - wTop / 2, top.y);
        context.moveTo(base.x + wBase / 2, base.y);
        context.lineTo(top.x + wTop / 2, top.y);
        context.stroke();
        // A glowing red beacon at the tip, big enough to see.
        const blink = Math.floor(time * 1.5) % 2 === 0;
        const br = Math.max(3, 6 * (FOCAL / base.f) * 0.15);
        if (blink) {
          const glow = context.createRadialGradient(top.x, top.y, 1, top.x, top.y, br * 3);
          glow.addColorStop(0, 'rgba(255, 59, 48, 0.8)');
          glow.addColorStop(1, 'rgba(255, 59, 48, 0)');
          context.fillStyle = glow;
          context.beginPath();
          context.arc(top.x, top.y, br * 3, 0, Math.PI * 2);
          context.fill();
        }
        context.fillStyle = '#ff3b30';
        context.beginPath();
        context.arc(top.x, top.y, br, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  /** Rain streaks in a storm, deterministic per frame so they do not flicker. */
  function drawRain(time) {
    context.strokeStyle = 'rgba(207, 224, 238, 0.28)';
    context.lineWidth = 1.5;
    context.beginPath();
    for (let i = 0; i < 70; i += 1) {
      const seed = i * 2654435761 + Math.floor(time * 18) * 97;
      const x = ((seed >>> 0) % 1400) - 60;
      const y = ((seed >>> 7) % 800) - 40 + ((time * 620) % 800);
      const yy = y % 800;
      context.moveTo(x, yy);
      context.lineTo(x - 9, yy + 28);
    }
    context.stroke();
  }

  /** Paint one frame: the world from the chase camera, then the aircraft. */
  function draw(plane, time, mission) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

    const h = plane.heading;
    const camDist = 15;
    const cam = {
      x: plane.x - Math.sin(h) * camDist,
      y: plane.y + 4.6,
      z: plane.z - Math.cos(h) * camDist,
      fx: Math.sin(h),
      fz: Math.cos(h),
      rx: Math.cos(h),
      rz: -Math.sin(h),
      horizon: FIELD.height * 0.44,
      cp: Math.max(-0.45, Math.min(0.45, plane.pitch * 0.55)),
    };
    // When parked, the camera sits a little lower and closer, showing the strip.
    if (plane.phase === 'ground') {
      cam.y = plane.y + 3.2;
    }
    const storm = mission && mission.weather === 'storm';
    // The whole world rolls with the bank as one frame — sky, sun, clouds and
    // ground together. A wrecked plane leaves the camera level: the wreck
    // itself tilts, not the world.
    const roll = plane.phase === 'crashed' ? 0 : plane.roll * 0.9;
    context.save();
    context.translate(CX, cam.horizon);
    context.rotate(-roll);
    context.translate(-CX, -cam.horizon);
    drawSky(context, plane, mission, time);
    drawClouds(context, project, cam, terrain.clouds, time, storm);
    drawTerrain(context, project, cam, terrain, storm);
    drawRiver(context, project, cam, terrain);
    drawStrips(context, camSpace, cam, terrain);
    drawTown(context, project, cam, terrain);
    drawObstacles(cam, time);
    drawRing(cam, time);
    if (rings.awaitingLanding()) {
      drawLandingBeacon(context, project, cam, terrain, terrain.nextStrip(plane.z));
    }
    context.restore();
    drawPlane(context, plane, time);
    if (plane.phase === 'crashed') drawCrashFx(context, plane, time);
    drawPendingLabel(roll);
    if (storm) drawRain(time);
    // Leave the plain field transform in place: the HUD draws after this.
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, text };
}
