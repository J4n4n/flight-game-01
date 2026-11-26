// Albatross Run — every tuning number and colour in one place. The playfield is a
// fixed 1280x720 logical area; the renderer scales it to the window, so no rule
// below depends on the screen size. Distances are metres, speeds are m/s.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The bottom instrument panel's height, in logical pixels. */
export const PANEL_HEIGHT = 100;

/** The on-screen throttle lever (drag it with mouse or touch). Field coordinates. */
export const THROTTLE_UI = { x: 632, y: FIELD.height - PANEL_HEIGHT + 24, w: 30, h: 44 };

/** The plane's flight envelope — a bush plane's numbers, not a jet's. */
export const PLANE = {
  /** Speed at which the wings lift the plane off the strip. */
  rotateSpeed: 26,
  /** Top speed at full throttle, level 1 (grows a little with level). */
  maxSpeed: 72,
  maxSpeedPerLevel: 2,
  maxSpeedCap: 84,
  /** How fast speed chases the throttle's target speed. */
  accelRate: 0.55,
  /** How much climbing bleeds speed, and diving adds it back. */
  climbDrag: 14,
  /** Extra speed bleed when the nose is held steep: a sustained max-pitch climb
   *  runs out of speed and stalls instead of climbing forever. */
  steepClimbDrag: 55,
  steepClimbPitch: 0.28,
  /** Pitch the pilot can command, radians (up positive). */
  maxPitch: 0.42,
  /** Roll the pilot can command, radians. */
  maxRoll: 1.05,
  /** How fast pitch/roll ease toward the commanded angle. */
  pitchEase: 3.2,
  rollEase: 4.0,
  /** Turn rate per radian of roll, scaled by speed. */
  turnRate: 0.55,
  /** Below this speed the wings stop flying and the plane sinks. */
  stallSpeed: 18,
  /** Sink rate when stalled, m/s per m/s short of stall speed. */
  stallSink: 0.22,
  /** Vertical speed a touchdown may have and still count as a landing. */
  maxLandingSink: 3,
  /** Roll a touchdown may have and still count as a landing. */
  maxLandingRoll: 0.38,
  /** Touchdown speed window for a landing that counts (m/s). */
  landingSpeedMin: 18,
  landingSpeedMax: 34,
  /** Hard cap on vertical speed, m/s: a bush plane climbs ~2400 FPM at best. */
  maxClimb: 12,
  maxSink: 15,
};

/** Fuel: percent of a full tank. */
export const FUEL = {
  start: 100,
  /** Percent per second at full throttle. */
  drainFull: 1.15,
  /** Percent per second at idle (the engine still burns). */
  drainIdle: 0.12,
  /** What a green refuel ring gives back. */
  ringRefuel: 22,
  /** Percent per second regained while parked on a strip. */
  runwayRefuel: 15,
  /** Below this the LOW FUEL warning shows. */
  lowWarning: 25,
  /** Out of fuel: the engine quits and the plane glides down. */
  empty: 0,
};

/** Damage: percent of the airframe. 100 means the sortie is over. */
export const DAMAGE = {
  /** One obstacle strike. */
  obstacleHit: 25,
  /** Speed lost in an obstacle strike. */
  hitSpeedLoss: 12,
};

export const RING = {
  /** Radius of a level-1 ring, metres. */
  radiusStart: 27,
  /** How much the radius shrinks per level. */
  radiusPerLevel: 2.2,
  radiusMin: 14,
  /** Distance ahead of the plane the next ring appears. */
  aheadMin: 380,
  aheadMax: 520,
  /** Points for flying through a ring. */
  points: 100,
  /** Every Nth ring is a green refuel ring. */
  refuelEvery: 4,
};

/** Missions: each one flies differently, not just more of the same. swing is how
 *  far the rings wander sideways (metres), altMin/altMax their height band above
 *  the ground, obstacleMul how crowded the line is, weather 'storm' brings a dark
 *  sky, rain and a crosswind, and landing:true means the sortie ends by putting
 *  the plane down on the next strip instead of by passing more rings. */
