// The valley the game flies over: procedural terrain, a winding river, a town and
// four airstrips. Nothing here draws or flies — it only answers questions about
// the ground, so the flight rules, the ring placer and the renderer all agree on
// where the earth is. All heights are metres above sea level.

import { valueNoise } from './random.js';

/** The home runway strip: flat ground the plane takes off from and lands back on. */
export const RUNWAY = { x: 0, zStart: -80, zEnd: 620, halfWidth: 34, heading: 0 };

/** Where the town sits beside the river, and how far its houses spread. */
export const TOWN = { z: 2600, spread: 190 };

/** How far ahead the renderer and the ring placer may look. */
export const VIEW_DISTANCE = 2600;

export function createTerrain(seed) {
  const ridgeSeed = seed ^ 0x9e3779b9;
  const hillSeed = seed ^ 0x51f15e;

  /** The river's centreline: a slow S-curve down the valley. */
  function riverX(z) {
    return 150 * Math.sin(z * 0.0009 + 1.3) + 70 * Math.sin(z * 0.0027 + 4.1) - 40;
  }

  /** Four strips down the valley, about 2.5 km apart, each beside the river so a
   *  sortie can always put down somewhere to refuel: home, then three bush strips. */
  const strips = [
    { x: 0, zStart: -80, zEnd: 620, halfWidth: 34 },
    { x: riverX(3950) + 120, zStart: 3600, zEnd: 4300, halfWidth: 30 },
    { x: riverX(6450) + 120, zStart: 6100, zEnd: 6800, halfWidth: 30 },
    { x: riverX(8950) + 120, zStart: 8600, zEnd: 9300, halfWidth: 30 },
  ];

  /** Raw hills: two octaves of value noise plus a ridged mountain band far out. */
  function hills(x, z) {
    const rolling = valueNoise(x * 0.004, z * 0.004, hillSeed) * 26
      + valueNoise(x * 0.011, z * 0.011, hillSeed + 7) * 9;
    const ridge = valueNoise(x * 0.0016 + 40, z * 0.0016, ridgeSeed);
    const ridged = (1 - Math.abs(ridge)) * 150;
    const side = Math.min(1, Math.abs(x) / 700);
    return rolling + ridged * side * side;
  }

  /**
   * Ground height at (x, z). Every strip is flattened to zero, the river carves a
   * channel, and the town sits on a flattened shelf beside the river.
   */
  function heightAt(x, z) {
    let h = hills(x, z);
    // River channel: the ground dips toward the water.
    const dxRiver = x - riverX(z);
    h -= 16 * Math.exp(-(dxRiver * dxRiver) / (2 * 26 * 26));
    // Strip flattening: a smooth blend to zero near each strip.
    for (const strip of strips) {
      if (z > strip.zStart - 260 && z < strip.zEnd + 260) {
        const along = Math.min(1, Math.max(0, (z - (strip.zStart - 260)) / 260, ((strip.zEnd + 260) - z) / 260));
        const across = Math.min(1, Math.max(0, (Math.abs(x - strip.x) - strip.halfWidth) / 160));
        const flat = Math.min(along, across);
        h *= flat;
      }
    }
    // Town shelf: houses stand on level ground.
    const dzTown = z - TOWN.z;
    if (Math.abs(dzTown) < 260 && Math.abs(x - (riverX(TOWN.z) + 150)) < TOWN.spread + 120) {
      const shelf = Math.min(1, Math.max(0, (260 - Math.abs(dzTown)) / 120, (TOWN.spread + 120 - Math.abs(x - (riverX(TOWN.z) + 150))) / 120));
      h = h * (1 - shelf * 0.9) + 6 * shelf;
    }
    return h;
  }

  /** True when (x, z) is on any airstrip. */
  function onRunway(x, z) {
    for (const strip of strips) {
      if (Math.abs(x - strip.x) < strip.halfWidth && z >= strip.zStart && z <= strip.zEnd) return true;
    }
    return false;
  }

  /** The next strip ahead of z (the one a landing mission points at), or null. */
  function nextStrip(z) {
    for (const strip of strips) {
      if (strip.zStart > z + 50) return strip;
    }
    return null;
  }

  /** A few drifting clouds, fixed in the world so screenshots repeat. */
  const clouds = [];
  {
    let s = seed;
    const next = () => {
      s = (s * 1664525 + 1013904223) | 0;
      return ((s >>> 0) / 4294967296);
    };
    for (let i = 0; i < 26; i += 1) {
      clouds.push({
        x: (next() - 0.5) * 3200,
        y: 190 + next() * 160,
        z: next() * 9000 - 400,
        size: 60 + next() * 130,
        drift: 1.5 + next() * 2,
      });
    }
  }

  /** Houses for the town, placed once from the seed. */
  const houses = [];
  {
    let s = seed ^ 0xabcdef;
    const next = () => {
      s = (s * 1664525 + 1013904223) | 0;
      return ((s >>> 0) / 4294967296);
    };
    const centreX = riverX(TOWN.z) + 150;
    for (let i = 0; i < 46; i += 1) {
      const hx = centreX + (next() - 0.5) * 2 * TOWN.spread;
      const hz = TOWN.z + (next() - 0.5) * 420;
      if (Math.abs(hx - riverX(hz)) < 34) continue;
      houses.push({ x: hx, z: hz, w: 12 + next() * 14, h: 9 + next() * 10, rot: (next() - 0.5) * 0.5 });
    }
  }

  return { heightAt, riverX, onRunway, nextStrip, strips, clouds, houses };
}
