// The ground: patchwork terrain, the river, the airstrips and the town. The
// terrain is coloured by world position, not by camera slice, so the fields
// scroll under the plane instead of sitting pinned to the camera like a
// treadmill. The river and the town are tested against the ground between the
// camera and themselves, so a hill in front really hides what is behind it.

import { FIELD, PALETTE } from './config.js';
import { hash2 } from './random.js';

const FOCAL = FIELD.height * 0.95;
const CX = FIELD.width / 2;

/** Depth slices ahead of the camera, far to near, in metres. */
const SLICES = [2400, 1700, 1200, 850, 600, 430, 300, 210, 145, 100, 65, 40, 24];
const SAMPLES = 26;
const PATCH_SEED = 0x51ab;

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mix a colour toward the haze colour: farther ground looks paler and bluer. */
function haze(hex, amount) {
  const a = hexRgb(hex);
  const b = hexRgb(PALETTE.skyLow);
  const m = Math.min(0.85, Math.max(0, amount));
  const r = Math.round(a[0] + (b[0] - a[0]) * m);
  const g = Math.round(a[1] + (b[1] - a[1]) * m);
  const bl = Math.round(a[2] + (b[2] - a[2]) * m);
  return `rgb(${r},${g},${bl})`;
}

/** True when the straight ray from the camera to (px, py, pz) stays above the
 *  ground all the way: a hill in front hides the point behind it. */
function rayClear(cam, px, py, pz, terrain) {
  for (let i = 1; i <= 7; i += 1) {
    const t = i / 8;
    const x = cam.x + (px - cam.x) * t;
    const z = cam.z + (pz - cam.z) * t;
    const rayY = cam.y + (py - cam.y) * t;
    if (terrain.heightAt(x, z) > rayY + 1.5) return false;
  }
  return true;
}

/** Clip a camera-space polygon (points {r, u, f}) against the near plane f >= 6. */
function clipPolygon(points, minF) {
  let out = points;
  const inside = (p) => p.f >= minF;
  for (let edge = 0; edge < 1; edge += 1) {
    const clipped = [];
    for (let i = 0; i < out.length; i += 1) {
      const a = out[i];
      const b = out[(i + 1) % out.length];
      const aIn = inside(a);
      const bIn = inside(b);
      if (aIn) clipped.push(a);
      if (aIn !== bIn) {
        const t = (minF - a.f) / (b.f - a.f);
        clipped.push({
          r: a.r + (b.r - a.r) * t,
          u: a.u + (b.u - a.u) * t,
          f: minF,
        });
      }
    }
    out = clipped;
    if (out.length === 0) break;
  }
  return out;
}

/** Clip a camera-space segment against the near plane; null when fully behind. */
function clipSegment(a, b, minF) {
  const aIn = a.f >= minF;
  const bIn = b.f >= minF;
  if (!aIn && !bIn) return null;
  const cut = (p, q) => {
    const t = (minF - p.f) / (q.f - p.f);
    return { r: p.r + (q.r - p.r) * t, u: p.u + (q.u - p.u) * t, f: minF };
  };
  return [aIn ? a : cut(a, b), bIn ? b : cut(b, a)];
}

/** One terrain cross-section: screen points across the view at forward distance f. */
function silhouette(project, cam, terrain, f) {
  const halfWorld = (FIELD.width / 2) * (f / FOCAL) * 1.15 + 40;
  const points = [];
  const world = [];
  let heightSum = 0;
  for (let i = 0; i <= SAMPLES; i += 1) {
    const r = -halfWorld + (2 * halfWorld * i) / SAMPLES;
    const wx = cam.x + cam.fx * f + cam.rx * r;
    const wz = cam.z + cam.fz * f + cam.rz * r;
    const wy = terrain.heightAt(wx, wz);
    heightSum += wy;
    const p = project(cam, wx, wy, wz);
    points.push(p ?? { x: CX + (r * FOCAL) / f, y: cam.horizon + 400, f });
    world.push({ x: wx, z: wz });
  }
  return { points, world, avgHeight: heightSum / (SAMPLES + 1) };
}

