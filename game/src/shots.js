// The screenshot scenes behind ?shot=ring|takeoff|pressure|crash. Each one plays
// the real rules forward from a fresh sortie for a fixed time, steered by a
// simple autopilot — climb for the next ring, bank toward it, mind the throttle
// — so the frame is what a short game really looks like and the same seed
// always gives the same frame. Every scene is live gameplay: no dimmed modal
// hides the aircraft in any of the four shots.

import { STEP } from './config.js';
import { EVENT_CRASH } from './flight.js';
import { SCREEN_OVER, SCREEN_PLAY } from './hud.js';

const PLAY_SECONDS = 26;
const END_LIMIT_SECONDS = 600;
const RING_DISTANCE = 350;

const FOCAL = 720 * 0.95;
const CX = 640;
const HORIZON = 720 * 0.44;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function angleDiff(target, current) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function headingDegrees(heading) {
  const deg = ((heading * 180) / Math.PI) % 360;
  return (deg + 360) % 360;
}

/** The renderer's projection, replicated here so staging can judge a frame by
 *  what it will look like on screen — including the world roll. */
function projectPoint(plane, wx, wy, wz) {
  const h = plane.heading;
  const camX = plane.x - Math.sin(h) * 15;
  const camY = plane.y + 4.6;
  const camZ = plane.z - Math.cos(h) * 15;
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  const rx = Math.cos(h);
  const rz = -Math.sin(h);
  const cp = Math.max(-0.45, Math.min(0.45, plane.pitch * 0.55));
  const dx = wx - camX;
  const dz = wz - camZ;
  const r = dx * rx + dz * rz;
  const u = wy - camY;
  const f = dx * fx + dz * fz;
  if (f < 6) return null;
  let x = CX + (r * FOCAL) / f;
  let y = HORIZON - ((u - f * cp) * FOCAL) / f;
  const roll = -plane.roll * 0.9;
  const cos = Math.cos(roll);
  const sin = Math.sin(roll);
  const px = x - CX;
  const py = y - HORIZON;
  x = CX + px * cos - py * sin;
  y = HORIZON + px * sin + py * cos;
  return { x, y, f };
}

/** True when the cover frame is clean: the ring sits fully inside the frame
 *  and touches no balloon and no distant strip on screen. The bank is kept
 *  gentle (<= ~17 deg): in a hard bank the sun, which sits far from the
 *  roll pivot, swings up and ends up half-cut at the top corner. */
