// Boot and the one loop: input is read every frame, the flight model advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between four screens: title,
// play, paused and game over. Sounds follow the flight events.
//
// ?seed=N fixes the valley, the rings and the obstacles. ?shot=start|play|ring|end
// (with &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { BEST_KEY, PALETTE, STEP } from './config.js';
import { createRandom } from './random.js';
import { createTerrain } from './terrain.js';
import { createRings } from './rings.js';
import {
  createFlight,
  EVENT_CRASH,
  EVENT_FUEL_EMPTY,
  EVENT_FUEL_LOW,
  EVENT_HIT,
  EVENT_LAND,
  EVENT_MISSION,
  EVENT_REFUEL_RING,
  EVENT_RING,
  EVENT_TAKEOFF,
} from './flight.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { createHud, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './hud.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** How long a centre-screen banner stays up, in seconds. */
const BANNER_SECONDS = 2.2;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const terrain = createTerrain(seed);
const rings = createRings(terrain, createRandom(seed ^ 0x51ab));
const flight = createFlight(terrain, rings);
const renderer = createRenderer(canvas, terrain, rings);
const hud = createHud(canvas, terrain, rings);
const audio = createAudio();

/** The landing mission's HUD state: whether it waits for a strip, and how far
 *  the next strip is ahead. */
function hudExtra() {
  const strip = terrain.nextStrip(flight.plane.z);
  return {
    awaitingLanding: rings.awaitingLanding(),
    stripDist: strip ? Math.max(0, strip.zStart - flight.plane.z) : null,
  };
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, flight, rings, terrain);
  const banner = null;
  // A handle for automated verification, mirroring __game in runGame().
  window.__shot = { flight, rings, scene };
  let painted = 0;
  function paint() {
    renderer.draw(flight.plane, scene.time, rings.currentMission());
    hud.draw(flight.state, scene.screen, scene.best, rings.currentMission(), banner, scene.time, hudExtra());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, () => screen);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let banner = null;
  let bannerUntil = 0;
  let time = 0;

  // A handle for automated play-testing: the live state, read-only enough.
  window.__game = {
    flight,
    rings,
    get screen() { return screen; },
    get best() { return best; },
  };

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function showBanner(text, color) {
    banner = { text, color, alpha: 1 };
    bannerUntil = time + BANNER_SECONDS;
  }

  function startGame() {
    flight.reset();
    audio.unlock();
    accumulator = 0;
    screen = SCREEN_PLAY;
    banner = null;
    announce('Flying. Hold Shift to throttle up, pull up to take off.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (Math.floor(flight.state.score) > best) {
      best = Math.floor(flight.state.score);
      saveBest(best);
    }
    announce(`Sortie over. Score ${Math.floor(flight.state.score)}. Best ${best}.`);
  }

  function handleEvents(events) {
    if (events & EVENT_TAKEOFF) {
      audio.takeoff();
      showBanner('AIRBORNE', PALETTE.gaugeLit);
    }
    if (events & EVENT_RING) {
      audio.ring();
      showBanner(`RING +100`, PALETTE.ring);
    }
    if (events & EVENT_REFUEL_RING) {
      audio.refuel();
      showBanner('REFUEL +22%', PALETTE.ringFuel);
    }
    if (events & EVENT_MISSION) {
      audio.mission();
      showBanner(`${rings.currentMission().name} — MISSION +500`, PALETTE.ring);
    }
    if (events & EVENT_LAND) {
      audio.land();
      if (flight.state.lastLandingBonus > 0) showBanner('LANDED +200', PALETTE.gaugeLit);
    }
    if (events & EVENT_HIT) {
      audio.hit();
      showBanner('HIT — AIRFRAME DAMAGED', PALETTE.warn);
      announce('Hit. Airframe damaged.');
    }
    if (events & EVENT_FUEL_LOW) audio.warning();
    if (events & EVENT_FUEL_EMPTY) {
      audio.warning();
      showBanner('OUT OF FUEL', PALETTE.warn);
    }
    if (events & EVENT_CRASH) {
      audio.crash();
      endGame();
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER) startGame();
      else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Flying.');
      }
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Flying.');
    }
  }

  function step() {
    const events = flight.step(STEP, input.command());
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    time += dt;
    handleActions();
    if (screen === SCREEN_PLAY) {
      accumulator += dt;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
      // The title screen idles on the runway; the engine still hums at idle.
      if (screen === SCREEN_TITLE) flight.step(STEP, { pitch: 0, roll: 0, throttleUp: false, throttleDown: false });
    }
    if (banner && time > bannerUntil) banner = null;
    else if (banner) banner.alpha = Math.min(1, (bannerUntil - time) / 0.6);
    audio.update(flight.plane.throttle, flight.plane.speed, flight.plane.phase === 'flying');
    renderer.draw(flight.plane, time, rings.currentMission());
    hud.draw(flight.state, screen, best, rings.currentMission(), banner, time, hudExtra());
  }

  // Leaving the tab pauses a running game rather than letting it fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Albatross Run. Press Space or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
