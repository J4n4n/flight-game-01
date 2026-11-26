// The sky: gradient, a sun that is a real object in the world, and clouds.
// The sun sits at a fixed world bearing (330°, thirty degrees left of north), so
// it moves across the screen as the plane turns and never parks on the HUD.
// In a storm there is no sun at all — a dark cloud bank takes its place.

import { FIELD, PALETTE } from './config.js';

/** The sun's world bearing, radians from north. */
const SUN_BEARING = (-30 * Math.PI) / 180;
/** Screen pixels per radian of bearing difference. */
const PX_PER_RAD = FIELD.width / 1.5;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function drawSky(context, plane, mission, time) {
  const storm = mission && mission.weather === 'storm';
  const grad = context.createLinearGradient(0, 0, 0, FIELD.height * 0.55);
  grad.addColorStop(0, storm ? PALETTE.stormSkyTop : PALETTE.skyTop);
  grad.addColorStop(0.55, storm ? PALETTE.stormSkyMid : PALETTE.skyMid);
  grad.addColorStop(1, storm ? PALETTE.stormSkyLow : PALETTE.skyLow);
  context.fillStyle = grad;
  // Oversized on purpose: the sky is drawn inside the world-roll transform,
  // and the fill must still cover the field corners when the frame banks.
  context.fillRect(-400, -400, FIELD.width + 800, FIELD.height + 800);
  if (storm) {
    // A dark storm bank across the top: a bumpy row of overlapping cloud
    // puffs with a lighter rim peeking from underneath and a few puffs
    // hanging lower, so the bottom edge is uneven — not a few flat blobs.
    const bank = [
      [60, 46, 150, 42], [210, 66, 170, 52], [380, 40, 180, 46],
      [560, 72, 190, 56], [740, 44, 170, 48], [920, 70, 190, 54],
      [1100, 42, 170, 46], [1240, 66, 150, 50],
    ];
    // Lighter rim: shade ellipses centred lower and taller than the dark
    // puffs, so a thin lighter crescent shows under each dark puff.
    context.fillStyle = PALETTE.stormBankShade;
    for (const [bx, by, brx, bry] of bank) {
      context.beginPath();
      context.ellipse(bx, by + 22, brx * 0.95, bry * 0.7, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = PALETTE.stormBank;
    for (const [bx, by, brx, bry] of bank) {
      context.beginPath();
      context.ellipse(bx, by, brx, bry, 0, 0, Math.PI * 2);
      context.fill();
    }
    // Small puffs hanging lower, so the bottom edge is uneven.
    for (const [bx, by, brx, bry] of [[300, 128, 90, 26], [700, 136, 100, 28], [1060, 124, 85, 24]]) {
      context.beginPath();
      context.ellipse(bx, by, brx, bry, 0, 0, Math.PI * 2);
      context.fill();
    }
    return;
  }
  // The sun, placed by bearing: only drawn while it is actually in view, at the
  // horizon, mid-left when flying north — never over the FUEL readout.
  const diff = wrapAngle(SUN_BEARING - plane.heading);
  if (Math.abs(diff) < 1.05) {
    const sunX = FIELD.width / 2 + diff * PX_PER_RAD;
    const sunY = FIELD.height * 0.30;
    const glow = context.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
    glow.addColorStop(0, PALETTE.sunGlow);
    glow.addColorStop(1, 'rgba(255,240,180,0)');
    context.fillStyle = glow;
    context.fillRect(sunX - 90, sunY - 90, 180, 180);
    context.fillStyle = PALETTE.sun;
    context.beginPath();
    context.arc(sunX, sunY, 24, 0, Math.PI * 2);
    context.fill();
  }
  void time;
}

export function drawClouds(context, project, cam, clouds, time, storm) {
  for (const cloud of clouds) {
    // Clouds drift slowly downwind and wrap around the valley.
    const driftedX = ((cloud.x + cloud.drift * time + 1600) % 3200) - 1600;
    const p = project(cam, driftedX, cloud.y, cloud.z);
    if (!p || p.y > FIELD.height * 0.55) continue;
    const s = (cloud.size * FIELD.height * 0.95) / p.f;
    if (s < 4) continue;
    // One flat opaque silhouette per cloud: every puff is its own path with
    // solid fills at full opacity, so overlapping puffs never double-blend
    // into sharp Venn-diagram seams. The shade puffs are a different solid
    // colour, so their edges read as deliberate shading, not a defect.
    const puffs = [
      { dx: 0, dy: 0, rx: 1, ry: 0.32, shade: false },
      { dx: -0.55, dy: 0.08, rx: 0.6, ry: 0.24, shade: true },
      { dx: 0.55, dy: 0.08, rx: 0.6, ry: 0.24, shade: true },
    ];
    for (const puff of puffs) {
      context.fillStyle = storm
        ? (puff.shade ? PALETTE.stormCloudShade : PALETTE.stormCloud)
        : (puff.shade ? PALETTE.cloudShade : PALETTE.cloud);
      context.beginPath();
      context.ellipse(p.x + puff.dx * s, p.y + puff.dy * s, puff.rx * s, puff.ry * s, 0, 0, Math.PI * 2);
      context.fill();
    }
  }
}