function frameIsClean(plane, rings, terrain, ring) {
  if (Math.abs(plane.roll) > 0.3) return false;
  const rp = projectPoint(plane, ring.x, ring.y, ring.z);
  if (!rp) return false;
  const rr = (ring.radius * FOCAL) / rp.f;
  if (rp.x < 120 || rp.x > 1160 || rp.y < 130 || rp.y > 520) return false;
  for (const o of rings.obstacles()) {
    if (o.kind !== 'balloon') continue;
    if (o.z < plane.z || o.z > plane.z + 600) continue;
    const bp = projectPoint(plane, o.x, o.y, o.z);
    if (!bp) continue;
    const br = (o.radius * FOCAL) / bp.f;
    if (Math.hypot(bp.x - rp.x, bp.y - rp.y) < rr + br + 30) return false;
  }
  for (const strip of terrain.strips) {
    const corners = [
      projectPoint(plane, strip.x - strip.halfWidth, 1, strip.zStart),
      projectPoint(plane, strip.x + strip.halfWidth, 1, strip.zStart),
      projectPoint(plane, strip.x + strip.halfWidth, 1, strip.zEnd),
      projectPoint(plane, strip.x - strip.halfWidth, 1, strip.zEnd),
    ].filter(Boolean);
    if (corners.length < 3) continue;
    const minX = Math.min(...corners.map((c) => c.x)) - 20;
    const maxX = Math.max(...corners.map((c) => c.x)) + 20;
    const minY = Math.min(...corners.map((c) => c.y)) - 20;
    const maxY = Math.max(...corners.map((c) => c.y)) + 20;
    const cx = Math.max(minX, Math.min(rp.x, maxX));
    const cy = Math.max(minY, Math.min(rp.y, maxY));
    if (Math.hypot(cx - rp.x, cy - rp.y) < rr) return false;
  }
  // Veto first: no tower may poke in from a side edge, whichever obstacle
  // sells the frame. The qualifying loop below returns true on the first
  // in-frame balloon or tower, so an edge-cropped tower could ride along
  // unexamined behind a good balloon — exactly what happened in the
  // round-4 cover (tower base.x -17 / top.x 20, frame qualified by the red
  // balloon). Any in-window tower that is at least partly on screen must
  // have both ends comfortably inside the frame.
  for (const o of rings.obstacles()) {
    if (o.kind === 'balloon') continue;
    if (o.z < plane.z || o.z > plane.z + 900) continue;
    const base = projectPoint(plane, o.x, o.y, o.z);
    const top = projectPoint(plane, o.x, o.y + o.height, o.z);
    if (!base || !top) continue;
    const wBase = Math.max(2, (o.radius * 2 * FOCAL) / base.f);
    const wTop = Math.max(1, (o.radius * 0.5 * FOCAL) / top.f);
    const left = Math.min(base.x - wBase / 2, top.x - wTop / 2);
    const right = Math.max(base.x + wBase / 2, top.x + wTop / 2);
    if (right < 0 || left > 1280) continue; // entirely off screen: draws nothing
    if (Math.min(base.x, top.x) < 90 || Math.max(base.x, top.x) > 1190) return false;
  }
  // The cover also needs an obstacle in frame — a balloon or a tower
  // cleanly off to the side of the ring — so it sells "obstacles + rings +
  // valley" at once instead of a bare ring over empty hills. If no attempt
  // finds one, the fallback frame stands (a clean bare cover beats a
  // cluttered one).
  for (const o of rings.obstacles()) {
    if (o.z < plane.z || o.z > plane.z + 900) continue;
    if (o.kind === 'balloon') {
      const bp = projectPoint(plane, o.x, o.y, o.z);
      if (!bp) continue;
      const br = (o.radius * FOCAL) / bp.f;
      if (bp.x < 60 || bp.x > 1220 || bp.y < 100 || bp.y > 560) continue;
      if (Math.hypot(bp.x - rp.x, bp.y - rp.y) < rr + br + 60) continue;
      return true;
    }
    const base = projectPoint(plane, o.x, o.y, o.z);
    const top = projectPoint(plane, o.x, o.y + o.height, o.z);
    if (!base || !top) continue;
    // Both ends of the tower must sit comfortably inside the frame: the
    // old midpoint-only check let a tower whose middle was in-bounds poke
    // out of the left edge as a cropped sliver (round-4 cover, x 0–25).
    if (Math.min(base.x, top.x) < 90 || Math.max(base.x, top.x) > 1190) continue;
    const mx = (base.x + top.x) / 2;
    const my = (base.y + top.y) / 2;
    if (my < 100 || my > 560) continue;
    if (Math.hypot(mx - rp.x, my - rp.y) < rr + 120) continue;
    return true;
  }
  return false;
}

/**
 * The autopilot's command for this step. `careless` never climbs: it holds
 * level flight and lets the rising ground do the rest.
 */
function autopilot(flight, rings, terrain, careless, time) {
  const plane = flight.plane;
  const ctl = { pitch: 0, roll: 0, throttleUp: false, throttleDown: false };

  if (plane.phase === 'ground') {
    ctl.throttleUp = true;
    ctl.pitch = plane.speed > 20 ? 0.9 : 0;
    return ctl;
  }

  const ring = rings.currentRing();
  if (ring) {
    const wantHeading = Math.atan2(ring.x - plane.x, ring.z - plane.z);
    const error = angleDiff(wantHeading, plane.heading);
    ctl.roll = clamp(error * 1.4, -1, 1);
    if (!careless) {
      // Never trade all the speed for a climb: below 30 m/s, nose down and
      // regain speed first, whatever the ring's altitude.
      if (plane.speed < 30) {
        ctl.pitch = -0.4;
      } else {
        // Climb for the ring, but never below the ground ahead.
        const aheadX = plane.x + Math.sin(plane.heading) * 220;
        const aheadZ = plane.z + Math.cos(plane.heading) * 220;
        const safe = terrain.heightAt(aheadX, aheadZ) + 48;
        const wantY = Math.max(ring.y, safe);
        ctl.pitch = clamp((wantY - plane.y) * 0.025 - plane.verticalSpeed * 0.03, -1, 1);
      }
    } else if (time > 120) {
      // A careless pilot that is still flying after two minutes gets tired and sinks.
      ctl.pitch = -0.5;
    }
  }
  // Climbing steeply needs full throttle: hold it up whenever the nose is up
  // or the speed is below the cruise band.
  if (plane.speed < 58 || ctl.pitch > 0.3) ctl.throttleUp = true;
  else if (plane.speed > 66) ctl.throttleDown = true;
  return ctl;
}