/** The ground as a patchwork quilt: each segment is coloured from its world
 *  cell, so fields scroll with the world and no two patches match. Every quad
 *  is stroked with its own fill colour, so no hairline grid seam ever shows
 *  between two neighbouring quads. */
export function drawTerrain(context, project, cam, terrain, storm) {
  const layers = SLICES.map((f) => ({ f, ...silhouette(project, cam, terrain, f) }));
  for (let i = 0; i < layers.length; i += 1) {
    const top = layers[i];
    const bottom = layers[i + 1];
    const depth = top.f / SLICES[0];
    for (let j = 0; j < SAMPLES; j += 1) {
      const wx = (top.world[j].x + top.world[j + 1].x) / 2;
      const wz = (top.world[j].z + top.world[j + 1].z) / 2;
      const patch = hash2(Math.floor(wx / 360), Math.floor(wz / 280), PATCH_SEED);
      let base;
      if (top.avgHeight > 95) base = patch < 0.5 ? PALETTE.snow : '#dde7ec';
      else if (top.avgHeight > 60) base = patch < 0.5 ? PALETTE.rock : '#7d7468';
      else if (top.f < 320) base = patch < 0.33 ? PALETTE.field : patch < 0.66 ? PALETTE.fieldAlt : PALETTE.hillDark;
      else base = top.avgHeight > 30 ? (patch < 0.5 ? PALETTE.hillLight : PALETTE.hill) : (patch < 0.5 ? PALETTE.hill : PALETTE.hillDark);
      if (top.f > 1200) base = PALETTE.farHill;
      const fill = haze(base, depth * (storm ? 0.9 : 0.75));
      context.fillStyle = fill;
      context.strokeStyle = fill;
      context.lineWidth = 0.8;
      context.beginPath();
      context.moveTo(top.points[j].x, top.points[j].y);
      context.lineTo(top.points[j + 1].x, top.points[j + 1].y);
      if (bottom) {
        context.lineTo(bottom.points[j + 1].x, bottom.points[j + 1].y);
        context.lineTo(bottom.points[j].x, bottom.points[j].y);
      } else {
        context.lineTo(FIELD.width, FIELD.height);
        context.lineTo(0, FIELD.height);
      }
      context.closePath();
      context.fill();
      context.stroke();
    }
  }
}

/** The river as a tapered ribbon that follows its own centreline: wide up
 *  close, narrowing smoothly with distance, never a uniform thick bar with
 *  rounded caps. Each run breaks where a hill hides the water. */
