// Missions, target rings and obstacles. The next ring always sits ahead of the
// plane on the current mission's line — low over the river, high through the
// ridge, or tight in a storm — and balloons and radio towers crowd the line as
// the level rises. update() is called once per flight step and reports passes,
// misses and hits. A landing mission stops placing rings once its goal is met:
// the sortie then ends only by putting the plane down on the next strip.

import { FUEL, LEVEL, MISSIONS, OBSTACLES, RING, SCORE } from './config.js';
import { EVENT_HIT, EVENT_MISSION, EVENT_REFUEL_RING, EVENT_RING } from './flight.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createRings(terrain, random) {
  let ring = null; // { x, y, z, radius, fuel, index }
  let ringCount = 0;
  let obstacles = []; // { kind: 'balloon'|'tower', x, y, z, radius, height, hue }
  let mission = MISSIONS[0];
  let awaitingLanding = false;

  function ringRadius(ringsPassed) {
    const lvl = Math.min(LEVEL.max, 1 + Math.floor(ringsPassed / LEVEL.ringsPerLevel));
    return Math.max(RING.radiusMin, RING.radiusStart - RING.radiusPerLevel * (lvl - 1));
  }

  /** Where the next ring belongs, given where the plane is now. */
  function placeRing(plane, ringsPassed) {
    const ahead = RING.aheadMin + random() * (RING.aheadMax - RING.aheadMin);
    const z = plane.z + ahead;
    let x;
    if (mission.low) {
      // River missions hug the water, wandering sideways by the mission's swing.
      x = terrain.riverX(z) + (random() - 0.5) * mission.swing;
    } else {
      // Ridge missions wander the valley, never far from the last ring.
      const from = ring ? ring.x : plane.x;
      x = clamp(from + (random() - 0.5) * mission.swing, -280, 280);
    }
    const ground = terrain.heightAt(x, z);
    const altitude = mission.altMin + random() * (mission.altMax - mission.altMin);
    const y = ground + altitude;
    ringCount += 1;
    ring = {
      x, y, z,
      radius: mission.tight ? ringRadius(ringsPassed) * 0.85 : ringRadius(ringsPassed),
      fuel: ringCount % RING.refuelEvery === 0,
      index: ringCount,
    };
    placeObstacles(plane, ringsPassed);
    return ring;
  }

  /** Balloons and towers near the line to the new ring. */
  function placeObstacles(plane, ringsPassed) {
    const lvl = Math.min(LEVEL.max, 1 + Math.floor(ringsPassed / LEVEL.ringsPerLevel));
    const count = Math.min(
      OBSTACLES.maxPerRing,
      Math.floor((OBSTACLES.perRing + OBSTACLES.perRingPerLevel * (lvl - 1)) * (mission.obstacleMul || 1) + random()),
    );
    const hues = ['red', 'yellow', 'blue'];
    for (let i = 0; i < count; i += 1) {
      const t = 0.35 + random() * 0.6; // between the plane and the ring
      const ox = plane.x + (ring.x - plane.x) * t + (random() - 0.5) * 170;
      const oz = plane.z + (ring.z - plane.z) * t;
      if (random() < 0.55) {
        const ground = terrain.heightAt(ox, oz);
        obstacles.push({
          kind: 'balloon', x: ox, y: ground + 45 + random() * 80, z: oz,
          radius: 11 + random() * 4, hue: hues[Math.floor(random() * hues.length)],
        });
      } else {
        const ground = terrain.heightAt(ox, oz);
        const height = 55 + random() * 55;
        obstacles.push({
          kind: 'tower', x: ox, y: ground, z: oz,
          radius: 7, height, hue: 'grey',
        });
      }
    }
    // Forget anything far behind the plane.
    obstacles = obstacles.filter((o) => o.z > plane.z - 120);
    // Keep balloons apart and off the ring: two balloons fused into one blob,
    // or a balloon sitting on the ring, read as clutter instead of depth.
    const balloons = obstacles.filter((o) => o.kind === 'balloon');
    for (let pass = 0; pass < 3; pass += 1) {
      for (let i = 0; i < balloons.length; i += 1) {
        for (let j = i + 1; j < balloons.length; j += 1) {
          const a = balloons[i];
          const b = balloons[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
          if (d < 70) {
            b.x += (b.x >= a.x ? 1 : -1) * 80;
            b.y += 25;
          }
        }
        const b = balloons[i];
        if (ring) {
          const d = Math.hypot(b.x - ring.x, b.y - ring.y, b.z - ring.z);
          if (d < 55) {
            b.x += (b.x >= ring.x ? 1 : -1) * 95;
            b.y += 20;
          }
        }
      }
    }
  }

  function advanceMission(flightState) {
    flightState.score += SCORE.missionBonus;
    flightState.missionIndex = (flightState.missionIndex + 1) % MISSIONS.length;
    flightState.missionRings = 0;
    mission = MISSIONS[flightState.missionIndex];
    awaitingLanding = false;
  }

  function reset() {
    ring = null;
    ringCount = 0;
    obstacles = [];
    mission = MISSIONS[0];
    awaitingLanding = false;
  }

  /**
   * Advance the mission: check the ring crossing, score a pass, count a miss,
   * and test every obstacle. Returns EVENT_* flags for the flight step.
   */
  function update(flightState, plane, prevZ, dt) {
    let events = 0;
    // A landing mission with its rings done waits for a strip landing.
    // No more rings are placed, but obstacles still count on the way down.
    if (mission.landing && flightState.missionRings >= mission.goal) {
      awaitingLanding = true;
      ring = null;
      if (plane.phase === 'ground' && plane.speed < 6 && terrain.onRunway(plane.x, plane.z)) {
        advanceMission(flightState);
        events |= EVENT_MISSION;
      }
    } else if (ring === null) {
      placeRing(plane, flightState.ringsPassed);
      return 0;
    } else if (prevZ < ring.z && plane.z >= ring.z) {
      const t = (ring.z - prevZ) / Math.max(0.001, plane.z - prevZ);
      // Interpolate between the previous and current position.
      const px = plane.x - Math.sin(plane.heading) * plane.speed * dt * (1 - t);
      const py = plane.y - plane.verticalSpeed * dt * (1 - t);
      const dx = px - ring.x;
      const dy = py - ring.y;
      if (Math.sqrt(dx * dx + dy * dy) < ring.radius) {
        events |= EVENT_RING;
        flightState.ringsPassed += 1;
        flightState.missionRings += 1;
        flightState.score += RING.points;
        if (ring.fuel) {
          plane.fuel = Math.min(100, plane.fuel + FUEL.ringRefuel);
          events |= EVENT_REFUEL_RING;
        }
        if (flightState.missionRings >= mission.goal && !mission.landing) {
          advanceMission(flightState);
          events |= EVENT_MISSION;
        }
      }
      placeRing(plane, flightState.ringsPassed);
    } else if (plane.z > ring.z + 40) {
      // Flew past it: the ring is gone, the next one is already up.
      placeRing(plane, flightState.ringsPassed);
    }

    // Obstacles: a strike costs damage and a chunk of speed.
    if (plane.invulnerable <= 0 && plane.phase !== 'crashed') {
      for (const o of obstacles) {
        const dz = plane.z - o.z;
        if (dz < -14 || dz > 14) continue;
        if (o.kind === 'balloon') {
          const dx = plane.x - o.x;
          const dy = plane.y - o.y;
          if (dx * dx + dy * dy < (o.radius + 6) * (o.radius + 6)) {
            events |= EVENT_HIT;
            o.z = -1e9; // spent: it bursts and is gone
            break;
          }
        } else {
          const dx = plane.x - o.x;
          const top = o.y + o.height;
          if (Math.abs(dx) < o.radius + 6 && plane.y > o.y && plane.y < top) {
            events |= EVENT_HIT;
            o.z = -1e9;
            break;
          }
        }
      }
      obstacles = obstacles.filter((o) => o.z > -1e8);
    }
    return events;
  }

  return {
    reset,
    update,
    currentRing() { return ring; },
    currentMission() { return mission; },
    obstacles() { return obstacles; },
    awaitingLanding() { return awaitingLanding; },
  };
}