export const MISSIONS = [
  { name: 'First Flight', goal: 6, blurb: 'Pass 6 rings to clear the sortie.', low: true, tight: false, swing: 60, altMin: 44, altMax: 80, obstacleMul: 1, weather: 'clear', wind: 0 },
  { name: 'River Run', goal: 8, blurb: 'Low over the river, tight turns — pass 8 rings.', low: true, tight: true, swing: 150, altMin: 36, altMax: 60, obstacleMul: 1.3, weather: 'clear', wind: 0 },
  { name: 'Mountain Pass', goal: 8, blurb: 'Climb the ridge — pass 8 rings.', low: false, tight: true, swing: 280, altMin: 120, altMax: 200, obstacleMul: 1.1, weather: 'clear', wind: 0 },
  { name: 'Storm Ridge', goal: 10, blurb: 'Tight rings in a storm — pass 10.', low: false, tight: true, swing: 200, altMin: 70, altMax: 140, obstacleMul: 1.5, weather: 'storm', wind: -6 },
  { name: 'Last Leg', goal: 4, blurb: 'Four rings, then put her down on the next strip.', low: true, tight: false, swing: 120, altMin: 50, altMax: 90, obstacleMul: 1, weather: 'clear', wind: 0, landing: true },
];

/** Points for finishing a mission, and for a clean landing. */
export const SCORE = { missionBonus: 500, landingBonus: 200, distancePerMetre: 0.02 };

/** How long a sortie lasts per level: speeds and spawn rates stop growing there. */
export const LEVEL = { ringsPerLevel: 6, max: 12 };

/** Obstacles: how many balloons/towers sit near each ring, growing with level. */
export const OBSTACLES = { perRing: 1.0, perRingPerLevel: 0.25, maxPerRing: 4 };

export const PALETTE = {
  backdrop: '#0b1020',
  skyTop: '#2f6fb2',
  skyMid: '#7fb2dd',
  skyLow: '#cfe6f2',
  stormSkyTop: '#1c2c47',
  stormSkyMid: '#3c5578',
  stormSkyLow: '#6d8091',
  sun: '#fff3c4',
  sunGlow: 'rgba(255, 240, 180, 0.35)',
  cloud: '#ffffff',
  cloudShade: '#d2e1f0',
  /** Storm clouds are flat opaque slate, never translucent white. */
  stormCloud: '#5b6d84',
  stormCloudShade: '#46586e',
  /** A dark storm bank that replaces the sun in a storm. */
  stormBank: '#2c3e55',
  stormBankShade: '#24344a',
  farHill: '#8fa8c8',
  hill: '#5d7d4a',
  hillLight: '#7ba05b',
  hillDark: '#43603a',
  rock: '#8a7f74',
  snow: '#eef3f6',
  field: '#6f9e4f',
  fieldAlt: '#86b364',
  river: '#3f8fd2',
  riverLight: '#7cc0e8',
  runway: '#3c4148',
  runwayLine: '#f2f2e8',
  townRoof: '#b5533c',
  townRoofAlt: '#a34a2e',
  townWall: '#e8dcc8',
  townWallAlt: '#d8cbb2',
  tower: '#5a5f6b',
  balloonRed: '#d84a4a',
  balloonYellow: '#e8b93c',
  balloonBlue: '#4a7fd8',
  ring: '#ffd23e',
  ringGlow: 'rgba(255, 210, 62, 0.45)',
  ringFuel: '#3ddc84',
  ringFuelGlow: 'rgba(61, 220, 132, 0.45)',
  planeBody: '#e8ecf2',
  planeBelly: '#c94f38',
  planeWing: '#dfe6ee',
  planeWingTip: '#c94f38',
  planeGlass: '#1d3a5f',
  panel: '#141a26',
  panelEdge: '#2b3547',
  gauge: '#0d1420',
  gaugeLit: '#37e08a',
  gaugeAmber: '#ffb02e',
  gaugeRed: '#ff5a4e',
  text: '#eef1f5',
  muted: '#9aa7b8',
  warn: '#ff5a4e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'albatross-run.best';