export function drawRiver(context, project, cam, terrain) {
  const samples = [];
  for (let z = cam.z - 150; z <= cam.z + 2400; z += 30) {
    const x = terrain.riverX(z);
    const y = terrain.heightAt(x, z) + 1;
    const p = project(cam, x, y, z);
    if (!p) { samples.push(null); continue; }
    if (p.x < -160 || p.x > FIELD.width + 160) { samples.push(null); continue; }
    samples.push({ p, x, y, z, f: p.f });
  }
  // Split into runs of consecutive visible, unoccluded samples.
  const runs = [];
  let run = [];
  const flush = () => { if (run.length >= 2) runs.push(run); run = []; };
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (!s) { flush(); continue; }
    if (i > 0 && samples[i - 1]) {
      const prev = samples[i - 1];
      const mx = (prev.x + s.x) / 2;
      const my = (prev.y + s.y) / 2;
      const mz = (prev.z + s.z) / 2;
      if (!rayClear(cam, mx, my, mz, terrain)) { flush(); }
    }
    run.push(s);
  }
  flush();
  // The river as a flat sheet on the valley floor: each sample's left and
  // right banks are real world-space points (centreline +/- half the width,
  // at the ground height there), projected with the same camera as
  // everything else. The old code extruded the width perpendicular to the
  // 2D screen-space tangent instead, which turned a 26m-wide flat river
  // into a 26m-tall vertical blue wall whenever the river ran horizontally
  // across the screen at low altitude. A sample whose bank is behind the
  // camera breaks the ribbon instead of stretching it.
  const ribbon = (widthWorld, color) => {
    context.fillStyle = color;
    for (const r of runs) {
      let left = [];
      let right = [];
      const flushRibbon = () => {
        if (left.length < 2) { left = []; right = []; return; }
        context.beginPath();
        left.forEach((pt, i) => {
          if (i === 0) context.moveTo(pt.x, pt.y);
          else context.lineTo(pt.x, pt.y);
        });
        for (let i = right.length - 1; i >= 0; i -= 1) context.lineTo(right[i].x, right[i].y);
        context.closePath();
        context.fill();
        left = [];
        right = [];
      };
      for (let i = 0; i < r.length; i += 1) {
        const s = r[i];
        const a = r[Math.max(0, i - 1)];
        const b = r[Math.min(r.length - 1, i + 1)];
        // World-space tangent along the centreline; the banks sit
        // perpendicular to it in the xz-plane.
        let tx = b.x - a.x;
        let tz = b.z - a.z;
        const len = Math.hypot(tx, tz) || 1;
        tx /= len;
        tz /= len;
        const px = -tz;
        const pz = tx;
        const hw = widthWorld / 2;
        const lx = s.x + px * hw;
        const lz = s.z + pz * hw;
        const rx = s.x - px * hw;
        const rz = s.z - pz * hw;
        const lp = project(cam, lx, terrain.heightAt(lx, lz) + 1, lz);
        const rp = project(cam, rx, terrain.heightAt(rx, rz) + 1, rz);
        if (!lp || !rp) { flushRibbon(); continue; }
        left.push(lp);
        right.push(rp);
      }
      flushRibbon();
    }
  };
  ribbon(26, PALETTE.river);
  // A bright thread down the middle of the near water.
  ribbon(8, PALETTE.riverLight);
}

/** Project a camera-space point back to the screen. */
function toScreen(cam, c) {
  return {
    x: CX + (c.r * FOCAL) / c.f,
    y: cam.horizon - ((c.u - c.f * cam.cp) * FOCAL) / c.f,
  };
}

/** Every airstrip, clipped against the near plane instead of vanishing when a
 *  corner goes behind the camera: the runway is visible on the start screen,
 *  on takeoff and on final approach. Each strip follows its own ground in
 *  short segments and hides behind hills, so a distant strip never cuts
 *  across a sloped ridge as a flat black slab. */
