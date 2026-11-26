// The HUD and the instruments: a compass tape and the flight numbers across the
// top, a lit instrument panel along the bottom, warnings in the middle of the
// screen, and compact title / paused / game-over cards that never dim the whole
// scene. Drawing only. Instruments are built to look flown: bezels, screws,
// glass, tick marks and a needle that trembles — not flat web progress arcs.

import { FIELD, FONT, FUEL, PALETTE, PANEL_HEIGHT, PLANE, THROTTLE_UI } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const CARD_WIDTH = 640;

function headingDegrees(heading) {
  const deg = ((heading * 180) / Math.PI) % 360;
  return Math.round((deg + 360) % 360);
}

function compassLabel(deg) {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return names[Math.round(deg / 45) % 8];
}

function wrapDeg(d) {
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export function createHud(canvas, terrain, rings) {
  const context = canvas.getContext('2d');
  const fonts = new Map();

  function text(value, x, y, size, color, align = 'left', baseline = 'alphabetic') {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = baseline;
    context.fillText(value, x, y);
  }

  /** Compass tape: ticks locked to fixed world multiples of 15°/45°, scrolling
   *  smoothly as the heading changes; labels stay inside the box. */
  function drawCompass(heading) {
    const deg = headingDegrees(heading);
    const cx = FIELD.width / 2;
    context.fillStyle = 'rgba(10, 16, 28, 0.55)';
    context.fillRect(cx - 190, 8, 380, 38);
    context.strokeStyle = PALETTE.panelEdge;
    context.strokeRect(cx - 190, 8, 380, 38);
    const pxPerDeg = 2.0;
    const first = Math.floor((deg - 90) / 15) * 15;
    for (let d = first; d <= deg + 90; d += 15) {
      const x = cx + wrapDeg(d - deg) * pxPerDeg;
      if (x < cx - 190 || x > cx + 190) continue;
      const major = ((d % 45) + 45) % 45 === 0;
      context.strokeStyle = major ? PALETTE.text : PALETTE.muted;
      context.lineWidth = major ? 2 : 1;
      context.beginPath();
      context.moveTo(x, major ? 14 : 16);
      context.lineTo(x, major ? 28 : 26);
      context.stroke();
      if (major && Math.abs(x - cx) < 165) {
        text(compassLabel(((d % 360) + 360) % 360), x, 42, 13, PALETTE.text, 'center');
      }
    }
    // The lubber line and the digital heading.
    context.fillStyle = PALETTE.ring;
    context.beginPath();
    context.moveTo(cx - 7, 8);
    context.lineTo(cx + 7, 8);
    context.lineTo(cx, 18);
    context.closePath();
    context.fill();
    text(String(deg).padStart(3, '0'), cx, 64, 17, PALETTE.text, 'center');
  }

  /** Top bar: a dark scrim so the labels never bleed into the sky, the compass
   *  in the middle, and score and rings on the right. Altitude, speed and
   *  heading live only in the bottom dials and the compass — nowhere twice. */
  function drawTopBar(flight, best) {
    const scrim = context.createLinearGradient(0, 0, 0, 116);
    scrim.addColorStop(0, 'rgba(10, 16, 28, 0.62)');
    scrim.addColorStop(0.75, 'rgba(10, 16, 28, 0.34)');
    scrim.addColorStop(1, 'rgba(10, 16, 28, 0.14)');
    context.fillStyle = scrim;
    context.fillRect(0, 0, FIELD.width, 116);
    drawCompass(flight.plane.heading);
    text('SCORE', FIELD.width - 24, 26, 14, PALETTE.muted, 'right');
    text(String(Math.floor(flight.score)), FIELD.width - 24, 52, 26, PALETTE.text, 'right');
    text('RINGS', FIELD.width - 150, 26, 14, PALETTE.muted, 'right');
    text(String(flight.ringsPassed), FIELD.width - 150, 52, 26, PALETTE.text, 'right');
    text(`BEST ${Math.floor(best)}`, FIELD.width - 24, 76, 14, PALETTE.muted, 'right');
  }

  function drawMissionLine(mission, missionRings, extra) {
    let line = `${mission.name} — ${missionRings}/${mission.goal} rings · ${mission.blurb}`;
    if (extra && extra.awaitingLanding) {
      line = `${mission.name} — LAND ON THE NEXT STRIP`;
      text(line, FIELD.width / 2, 88, 16, PALETTE.ring, 'center');
      return;
    }
    if (extra && extra.stripDist !== null && extra.stripDist !== undefined) {
      const d = extra.stripDist;
      line += ` · NEXT STRIP ${d >= 1000 ? `${(d / 1000).toFixed(1)}km` : `${Math.round(d)}m`}`;
    }
    text(line, FIELD.width / 2, 88, 16, PALETTE.text, 'center');
  }

  /** Bezel, screws and glass: the shared "flown instrument" dressing. */
  function dressInstrument(cx, cy, radius, time) {
    context.strokeStyle = '#3a4557';
    context.lineWidth = 5;
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = '#5a6678';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(cx, cy, radius - 3, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = '#6b7787';
    for (const a of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
      context.beginPath();
      context.arc(cx + Math.cos(a) * (radius - 4), cy + Math.sin(a) * (radius - 4), 1.6, 0, Math.PI * 2);
      context.fill();
    }
    // Glass reflection, top-left.
    context.strokeStyle = 'rgba(255,255,255,0.10)';
    context.lineWidth = 6;
    context.beginPath();
    context.arc(cx, cy, radius - 8, Math.PI * 1.05, Math.PI * 1.35);
    context.stroke();
    void time;
  }

  /** Artificial horizon: a lit disc that rolls with the plane and slides with pitch. */
  function drawAttitude(plane, cx, cy, radius, time) {
    context.save();
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.clip();
    context.translate(cx, cy);
    context.rotate(-plane.roll);
    context.translate(0, plane.pitch * radius * 1.6);
    context.fillStyle = '#4a90d9';
    context.fillRect(-radius, -radius * 2, radius * 2, radius * 2);
    context.fillStyle = '#7a5a34';
    context.fillRect(-radius, 0, radius * 2, radius * 2);
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-radius, 0);
    context.lineTo(radius, 0);
    context.stroke();
    // Pitch ladder.
    context.lineWidth = 1;
    for (const p of [-0.3, -0.15, 0.15, 0.3]) {
      const y = -p * radius * 1.6;
      context.beginPath();
      context.moveTo(-radius * 0.3, y);
      context.lineTo(radius * 0.3, y);
      context.stroke();
    }
    context.restore();
    // Fixed wings and the flown-instrument dressing.
    context.strokeStyle = PALETTE.ring;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(cx - radius * 0.55, cy);
    context.lineTo(cx - radius * 0.15, cy);
    context.moveTo(cx + radius * 0.15, cy);
    context.lineTo(cx + radius * 0.55, cy);
    context.stroke();
    dressInstrument(cx, cy, radius, time);
    text('ATT', cx, cy + radius + 15, 11, PALETTE.muted, 'center');
  }

  /** A dial with a needle: value maps across [min, max] over a 270° arc, zero
   *  at the top for a centred gauge like V/S. opts.redline marks a red arc. */
  function drawGauge(cx, cy, radius, label, value, min, max, unit, color, time, opts = {}) {
    context.fillStyle = PALETTE.gauge;
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fill();
    const start = Math.PI * 0.75;
    const end = Math.PI * 2.25;
    const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));
    // Tick marks around the arc.
    context.strokeStyle = PALETTE.muted;
    context.lineWidth = 1;
    for (let i = 0; i <= 8; i += 1) {
      const a = start + (end - start) * (i / 8);
      context.beginPath();
      context.moveTo(cx + Math.cos(a) * (radius - 8), cy + Math.sin(a) * (radius - 8));
      context.lineTo(cx + Math.cos(a) * (radius - 4), cy + Math.sin(a) * (radius - 4));
      context.stroke();
    }
    // Redline arc.
    if (opts.redline !== undefined) {
      const rFrac = Math.max(0, Math.min(1, (opts.redline - min) / (max - min)));
      context.strokeStyle = PALETTE.gaugeRed;
      context.lineWidth = 4;
      context.beginPath();
      context.arc(cx, cy, radius - 6, start + (end - start) * rFrac, end);
      context.stroke();
    }
    // The needle, trembling a little like a real one.
    const angle = start + (end - start) * frac + Math.sin(time * 13 + cx * 0.7) * 0.006;
    context.strokeStyle = color;
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(cx, cy);
    context.lineTo(cx + Math.cos(angle) * (radius - 10), cy + Math.sin(angle) * (radius - 10));
    context.stroke();
    context.fillStyle = color;
    context.beginPath();
    context.arc(cx, cy, 3.5, 0, Math.PI * 2);
    context.fill();
    dressInstrument(cx, cy, radius, time);
    // The digital readout lives in a small dark recessed LCD box at the bottom
    // of the dial, like a real Cessna/G5 gauge — the needle is drawn first and
    // the opaque box covers it, so it can never cross a digit or a label.
    context.fillStyle = '#0a0f18';
    context.beginPath();
    context.roundRect(cx - 24, cy + 4, 48, 28, 4);
    context.fill();
    context.strokeStyle = '#2b3547';
    context.lineWidth = 1;
    context.stroke();
    text(label, cx, cy + 14, 9, PALETTE.muted, 'center');
    text(`${Math.round(value)}`, cx, cy + 28, 16, PALETTE.text, 'center');
    text(unit, cx, cy + radius + 15, 11, PALETTE.muted, 'center');
  }

  /** The on-screen throttle lever: drag it with mouse or touch. The label
   *  sits at y - 7, inside the dark panel with clear margin above and below
   *  — never sliced by the panel's top border. */
  function drawThrottle(plane) {
    const r = THROTTLE_UI;
    text('THR', r.x + r.w / 2, r.y - 7, 11, PALETTE.muted, 'center');
    context.fillStyle = PALETTE.gauge;
    context.fillRect(r.x, r.y, r.w, r.h);
    context.strokeStyle = PALETTE.panelEdge;
    context.strokeRect(r.x, r.y, r.w, r.h);
    const h = r.h * plane.throttle;
    context.fillStyle = plane.fuel <= 0 ? PALETTE.gaugeRed : PALETTE.gaugeLit;
    context.fillRect(r.x + 3, r.y + r.h - h, r.w - 6, Math.max(0, h - 3));
    context.fillStyle = PALETTE.text;
    context.fillRect(r.x - 4, r.y + r.h - h - 3, r.w + 8, 6);
    text(`${Math.round(plane.throttle * 100)}%`, r.x + r.w / 2, r.y + r.h + 14, 12, PALETTE.text, 'center');
  }

  /** Damage: a bar that is never green once the airframe is hurt. Same
   *  height and label position as the throttle, so all three bars align. */
  function drawDamage(plane) {
    const x = 700;
    const y = THROTTLE_UI.y;
    text('DMG', x + 9, y - 7, 11, PALETTE.muted, 'center');
    context.fillStyle = PALETTE.gauge;
    context.fillRect(x, y, 18, 44);
    context.strokeStyle = PALETTE.panelEdge;
    context.strokeRect(x, y, 18, 44);
    const h = 44 * (plane.damage / 100);
    context.fillStyle = plane.damage <= 0 ? PALETTE.gauge
      : plane.damage > 66 ? PALETTE.gaugeRed
      : plane.damage > 33 ? '#ff7a1a' : PALETTE.gaugeAmber;
    context.fillRect(x, y + 44 - h, 18, h);
    text(`${Math.round(plane.damage)}%`, x + 9, y + 44 + 14, 12, PALETTE.text, 'center');
  }

  /** Vertical fuel gauge beside the mini-map. */
  function drawFuelGauge(plane) {
    const x = 1040;
    const y = THROTTLE_UI.y;
    text('FUEL', x + 7, y - 7, 11, PALETTE.muted, 'center');
    context.fillStyle = PALETTE.gauge;
    context.fillRect(x, y, 14, 44);
    context.strokeStyle = PALETTE.panelEdge;
    context.strokeRect(x, y, 14, 44);
    const h = 44 * (plane.fuel / 100);
    const color = plane.fuel < FUEL.lowWarning ? PALETTE.gaugeRed : plane.fuel < 50 ? PALETTE.gaugeAmber : PALETTE.gaugeLit;
    context.fillStyle = color;
    context.fillRect(x, y + 44 - h, 14, h);
    text(`${Math.round(plane.fuel)}%`, x + 7, y + 44 + 14, 12, color, 'center');
  }

  /** Mini-map: the valley from above, north up — river, strips, town, the next
   *  ring and the plane itself. The runway radar the top bar never had.
   *  Everything inside is clipped to the MAP box: no grey bar or blue river
   *  line may ever escape it. */
  function drawMiniMap(flight) {
    const plane = flight.plane;
    const x = 1072;
    const y = FIELD.height - PANEL_HEIGHT + 8;
    const w = 184;
    const h = 84;
    const scale = 14; // metres per pixel
    context.fillStyle = '#0d1420';
    context.fillRect(x, y, w, h);
    context.save();
    context.beginPath();
    context.rect(x, y, w, h);
    context.clip();
    const mx = (wx) => x + w / 2 + (wx - plane.x) / scale;
    const my = (wz) => y + h / 2 - (wz - plane.z) / scale;
    // River.
    context.strokeStyle = PALETTE.river;
    context.lineWidth = 2;
    context.beginPath();
    for (let z = plane.z - 600; z <= plane.z + 1300; z += 100) {
      const px = mx(terrain.riverX(z));
      const py = my(z);
      if (z === plane.z - 600) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.stroke();
    // Strips.
    context.fillStyle = '#8a8f98';
    for (const strip of terrain.strips) {
      const sx = mx(strip.x - strip.halfWidth);
      const sy = my(strip.zEnd);
      const sw = (strip.halfWidth * 2) / scale;
      const sh = (strip.zEnd - strip.zStart) / scale;
      context.fillRect(sx, sy, Math.max(2, sw), Math.max(2, sh));
    }
    // Town.
    context.fillStyle = '#b5533c';
    for (const house of terrain.houses) {
      const px = mx(house.x);
      const py = my(house.z);
      if (px < x || px > x + w || py < y || py > y + h) continue;
      context.fillRect(px - 1, py - 1, 2, 2);
    }
    // Next ring.
    const ring = rings.currentRing();
    if (ring) {
      const px = mx(ring.x);
      const py = my(ring.z);
      if (px >= x && px <= x + w && py >= y && py <= y + h) {
        context.fillStyle = ring.fuel ? PALETTE.ringFuel : PALETTE.ring;
        context.beginPath();
        context.arc(px, py, 3, 0, Math.PI * 2);
        context.fill();
      }
    }
    // The plane, pointing along its heading.
    context.save();
    context.translate(x + w / 2, y + h / 2);
    context.rotate(plane.heading);
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.moveTo(0, -6);
    context.lineTo(4, 5);
    context.lineTo(-4, 5);
    context.closePath();
    context.fill();
    context.restore();
    context.restore(); // end of the MAP-box clip
    context.strokeStyle = PALETTE.panelEdge;
    context.strokeRect(x, y, w, h);
    text('MAP', x + 5, y + 11, 10, PALETTE.muted);
  }

  function drawPanel(flight, time) {
    const plane = flight.plane;
    const y0 = FIELD.height - PANEL_HEIGHT;
    context.fillStyle = PALETTE.panel;
    context.fillRect(0, y0, FIELD.width, PANEL_HEIGHT);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(0, y0, FIELD.width, 2);
    const cy = y0 + 46;
    drawAttitude(plane, 90, cy, 32, time);
    drawGauge(230, cy, 32, 'ALT', Math.max(0, plane.y * 3.281), 0, 3000, 'FT', '#4fc3f7', time);
    drawGauge(360, cy, 32, 'SPD', plane.speed * 1.944, 0, 300, 'KT', PALETTE.gaugeLit, time, { redline: 250 });
    // V/S is zero-centred: descents read below zero instead of clamping to 0.
    drawGauge(490, cy, 32, 'V/S', plane.verticalSpeed * 196, -3000, 3000, 'FPM', '#c9a7ff', time);
    drawThrottle(plane);
    drawDamage(plane);
    // Centre readout: mission and level.
    text(`LEVEL ${flight.level}`, 790, y0 + 30, 15, PALETTE.text);
    text(`LANDINGS ${flight.landings}`, 790, y0 + 54, 15, PALETTE.muted);
    text(`DIST ${Math.round(flight.distance)}m`, 790, y0 + 78, 15, PALETTE.muted);
    drawFuelGauge(plane);
    drawMiniMap(flight);
  }

  function drawWarnings(flight, time) {
    const plane = flight.plane;
    let warning = '';
    if (plane.phase === 'flying' && plane.speed < PLANE.stallSpeed && plane.speed > 5) warning = 'STALL — NOSE DOWN, THROTTLE UP';
    else if (plane.fuel <= 0 && plane.phase === 'flying') warning = 'OUT OF FUEL — GLIDE TO THE RUNWAY';
    if (warning) {
      text(warning, FIELD.width / 2, 150, 26, PALETTE.warn, 'center');
    }
    void time;
  }

  /** A crisp LOW FUEL warning pill right below the mission line, so a low
   *  tank is impossible to miss. Amber above 15%, red below it. */
  function drawLowFuelPill(flight) {
    const plane = flight.plane;
    if (plane.phase !== 'flying' || plane.fuel >= FUEL.lowWarning) return;
    const label = `LOW FUEL · ${Math.round(plane.fuel)}% — FIND A GREEN RING`;
    context.font = `bold 15px ${FONT}`;
    const w = context.measureText(label).width + 24;
    const h = 26;
    const x = FIELD.width / 2 - w / 2;
    const y = 100;
    context.fillStyle = plane.fuel < 15 ? PALETTE.gaugeRed : PALETTE.gaugeAmber;
    context.beginPath();
    context.roundRect(x, y, w, h, 13);
    context.fill();
    context.fillStyle = plane.fuel < 15 ? '#ffffff' : '#1a1206';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, FIELD.width / 2, y + h / 2 + 1);
  }

  function drawBanner(message, alpha) {
    if (!message) return;
    context.globalAlpha = Math.max(0, Math.min(1, alpha));
    // A dark pill behind the banner text, so +500 never washes out over a
    // white cloud.
    context.font = `30px ${FONT}`;
    const w = context.measureText(message.text).width + 28;
    const h = 42;
    const x = FIELD.width / 2 - w / 2;
    const y = 190 - 34;
    context.fillStyle = 'rgba(10, 16, 28, 0.55)';
    context.beginPath();
    context.roundRect(x, y, w, h, 21);
    context.fill();
    text(message.text, FIELD.width / 2, 190, 30, message.color, 'center');
    context.globalAlpha = 1;
  }

  /** A compact card that never dims the scene behind it. */
  function drawCard(cx, y, width, height, alpha = 0.94) {
    const x = cx - width / 2;
    context.globalAlpha = alpha;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.globalAlpha = 1;
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    return x;
  }

  function drawTitle(flight, best) {
    const lines = [
      'A bush plane, a river valley, and a line of rings.',
      'Take off from the runway, thread the rings, mind the fuel.',
      'Green rings refuel. Balloons and towers do not forgive.',
      `Best score: ${Math.floor(best)}`,
      'Arrows / WASD pitch and roll · Shift throttle up · Q throttle down',
      'Drag the throttle lever or hold the mouse to steer · P pause · M mute',
    ];
    const height = 150 + lines.length * 32 + 76;
    const y = (FIELD.height - height) / 2 - 20;
    drawCard(FIELD.width / 2, y, CARD_WIDTH, height);
    text('ALBATROSS RUN', FIELD.width / 2, y + 78, 48, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + 150 + index * 32, 22, PALETTE.muted, 'center');
    }
    text('Press Space or click to fly', FIELD.width / 2, y + height - 40, 24, PALETTE.ring, 'center');
  }

  function drawPaused() {
    const y = (FIELD.height - 150) / 2;
    drawCard(FIELD.width / 2, y, 420, 150);
    text('Paused', FIELD.width / 2, y + 70, 40, PALETTE.text, 'center');
    text('Press P or Space to resume', FIELD.width / 2, y + 115, 20, PALETTE.ring, 'center');
  }

  function drawOver(flight, best) {
    const causeText = {
      terrain: 'You met the terrain.',
      hillside: 'You ran off the runway into the hillside.',
      obstacle: 'The airframe gave out after one hit too many.',
      fuel: 'Out of fuel — the glide ran out of sky.',
    }[flight.crashCause] || 'The sortie is over.';
    // A compact strip at the top: the crash scene stays visible behind it.
    const width = 660;
    const height = 64;
    const y = 110;
    drawCard(FIELD.width / 2, y, width, height);
    text(`SORTIE OVER · Score ${Math.floor(flight.score)} · Rings ${flight.ringsPassed} · Best ${Math.floor(best)}`, FIELD.width / 2, y + 28, 20, PALETTE.text, 'center');
    text(`${causeText} — Press Space or click to fly again`, FIELD.width / 2, y + 52, 15, PALETTE.muted, 'center');
  }

  /** Paint the HUD and panels over a rendered frame. extra: { awaitingLanding,
   *  stripDist } — the landing mission's state and the next strip's distance. */
  function draw(flight, screen, best, mission, banner, time, extra) {
    context.textBaseline = 'alphabetic';
    if (screen === SCREEN_TITLE) {
      drawTitle(flight, best);
      return;
    }
    drawTopBar(flight, best);
    drawMissionLine(mission, flight.missionRings, extra);
    drawLowFuelPill(flight);
    drawWarnings(flight, time);
    drawBanner(banner, banner ? banner.alpha : 0);
    drawPanel(flight, time);
    if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(flight, best);
  }

  return { draw };
}