/**
 * Set `flight` to the named scene and return the screen to draw over it, the
 * best score to show, and the simulated time for the renderer.
 *
 * ring: a banked turn chasing a gold ring, a balloon and a tower ahead, the
 *   compass showing N/NE — the cover.
 * takeoff: the moment of liftoff, the runway still ahead below.
 * pressure: Storm Ridge, low fuel and a battered airframe, a green refuel ring
 *   ahead in a dark sky.
 * crash: the careless pilot meets the terrain after a respectable run; smoke
 *   and fire, a compact top strip.
 */
export function stageShot(name, flight, rings, terrain) {
  flight.reset();
  const plane = flight.plane;

  if (name === 'takeoff') {
    let time = 0;
    for (let i = 0; i < 60 / STEP; i += 1) {
      time += STEP;
      flight.step(STEP, autopilot(flight, rings, terrain, false, time));
      if (plane.phase === 'flying') break;
    }
    // Climb a beat after liftoff (aim ALT 12–18 FT) so the camera looks down
    // onto the runway instead of grazing it: several receding centreline
    // dashes, white side edges and the threshold markings read, instead of
    // compressing into the horizon. 1.2s overshot to ALT 37 FT; 0.7s lands
    // in the target band.
    for (let i = 0; i < 0.7 / STEP; i += 1) {
      time += STEP;
      flight.step(STEP, autopilot(flight, rings, terrain, false, time));
    }
    return { screen: SCREEN_PLAY, best: 0, time };
  }

  if (name === 'pressure') {
    let time = 0;
    let staged = false;
    // Fly until the storm mission starts, then chase a green refuel ring.
    // The autopilot can still be caught out by a ridge — if it crashes,
    // reset and fly the missions again (up to 3 attempts).
    for (let attempt = 0; attempt < 3 && !staged; attempt += 1) {
      for (let i = 0; i < 400 / STEP; i += 1) {
        time += STEP;
        const events = flight.step(STEP, autopilot(flight, rings, terrain, false, time));
        if (events & EVENT_CRASH) { flight.reset(); break; }
        if (flight.state.missionIndex === 3) break;
        // Staging only, never the shipped game: the shot needs a plane that
        // is still flying when the storm mission starts, so the tank is
        // topped up whenever it runs low on the way there.
        if (plane.fuel < 40) plane.fuel = 80;
      }
      if (flight.state.missionIndex !== 3) continue;
      for (let i = 0; i < 200 / STEP; i += 1) {
        time += STEP;
        const events = flight.step(STEP, autopilot(flight, rings, terrain, false, time));
        if (events & EVENT_CRASH) { flight.reset(); break; }
        if (plane.fuel < 40) plane.fuel = 80;
        const ring = rings.currentRing();
        if (ring && ring.fuel && ring.z - plane.z > 0 && ring.z - plane.z < RING_DISTANCE) {
          // The refuel ring must stand alone: no balloon crowding it.
          const crowded = rings.obstacles().some((o) => o.kind === 'balloon'
            && Math.hypot(o.x - ring.x, o.y - ring.y, o.z - ring.z) < 120);
          if (!crowded) { staged = true; break; }
        }
      }
    }
    plane.fuel = 18;
    plane.damage = 50;
    return { screen: SCREEN_PLAY, best: Math.floor(flight.state.score), time };
  }

  if (name === 'crash') {
    // A respectable run first — 5+ rings, 800+ score — then the careless
    // pilot stops climbing and the terrain ends it. The wreck must lie well
    // away from the river, so no blue beam stabs through it. Up to 4
    // attempts; the last attempt is kept if none is clean.
    let time = 0;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      flight.reset();
      time = 0;
      let competent = true;
      let crashed = false;
      for (let i = 0; i < END_LIMIT_SECONDS / STEP; i += 1) {
        time += STEP;
        const ctl = competent
          ? autopilot(flight, rings, terrain, false, time)
          : autopilot(flight, rings, terrain, true, time);
        const events = flight.step(STEP, ctl);
        if (events & EVENT_CRASH) { crashed = true; break; }
        if (competent && flight.state.ringsPassed >= 5 && flight.state.score >= 800) competent = false;
      }
      if (!crashed) continue;
      if (flight.state.ringsPassed < 5 || flight.state.score < 800) continue;
      const riverDist = Math.abs(plane.x - terrain.riverX(plane.z));
      if (riverDist < 120) continue;
      return { screen: SCREEN_OVER, best: Math.floor(flight.state.score), time };
    }
    // Fallback: one last run with no river check, so the shot is always a
    // real wreck after a respectable run.
    flight.reset();
    time = 0;
    let competent = true;
    for (let i = 0; i < END_LIMIT_SECONDS / STEP; i += 1) {
      time += STEP;
      const ctl = competent
        ? autopilot(flight, rings, terrain, false, time)
        : autopilot(flight, rings, terrain, true, time);
      const events = flight.step(STEP, ctl);
      if (events & EVENT_CRASH) break;
      if (competent && flight.state.ringsPassed >= 5 && flight.state.score >= 800) competent = false;
    }
    return { screen: SCREEN_OVER, best: Math.floor(flight.state.score), time };
  }

  // 'ring' (and any other name): a banked turn on a ring, compass near N/NE.
  // The plane can run out of fuel or clip a ridge while hunting the frame,
  // so a crashed attempt is reset and flown again (up to 4 attempts).
  let time = 0;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let found = false;
    for (let i = 0; i < 150 / STEP; i += 1) {
      time += STEP;
      const events = flight.step(STEP, autopilot(flight, rings, terrain, false, time));
      if (events & EVENT_CRASH) { flight.reset(); break; }
      const ring = rings.currentRing();
      const deg = headingDegrees(plane.heading);
      const nearNorth = deg < 75 || deg > 285;
      if (ring && !ring.fuel && plane.phase === 'flying' && ring.z - plane.z > 0 && ring.z - plane.z < RING_DISTANCE + 50
        && Math.abs(plane.roll) > 0.25 && nearNorth) {
        const ahead = rings.obstacles().some((o) => o.z > plane.z && o.z < plane.z + 900);
        const balloon = rings.obstacles().some((o) => o.kind === 'balloon' && o.z > plane.z && o.z < plane.z + 500);
        if (ahead && balloon && frameIsClean(plane, rings, terrain, ring)) { found = true; break; }
      }
    }
    if (found) break;
    // No early exit here: a flying plane at the end of an attempt is a usable
    // cover, but the next attempt may still find the ideal banked frame, so
    // all four attempts run before the fallback state is kept.
  }
  // Never hand the cover shot a wreck or a parked plane: if no attempt ended
  // in flight, take off and fly a short leg instead.
  if (plane.phase !== 'flying') {
    for (let i = 0; i < 60 / STEP; i += 1) {
      time += STEP;
      flight.step(STEP, autopilot(flight, rings, terrain, false, time));
      if (plane.phase === 'flying') break;
    }
    for (let i = 0; i < 0.15 / STEP; i += 1) {
      time += STEP;
      flight.step(STEP, autopilot(flight, rings, terrain, false, time));
    }
  }
  // Staging only: the cover should show a plane in fighting shape, not one
  // that has been bounced through three obstacle fields on the way to the
  // frame. The shipped game keeps whatever damage and fuel the flight earned.
  plane.damage = 25;
  plane.fuel = 60;
  return { screen: SCREEN_PLAY, best: Math.floor(flight.state.score), time };
}
