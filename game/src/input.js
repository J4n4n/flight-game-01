// Keyboard, mouse and touch input. Held keys give a steering command; one-shot
// presses (start or restart, pause, mute) are queued as bit flags and taken once
// by the loop, so a press between two frames is never lost and never counted
// twice. The mouse steers too: hold the pointer and the plane follows it. The
// on-screen throttle lever (THROTTLE_UI in config.js) is draggable with mouse
// or touch, so the game is fully playable without a keyboard: drag the lever to
// spool up, hold the pointer anywhere else to steer.

import { FIELD, THROTTLE_UI } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const ROLL_LEFT = new Set(['ArrowLeft', 'KeyA']);
const ROLL_RIGHT = new Set(['ArrowRight', 'KeyD']);
// Shift throttles up; Q throttles down. Control is deliberately NOT a throttle
// key: Ctrl+W closes the browser tab and preventDefault cannot stop it.
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'Equal', 'NumpadAdd']);
const THROTTLE_DOWN = new Set(['KeyQ', 'Minus', 'NumpadSubtract']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);

export function createInput(target, getScreen) {
  let pitchUp = false;
  let pitchDown = false;
  let rollLeft = false;
  let rollRight = false;
  let throttleUp = false;
  let throttleDown = false;
  let actions = 0;
  // Mouse steering: -1..1 in each axis while the pointer is held down.
  let mouseActive = false;
  let mouseX = 0;
  let mouseY = 0;
  // On-screen throttle lever: an absolute 0..1 position while it is dragged.
  let sliderDrag = false;
  let sliderThrottle = null;
  // A pointer press that started the game must not also yank the plane toward
  // its coordinates: steering stays off until that press is released.
  let suppressSteerUntilUp = false;

  function releaseAll() {
    pitchUp = false;
    pitchDown = false;
    rollLeft = false;
    rollRight = false;
    throttleUp = false;
    throttleDown = false;
    mouseActive = false;
    sliderDrag = false;
  }

  /** Client coordinates into the game's logical 1280x720 field. */
  function toField(event) {
    const rect = target.getBoundingClientRect();
    const scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
    const ox = (rect.width - FIELD.width * scale) / 2;
    const oy = (rect.height - FIELD.height * scale) / 2;
    return {
      x: (event.clientX - rect.left - ox) / scale,
      y: (event.clientY - rect.top - oy) / scale,
    };
  }

  function inThrottleRect(p) {
    return p.x >= THROTTLE_UI.x - 6 && p.x <= THROTTLE_UI.x + THROTTLE_UI.w + 6
      && p.y >= THROTTLE_UI.y - 6 && p.y <= THROTTLE_UI.y + THROTTLE_UI.h + 6;
  }

  function throttleFromPoint(p) {
    const t = (THROTTLE_UI.y + THROTTLE_UI.h - p.y) / THROTTLE_UI.h;
    return Math.max(0, Math.min(1, t));
  }

  window.addEventListener('keydown', (event) => {
    if (PITCH_UP.has(event.code)) pitchUp = true;
    else if (PITCH_DOWN.has(event.code)) pitchDown = true;
    else if (ROLL_LEFT.has(event.code)) rollLeft = true;
    else if (ROLL_RIGHT.has(event.code)) rollRight = true;
    else if (THROTTLE_UP.has(event.code)) { throttleUp = true; sliderThrottle = null; }
    else if (THROTTLE_DOWN.has(event.code)) { throttleDown = true; sliderThrottle = null; }
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (PITCH_UP.has(event.code)) pitchUp = false;
    else if (PITCH_DOWN.has(event.code)) pitchDown = false;
    else if (ROLL_LEFT.has(event.code)) rollLeft = false;
    else if (ROLL_RIGHT.has(event.code)) rollRight = false;
    else if (THROTTLE_UP.has(event.code)) throttleUp = false;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', releaseAll);

  function pointerPosition(event) {
    const p = toField(event);
    mouseX = (p.x / FIELD.width) * 2 - 1;
    mouseY = (p.y / FIELD.height) * 2 - 1;
  }
  target.addEventListener('pointerdown', (event) => {
    const p = toField(event);
    if (inThrottleRect(p)) {
      // Dragging the throttle lever: an absolute throttle, no steering, no start.
      sliderDrag = true;
      sliderThrottle = throttleFromPoint(p);
      return;
    }
    if (getScreen && getScreen() !== 'play') {
      // On the title / paused / over screens a click starts or resumes — and
      // must not also steer, so the plane is not yanked toward the click.
      actions |= ACTION_CONFIRM;
      suppressSteerUntilUp = true;
      return;
    }
    pointerPosition(event);
    mouseActive = true;
  });
  target.addEventListener('pointermove', (event) => {
    if (sliderDrag) {
      sliderThrottle = throttleFromPoint(toField(event));
      return;
    }
    if (mouseActive) pointerPosition(event);
  });
  function endPointer() {
    mouseActive = false;
    sliderDrag = false;
    suppressSteerUntilUp = false;
  }
  target.addEventListener('pointerup', endPointer);
  target.addEventListener('pointercancel', endPointer);

  return {
    /**
     * The steering command for this frame: pitch up positive, roll right
     * positive, throttle up/down held, and throttleSet when the on-screen
     * lever was dragged (an absolute position that wins over the keys).
     * The mouse overrides the keys while held.
     */
    command() {
      let pitch = (pitchUp ? 1 : 0) - (pitchDown ? 1 : 0);
      let roll = (rollRight ? 1 : 0) - (rollLeft ? 1 : 0);
      if (mouseActive && !suppressSteerUntilUp) {
        roll = Math.max(-1, Math.min(1, mouseX * 1.4));
        pitch = Math.max(-1, Math.min(1, -mouseY * 1.2));
      }
      return {
        pitch,
        roll,
        throttleUp,
        throttleDown,
        throttleSet: sliderThrottle,
      };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
