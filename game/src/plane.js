// The aircraft: a bush plane drawn from behind, as the chase camera sees it —
// a wide horizontal high wing across the top, a short boxy fuselage seen from
// the tail, a tall vertical fin rising in front of the fuselage, the horizontal
// stabiliser at the near end, a tiny prop blur barely peeking past the nose,
// and fixed tundra tires hanging below. No cabin windows: from behind, a
// bush plane shows no glass at all — two oval panes read as googly eyes and
// kill the chase-cam read. Every part carries a thin dark outline so the white
// wing never vanishes against a white cloud. Plus the crash: smoke, fire and
// debris when the sortie ends in the terrain.

import { FIELD, PALETTE } from './config.js';

const CX = FIELD.width / 2;
const OUTLINE = '#232a36';

export function drawPlane(context, plane, time) {
  const crashed = plane.phase === 'crashed';
  const px = CX;
  const py = FIELD.height * 0.60 - plane.pitch * 70 + Math.sin(time * 2.2) * 1.5;
  context.save();
  context.translate(px, py);
  // A touch of bank for life; the world itself rolls with the plane. A wreck
  // lies wing-down at ~35° instead of banking with the air.
  context.rotate(crashed ? plane.roll * 0.9 : plane.roll * 0.5);
  // Foreshortening: nose up, the fuselage reads shorter.
  const foreshorten = 1 - Math.max(0, plane.pitch) * 0.45;
  context.scale(1, foreshorten);
  // Wing flex with bank: the rising tip lifts, the dropping tip falls.
  const flex = crashed ? 0 : plane.roll * 18;

  // High wing: straight with a slight dihedral, thin chord, red tips — drawn
  // with a dark outline so it never melts into a white cloud behind it.
  context.lineWidth = 2;
  context.strokeStyle = OUTLINE;
  context.fillStyle = PALETTE.planeWing;
  context.beginPath();
  context.moveTo(-12, -34);
  context.lineTo(-118, -40 - flex);
  context.lineTo(-112, -26 - flex);
  context.lineTo(-12, -22);
  context.closePath();
  context.fill();
  context.stroke();
  if (!crashed) {
    context.beginPath();
    context.moveTo(12, -34);
    context.lineTo(118, -40 + flex);
    context.lineTo(112, -26 + flex);
    context.lineTo(12, -22);
    context.closePath();
    context.fill();
    context.stroke();
  } else {
    // Broken right wing: bent down at the kink, tip buried in the dirt.
    context.beginPath();
    context.moveTo(12, -34);
    context.lineTo(58, -30);
    context.lineTo(96, 2);
    context.lineTo(88, 10);
    context.lineTo(50, -20);
    context.lineTo(12, -22);
    context.closePath();
    context.fill();
    context.stroke();
  }
  // Red wingtips. The intact right tip is drawn only while the wing is
  // intact: on a crash the broken wing bends down, and an unconditional tip
  // at the old (118, -40) coordinates would float detached over the river.
  context.fillStyle = PALETTE.planeWingTip;
  context.beginPath();
  context.moveTo(-118, -40 - flex);
  context.lineTo(-112, -26 - flex);
  context.lineTo(-98, -28 - flex * 0.8);
  context.lineTo(-104, -38 - flex * 0.8);
  context.closePath();
  context.fill();
  if (!crashed) {
    context.beginPath();
    context.moveTo(118, -40 + flex);
    context.lineTo(112, -26 + flex);
    context.lineTo(98, -28 + flex * 0.8);
    context.lineTo(104, -38 + flex * 0.8);
    context.closePath();
    context.fill();
  } else {
    // A small red tip at the end of the broken wing instead.
    context.beginPath();
    context.moveTo(96, 2);
    context.lineTo(88, 10);
    context.lineTo(81.7, 5);
    context.lineTo(89.9, -3.2);
    context.closePath();
    context.fill();
  }
  // Wing struts down to the fuselage body.
  context.strokeStyle = '#9aa5b3';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(-10, -20);
  context.lineTo(-62, -30 - flex * 0.5);
  context.moveTo(10, -20);
  context.lineTo(62, -30 + flex * 0.5);
  context.stroke();

  // Fuselage: short and boxy, seen from the tail — the nose is far away and
  // foreshortened, the tail end is near and wide. No windows.
  const body = context.createLinearGradient(0, -22, 0, 36);
  body.addColorStop(0, '#f4f7fa');
  body.addColorStop(0.6, PALETTE.planeBody);
  body.addColorStop(1, '#b9c2cf');
  context.fillStyle = body;
  context.beginPath();
  context.moveTo(-14, -22);
  context.lineTo(14, -22);
  context.lineTo(13, 28);
  context.quadraticCurveTo(12, 36, 0, 36);
  context.quadraticCurveTo(-12, 36, -13, 28);
  context.closePath();
  context.fill();
  context.strokeStyle = OUTLINE;
  context.lineWidth = 2;
  context.stroke();
  // Centre panel line and a red belly stripe at the tail end.
  context.strokeStyle = 'rgba(60, 70, 84, 0.5)';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, -20);
  context.lineTo(0, 16);
  context.stroke();
  context.fillStyle = PALETTE.planeBelly;
  context.beginPath();
  context.moveTo(-13, 16);
  context.lineTo(13, 16);
  context.lineTo(12, 28);
  context.quadraticCurveTo(0, 33, -12, 28);
  context.closePath();
  context.fill();

  // Prop at the far nose: a small faint disc that barely peeks past the wing
  // and the nose cowling — never a big face-on disc. Stopped when crashed.
  if (!crashed && plane.throttle > 0.05) {
    const propAngle = time * 25;
    context.fillStyle = 'rgba(220, 228, 238, 0.22)';
    context.beginPath();
    context.ellipse(0, -38, 12, 13, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(40, 48, 60, 0.55)';
    context.lineWidth = 2;
    for (const a of [propAngle, propAngle + Math.PI]) {
      context.beginPath();
      context.moveTo(0, -38);
      context.lineTo(Math.cos(a) * 12, -38 + Math.sin(a) * 12);
      context.stroke();
    }
    context.fillStyle = PALETTE.planeBelly;
    context.beginPath();
    context.arc(0, -38, 3, 0, Math.PI * 2);
    context.fill();
  }

  // Tail: a tall vertical fin rising up in front of the fuselage, with a red
  // rudder stripe — the part that says "airplane" from behind.
  context.fillStyle = PALETTE.planeWing;
  context.beginPath();
  context.moveTo(-7, 34);
  context.lineTo(-2, -8);
  context.lineTo(2, -8);
  context.lineTo(7, 34);
  context.closePath();
  context.fill();
  context.strokeStyle = OUTLINE;
  context.lineWidth = 1.5;
  context.stroke();
  context.fillStyle = PALETTE.planeBelly;
  context.beginPath();
  context.moveTo(-2.5, 30);
  context.lineTo(-1, -6);
  context.lineTo(1, -6);
  context.lineTo(2.5, 30);
  context.closePath();
  context.fill();
  // Horizontal stabiliser at the near end.
  context.fillStyle = PALETTE.planeWing;
  context.beginPath();
  context.moveTo(-8, 26);
  context.lineTo(-54, 32);
  context.lineTo(-50, 40);
  context.lineTo(-6, 36);
  context.closePath();
  context.fill();
  context.strokeStyle = OUTLINE;
  context.lineWidth = 1.5;
  context.stroke();
  context.beginPath();
  context.moveTo(8, 26);
  context.lineTo(54, 32);
  context.lineTo(50, 40);
  context.lineTo(6, 36);
  context.closePath();
  context.fill();
  context.stroke();

  // Landing gear: fixed bush-plane tundra tires hanging below the fuselage
  // struts — visible on the ground, when slow, or just above the ground.
  // The struts are light with a dark outline, like the wing struts, so the
  // tires visibly attach to the fuselage instead of floating as black
  // donuts on the dark grey asphalt.
  if (!crashed && (plane.phase === 'ground' || plane.speed < 30 || plane.agl < 10)) {
    context.strokeStyle = OUTLINE;
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(-10, 28);
    context.lineTo(-18, 50);
    context.moveTo(10, 28);
    context.lineTo(18, 50);
    context.stroke();
    context.strokeStyle = '#9aa5b3';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(-10, 28);
    context.lineTo(-18, 50);
    context.moveTo(10, 28);
    context.lineTo(18, 50);
    context.stroke();
    context.fillStyle = '#22262e';
    context.beginPath();
    context.arc(-18, 54, 7, 0, Math.PI * 2);
    context.arc(18, 54, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#4a515e';
    context.beginPath();
    context.arc(-18, 54, 3, 0, Math.PI * 2);
    context.arc(18, 54, 3, 0, Math.PI * 2);
    context.fill();
  }

  // Navigation lights: red port, green starboard, white tail strobe blinking.
  if (!crashed) {
    context.fillStyle = '#ff3b30';
    context.beginPath();
    context.arc(-116, -33 - flex, 3.5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#2eff5a';
    context.beginPath();
    context.arc(116, -33 + flex, 3.5, 0, Math.PI * 2);
    context.fill();
    if (Math.floor(time * 1.2) % 2 === 0) {
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(0, 38, 3, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

/** Smoke, fire and debris over the wreck, so a crash reads as a crash. */
export function drawCrashFx(context, plane, time) {
  const px = CX;
  const py = FIELD.height * 0.60 - plane.pitch * 70;
  // A thick rising dark smoke plume, not a few faint puffs.
  for (let i = 0; i < 10; i += 1) {
    const age = ((time * 0.4 + i * 0.55) % 3.5) / 3.5;
    const x = px + Math.sin(i * 2.3) * 26 + age * 22;
    const y = py - age * 150;
    const r = 14 + age * 36;
    context.fillStyle = `rgba(48, 48, 56, ${(1 - age) * 0.75})`;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }
  // Bright flame core at the wreck, flickering — drawn additively so the
  // fire glows over the white fuselage instead of washing out on it.
  const flicker = 0.7 + Math.sin(time * 23) * 0.2 + Math.sin(time * 41) * 0.1;
  context.save();
  context.globalCompositeOperation = 'lighter';
  const glow = context.createRadialGradient(px, py + 4, 2, px, py + 4, 70);
  glow.addColorStop(0, `rgba(255, 220, 130, ${0.95 * flicker})`);
  glow.addColorStop(0.35, `rgba(255, 150, 50, ${0.75 * flicker})`);
  glow.addColorStop(0.7, `rgba(255, 90, 25, ${0.4 * flicker})`);
  glow.addColorStop(1, 'rgba(255, 60, 20, 0)');
  context.fillStyle = glow;
  context.beginPath();
  context.arc(px, py + 4, 70, 0, Math.PI * 2);
  context.fill();
  // Flame tongues licking up from the wreck.
  context.fillStyle = `rgba(255, 180, 60, ${0.9 * flicker})`;
  for (let i = 0; i < 3; i += 1) {
    const fx = px - 16 + i * 16 + Math.sin(time * 17 + i * 2) * 3;
    const fh = 22 + Math.sin(time * 21 + i * 3) * 7;
    context.beginPath();
    context.moveTo(fx - 6, py + 12);
    context.quadraticCurveTo(fx, py + 12 - fh, fx + 6, py + 12);
    context.closePath();
    context.fill();
  }
  context.restore();
  // Debris scattered around the wreck.
  context.fillStyle = '#2a2f38';
  for (let i = 0; i < 7; i += 1) {
    const dx = Math.sin(i * 1.7 + 0.5) * 58;
    const dy = 26 + Math.cos(i * 2.1) * 18;
    context.beginPath();
    context.arc(px + dx, py + dy, 4, 0, Math.PI * 2);
    context.fill();
  }
  // A scorch patch under the wreck.
  context.fillStyle = 'rgba(30, 26, 22, 0.55)';
  context.beginPath();
  context.ellipse(px, py + 26, 52, 12, 0, 0, Math.PI * 2);
  context.fill();
}