export function drawStrips(context, camSpace, cam, terrain) {
  for (const strip of terrain.strips) {
    const SEG = 60;
    for (let z0 = strip.zStart; z0 < strip.zEnd; z0 += SEG) {
      const z1 = Math.min(strip.zEnd, z0 + SEG);
      const midZ = (z0 + z1) / 2;
      const midX = strip.x;
      const midY = terrain.heightAt(midX, midZ) + 0.5;
      // A hill in front hides this whole segment.
      if (!rayClear(cam, midX, midY, midZ, terrain)) continue;
      const corners = [
        camSpace(cam, strip.x - strip.halfWidth, terrain.heightAt(strip.x - strip.halfWidth, z0) + 0.5, z0),
        camSpace(cam, strip.x + strip.halfWidth, terrain.heightAt(strip.x + strip.halfWidth, z0) + 0.5, z0),
        camSpace(cam, strip.x + strip.halfWidth, terrain.heightAt(strip.x + strip.halfWidth, z1) + 0.5, z1),
        camSpace(cam, strip.x - strip.halfWidth, terrain.heightAt(strip.x - strip.halfWidth, z1) + 0.5, z1),
      ];
      const clipped = clipPolygon(corners, 6);
      if (clipped.length < 3) continue;
      const depth = Math.min(1, (midZ - cam.z) / 2400);
      const fill = haze(PALETTE.runway, depth * 0.55);
      context.fillStyle = fill;
      context.strokeStyle = fill;
      context.lineWidth = 0.8;
      context.beginPath();
      clipped.forEach((c, i) => {
        const s = toScreen(cam, c);
        if (i === 0) context.moveTo(s.x, s.y);
        else context.lineTo(s.x, s.y);
      });
      context.closePath();
      context.fill();
      context.stroke();
    }
    // Crisp white edge lines along both sides, capped so they never turn
    // into giant bars when the camera is right on top of the strip.
    context.strokeStyle = PALETTE.runwayLine;
    context.lineCap = 'butt';
    for (const side of [-1, 1]) {
      const ex = strip.x + side * (strip.halfWidth - 2);
      for (let z = strip.zStart; z < strip.zEnd; z += 90) {
        const seg = clipSegment(
          camSpace(cam, ex, terrain.heightAt(ex, z) + 0.7, z),
          camSpace(cam, ex, terrain.heightAt(ex, z + 90) + 0.7, z + 90),
          6,
        );
        if (!seg) continue;
        const a = toScreen(cam, seg[0]);
        const b = toScreen(cam, seg[1]);
        context.lineWidth = Math.max(1, Math.min(4, 1.4 * (FOCAL / seg[0].f)));
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
    }
    // Centreline dashes, with a clean gap around the painted runway number
    // so no dash touches the "36": round-4 shot 2 had a dash fragment
    // abutting the bottom of the "6" (numZ = zStart + 320, dashes are
    // [z, z + 22]).
    const numZ = strip.zStart + 320;
    for (let z = strip.zStart + 20; z < strip.zEnd - 10; z += 44) {
      if (z < numZ + 24 && z + 22 > numZ - 24) continue;
      const seg = clipSegment(
        camSpace(cam, strip.x, terrain.heightAt(strip.x, z) + 0.7, z),
        camSpace(cam, strip.x, terrain.heightAt(strip.x, z + 22) + 0.7, z + 22),
        6,
      );
      if (!seg) continue;
      const a = toScreen(cam, seg[0]);
      const b = toScreen(cam, seg[1]);
      context.lineWidth = Math.max(1, Math.min(5, 2.2 * (FOCAL / seg[0].f)));
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    // Threshold piano-key bars at each end: eight short bars across the width,
    // drawn as quads so they read at any distance.
    for (const z of [strip.zStart + 12, strip.zEnd - 24]) {
      const barLen = 12;
      const gap = (strip.halfWidth * 2 - 8) / 8;
      for (let i = 0; i < 8; i += 1) {
        const bx0 = strip.x - strip.halfWidth + 4 + i * gap;
        const bx1 = bx0 + gap * 0.55;
        const corners = [
          camSpace(cam, bx0, terrain.heightAt(bx0, z) + 0.7, z),
          camSpace(cam, bx1, terrain.heightAt(bx1, z) + 0.7, z),
          camSpace(cam, bx1, terrain.heightAt(bx1, z + barLen) + 0.7, z + barLen),
          camSpace(cam, bx0, terrain.heightAt(bx0, z + barLen) + 0.7, z + barLen),
        ];
        const clipped = clipPolygon(corners, 6);
        if (clipped.length < 3) continue;
        context.fillStyle = PALETTE.runwayLine;
        context.beginPath();
        clipped.forEach((c, k) => {
          const s = toScreen(cam, c);
          if (k === 0) context.moveTo(s.x, s.y);
          else context.lineTo(s.x, s.y);
        });
        context.closePath();
        context.fill();
      }
    }
    // Painted runway number 36, further down the strip so it stays ahead of
    // a plane climbing out after liftoff, foreshortened flat onto the
    // asphalt (squashed vertically around its own centre) instead of
    // floating upright behind the propeller like a HUD sticker. (numZ is
    // defined above, before the centreline dashes, so the dashes can leave
    // a clean gap around it.)
    const numC = camSpace(cam, strip.x, terrain.heightAt(strip.x, numZ) + 0.9, numZ);
    if (numC.f > 60 && numC.f < 1200) {
      const s = toScreen(cam, numC);
      if (s.x > -40 && s.x < FIELD.width + 40 && s.y > 40 && s.y < FIELD.height - 120) {
        const size = Math.max(10, Math.min(40, (9 * FOCAL) / numC.f));
        context.save();
        context.translate(s.x, s.y);
        context.scale(1, 0.38);
        context.font = `bold ${Math.round(size)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.lineWidth = Math.max(2, size / 8);
        context.strokeStyle = 'rgba(20, 24, 32, 0.7)';
        context.strokeText('36', 0, 0);
        context.fillStyle = PALETTE.runwayLine;
        context.fillText('36', 0, 0);
        context.restore();
      }
    }
  }
}

/** The town, far houses first so near ones overlap them, each house shaded by
 *  distance and its roof skewed a little by the rotation it was placed with. */
export function drawTown(context, project, cam, terrain) {
  const drawn = [];
  for (const house of terrain.houses) {
    const ground = terrain.heightAt(house.x, house.z);
    const base = project(cam, house.x, ground, house.z);
    if (!base || base.f > 2400) continue;
    if (!rayClear(cam, house.x, ground, house.z, terrain)) continue;
    drawn.push({ house, base, ground });
  }
  drawn.sort((a, b) => b.base.f - a.base.f);
  for (const { house, base } of drawn) {
    const w = Math.max(2, (house.w * FOCAL) / base.f);
    const h = Math.max(2, (house.h * FOCAL) / base.f);
    const depth = base.f / 2400;
    // A soft ground shadow so each house sits on the earth, not floats on it.
    context.fillStyle = 'rgba(20, 26, 20, 0.35)';
    context.fillRect(base.x - w / 2 - 1, base.y - 1, w + 2, 2);
    context.fillStyle = haze(hash2(Math.floor(house.x), Math.floor(house.z), 7) < 0.5 ? PALETTE.townWall : PALETTE.townWallAlt, depth * 0.7);
    context.fillRect(base.x - w / 2, base.y - h, w, h);
    context.fillStyle = haze(hash2(Math.floor(house.x), Math.floor(house.z), 9) < 0.5 ? PALETTE.townRoof : PALETTE.townRoofAlt, depth * 0.7);
    const apexX = base.x + house.rot * w * 0.3;
    context.beginPath();
    context.moveTo(base.x - w / 2 - 1, base.y - h);
    context.lineTo(apexX, base.y - h - h * 0.55);
    context.lineTo(base.x + w / 2 + 1, base.y - h);
    context.closePath();
    context.fill();
  }
}

/** The landing beacon: a glowing pillar over the next strip when a landing
 *  mission is waiting for the plane to put down. */
export function drawLandingBeacon(context, project, cam, terrain, strip) {
  if (!strip) return;
  const midZ = (strip.zStart + strip.zEnd) / 2;
  const ground = terrain.heightAt(strip.x, midZ);
  const base = project(cam, strip.x, ground + 2, midZ);
  const top = project(cam, strip.x, ground + 180, midZ);
  if (!base || !top) return;
  const w = Math.max(3, (10 * FOCAL) / base.f);
  const grad = context.createLinearGradient(0, top.y, 0, base.y);
  grad.addColorStop(0, 'rgba(255, 210, 62, 0)');
  grad.addColorStop(1, 'rgba(255, 210, 62, 0.55)');
  context.fillStyle = grad;
  context.fillRect(base.x - w / 2, top.y, w, base.y - top.y);
  context.fillStyle = PALETTE.ring;
  context.font = `bold 16px ${'system-ui, -apple-system, "Segoe UI", sans-serif'}`;
  context.textAlign = 'center';
  context.fillText('LAND HERE', base.x, top.y - 12);
}
