// The plane and the rules of flying it: throttle, pitch, roll, lift, stall, fuel,
// damage, takeoff, landing and crashing. No drawing and no browser in here —
// step() advances one fixed step and returns what happened as bit flags, so the
// caller can react (and play sounds) without the flight model knowing about
// screens. The plane flies over terrain supplied by terrain.js and through rings
// supplied by rings.js.

import { DAMAGE, FUEL, LEVEL, PLANE, SCORE } from './config.js';

export const EVENT_TAKEOFF = 1;
export const EVENT_LAND = 2;
export const EVENT_RING = 4;
export const EVENT_REFUEL_RING = 8;
export const EVENT_HIT = 16;
export const EVENT_CRASH = 32;
export const EVENT_MISSION = 64;
export const EVENT_FUEL_EMPTY = 128;
export const EVENT_FUEL_LOW = 256;

export const PHASE_GROUND = 'ground';
export const PHASE_FLYING = 'flying';
export const PHASE_CRASHED = 'crashed';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createFlight(terrain, rings) {
  const plane = {
    x: 0, y: 0, z: 0,
    heading: 0, pitch: 0, roll: 0,
    speed: 0, verticalSpeed: 0, throttle: 0,
    fuel: FUEL.start, damage: 0,
    phase: PHASE_GROUND,
    invulnerable: 0,
    airTime: 0,
    /** Metres above the ground right now (for gear and staging). */
    agl: 0,
    /** A brief upward push after skimming the ground at speed. */
    bounce: 0,
  };
  const state = {
    plane,
    score: 0,
    ringsPassed: 0,
    missionIndex: 0,
    missionRings: 0,
    level: 1,
    elapsed: 0,
    distance: 0,
    landings: 0,
    lastLandingAt: -100,
    lastLandingBonus: 0,
    crashCause: '',
    fuelEmptyAnnounced: false,
    fuelLowAnnounced: false,
  };

  function reset() {
    plane.x = 0;
    plane.y = terrain.heightAt(0, 0);
    plane.z = 0;
    plane.heading = 0;
    plane.pitch = 0;
    plane.roll = 0;
    plane.speed = 0;
    plane.verticalSpeed = 0;
    plane.throttle = 0;
    plane.fuel = FUEL.start;
    plane.damage = 0;
    plane.phase = PHASE_GROUND;
    plane.invulnerable = 0;
    plane.airTime = 0;
    plane.agl = 0;
    plane.bounce = 0;
    state.score = 0;
    state.ringsPassed = 0;
    state.missionIndex = 0;
    state.missionRings = 0;
    state.level = 1;
    state.elapsed = 0;
    state.distance = 0;
    state.landings = 0;
    state.lastLandingAt = -100;
    state.crashCause = '';
    state.fuelEmptyAnnounced = false;
    state.fuelLowAnnounced = false;
    rings.reset();
  }

  function crash(cause) {
    if (plane.phase === PHASE_CRASHED) return EVENT_CRASH;
    plane.phase = PHASE_CRASHED;
    plane.damage = 100;
    // A wreck stops dead: no speed, no throttle, no climb — the instruments
    // must agree with the crash instead of reading a live flight.
    plane.speed = 0;
    plane.throttle = 0;
    plane.verticalSpeed = 0;
    // Wing-down at ~35° with the nose buried: the wrecked attitude.
    plane.roll = 0.6;
    plane.pitch = -0.08;
    state.crashCause = cause;
    return EVENT_CRASH;
  }

  /**
   * One fixed step. ctl: { pitch: -1..1 (up positive), roll: -1..1 (right
   * positive), throttleUp, throttleDown, throttleSet } — held keys, the mouse
   * and the on-screen throttle lever, already combined by the input layer.
   * throttleSet (0..1) is an absolute lever position and wins over the keys.
   */
  function step(dt, ctl) {
    let events = 0;
    if (plane.phase === PHASE_CRASHED) return 0;
    state.elapsed += dt;
    state.level = Math.min(LEVEL.max, 1 + Math.floor(state.ringsPassed / LEVEL.ringsPerLevel));
    if (plane.invulnerable > 0) plane.invulnerable = Math.max(0, plane.invulnerable - dt);

    // Throttle: the lever moves while the key is held, and stays where it is left.
    // A dragged on-screen lever sets it outright.
    if (ctl.throttleSet !== undefined && ctl.throttleSet !== null) {
      plane.throttle = clamp(ctl.throttleSet, 0, 1);
    } else {
      if (ctl.throttleUp) plane.throttle = Math.min(1, plane.throttle + 0.9 * dt);
      if (ctl.throttleDown) plane.throttle = Math.max(0, plane.throttle - 0.9 * dt);
    }

    const hasFuel = plane.fuel > 0;
    const thrust = hasFuel ? plane.throttle : 0;
    const maxSpeed = Math.min(
      PLANE.maxSpeedCap,
      PLANE.maxSpeed + PLANE.maxSpeedPerLevel * (state.level - 1),
    );
    const targetSpeed = thrust * maxSpeed;
    plane.speed += (targetSpeed - plane.speed) * PLANE.accelRate * dt;
    // Climbing bleeds speed, diving adds it back.
    plane.speed -= Math.sin(plane.pitch) * PLANE.climbDrag * dt;
    // A sustained steep climb runs out of speed and stalls — no climbing forever.
    if (plane.pitch > PLANE.steepClimbPitch) {
      plane.speed -= (plane.pitch - PLANE.steepClimbPitch) * PLANE.steepClimbDrag * dt;
    }
    if (plane.phase === PHASE_GROUND && plane.throttle < 0.05) {
      plane.speed = Math.max(0, plane.speed - 14 * dt);
    }
    plane.speed = Math.max(0, plane.speed);

    // Pitch and roll ease toward what the pilot commands.
    const targetPitch = ctl.pitch * PLANE.maxPitch;
    const targetRoll = ctl.roll * PLANE.maxRoll;
    plane.pitch += (targetPitch - plane.pitch) * PLANE.pitchEase * dt;
    plane.roll += (targetRoll - plane.roll) * PLANE.rollEase * dt;

    // A banked plane turns; the faster it flies, the harder it turns.
    const authority = clamp(plane.speed / 30, 0, 1);
    plane.heading += plane.roll * PLANE.turnRate * authority * dt;

    // Lift: the wings fly above stall speed and quit below it.
    const lift = clamp((plane.speed - 6) / (PLANE.stallSpeed - 6), 0, 1);
    let vy = plane.speed * Math.sin(plane.pitch) * lift;
    if (plane.speed < PLANE.stallSpeed) vy -= (PLANE.stallSpeed - plane.speed) * PLANE.stallSink;
    vy += plane.bounce;
    plane.bounce *= Math.max(0, 1 - 2.5 * dt);
    // A bush plane climbs ~2400 FPM at best: the vertical speed is capped, so the
    // V/S dial never reads a jet's numbers.
    plane.verticalSpeed = clamp(vy, -PLANE.maxSink, PLANE.maxClimb);

    const sinH = Math.sin(plane.heading);
    const cosH = Math.cos(plane.heading);
    const prevZ = plane.z;
    plane.x += sinH * plane.speed * dt;
    plane.z += cosH * plane.speed * dt;
    // A storm mission's crosswind pushes the plane sideways while it flies.
    const wind = rings.currentMission().wind || 0;
    if (plane.phase === PHASE_FLYING && wind !== 0) plane.x += wind * dt;

    if (plane.phase === PHASE_GROUND) {
      plane.y = terrain.heightAt(plane.x, plane.z);
      // Rolling off a strip into rising ground ends the sortie.
      if (!terrain.onRunway(plane.x, plane.z) && plane.speed > 20) {
        const ahead = terrain.heightAt(
          plane.x + sinH * plane.speed * dt * 3,
          plane.z + cosH * plane.speed * dt * 3,
        );
        if (ahead > plane.y + 2.5) return crash('hillside');
      }
      // Parked on a strip, the crew refuels the plane.
      if (terrain.onRunway(plane.x, plane.z) && plane.speed < 6) {
        plane.fuel = Math.min(100, plane.fuel + FUEL.runwayRefuel * dt);
      }
      // Rotate: fast enough, nose up, and the wings take the weight.
      if (plane.speed > PLANE.rotateSpeed && plane.pitch > 0.12) {
        plane.phase = PHASE_FLYING;
        events |= EVENT_TAKEOFF;
      }
    } else {
      plane.y += plane.verticalSpeed * dt;
      plane.airTime += dt;
      const ground = terrain.heightAt(plane.x, plane.z);
      // A touchdown only counts while the plane is coming down: right after
      // rotation it is still climbing through the 0.4 m band, and treating that
      // as a touchdown would land it again on the very next step — and crash it
      // once the speed passes the landing window.
      if (plane.y <= ground + 0.4 && plane.verticalSpeed <= 0) {
        const gentle = plane.verticalSpeed > -PLANE.maxLandingSink
          && Math.abs(plane.roll) < PLANE.maxLandingRoll
          && plane.speed >= PLANE.landingSpeedMin
          && plane.speed <= PLANE.landingSpeedMax;
        const onStrip = terrain.onRunway(plane.x, plane.z);
        if (gentle && onStrip) {
          // A real touchdown on a strip: wheels on the runway, and it only
          // counts as a landing when the plane actually flew somewhere.
          plane.phase = PHASE_GROUND;
          plane.y = ground;
          plane.verticalSpeed = 0;
          if (plane.airTime > 3 && state.elapsed - state.lastLandingAt > 5) {
            state.landings += 1;
            state.lastLandingAt = state.elapsed;
          }
          events |= EVENT_LAND;
          state.lastLandingBonus = plane.airTime > 5 ? SCORE.landingBonus : 0;
          if (state.lastLandingBonus > 0) state.score += state.lastLandingBonus;
          plane.airTime = 0;
        } else if (gentle) {
          // A soft bush landing on the grass: the plane stops, no bonus, no
          // refuel — only a strip landing counts, and the pilot can take off
          // again from here.
          plane.phase = PHASE_GROUND;
          plane.y = ground;
          plane.verticalSpeed = 0;
          plane.airTime = 0;
        } else if (plane.verticalSpeed > -PLANE.maxLandingSink && plane.speed <= PLANE.landingSpeedMax) {
          // Fast and shallow: the plane skims the grass and bounces back up
          // instead of counting a landing every time it kisses the ground.
          plane.y = ground + 1.5;
          plane.bounce = 5;
        } else {
          return crash(hasFuel ? 'terrain' : 'fuel');
        }
      } else if (plane.y < ground - 0.5) {
        // Climbing straight into a hillside that rose faster than the plane:
        // inside the hill, whatever the vertical speed.
        return crash(hasFuel ? 'terrain' : 'fuel');
      }
    }

    // Height above the ground, for the gear and for screenshot staging.
    plane.agl = Math.max(0, plane.y - terrain.heightAt(plane.x, plane.z));

    // Fuel burns with the throttle; empty tanks mean a glider.
    if (plane.speed > 0.5 || plane.throttle > 0) {
      plane.fuel -= (FUEL.drainIdle + (FUEL.drainFull - FUEL.drainIdle) * thrust) * dt;
    }
    if (plane.fuel <= 0) {
      plane.fuel = 0;
      if (!state.fuelEmptyAnnounced) {
        state.fuelEmptyAnnounced = true;
        events |= EVENT_FUEL_EMPTY;
      }
    } else if (plane.fuel < FUEL.lowWarning && !state.fuelLowAnnounced) {
      state.fuelLowAnnounced = true;
      events |= EVENT_FUEL_LOW;
    } else if (plane.fuel >= FUEL.lowWarning) {
      state.fuelLowAnnounced = false;
    }

    // Rings and obstacles live in rings.js; it reports passes, misses and hits.
    const ringEvents = rings.update(state, plane, prevZ, dt);
    events |= ringEvents;

    if (ringEvents & EVENT_HIT) {
      plane.damage += DAMAGE.obstacleHit;
      plane.speed = Math.max(0, plane.speed - DAMAGE.hitSpeedLoss);
      plane.invulnerable = 1.2;
      if (plane.damage >= 100) return events | crash('obstacle');
    }

    // Distance flown always pays a little.
    const flown = plane.speed * dt;
    state.distance += flown;
    state.score += flown * SCORE.distancePerMetre;
    return events;
  }

  reset();
  return { state, plane, reset, step };
}
