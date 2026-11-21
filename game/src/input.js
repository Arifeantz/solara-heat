// input.js — hands and eyes: keyboard, mouse-look, and gamepad.
//
// Input keeps two sets: the keys held right now (down) and the keys
// that went down during this frame (tap) — the difference between
// holding W to drive and tapping F to throw a punch. endFrame clears
// the taps once the frame has read them. The camera lives here too:
// yaw and pitch, fed by mouse movement while the pointer is locked,
// by the arrow keys, and by the gamepad's right stick.
//
// Sign conventions the rest of the game is built on: yaw is a
// heading in the world's own terms (forward = (sin yaw, cos yaw));
// steer +1 is a right turn; walk mz +1 is forward, mx +1 is right.

import { clamp } from './random.js';

const GAME_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyT', 'KeyC',
  'KeyP', 'KeyM', 'Space', 'ShiftLeft', 'ShiftRight',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.tappedNow = new Set();
    this.yaw = Math.PI; // behind Dario, looking at the marina road
    this.pitch = 0.42;

    window.addEventListener('keydown', (e) => {
      if (GAME_CODES.has(e.code)) e.preventDefault();
      if (!e.repeat) this.tappedNow.add(e.code);
      this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
    });
    window.addEventListener('blur', () => {
      // a lost window must not leave W held down forever
      this.held.clear();
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        if (!this.held.has('MouseLeft')) this.tappedNow.add('MouseLeft');
        this.held.add('MouseLeft');
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.held.delete('MouseLeft');
    });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.yaw -= e.movementX * 0.0026;
      this.pitch = clamp(this.pitch + e.movementY * 0.0021, 0.06, 1.3);
    });
  }

  down(code) {
    return this.held.has(code);
  }

  // true only on the frame the key went down; the frame's endFrame
  // clears taps, and the first reader takes the press
  tap(code) {
    if (!this.tappedNow.has(code)) return false;
    this.tappedNow.delete(code);
    return true;
  }

  endFrame() {
    this.tappedNow.clear();
  }

  _pad() {
    if (!navigator.getGamepads) return null;
    for (const pad of navigator.getGamepads()) {
      if (pad && pad.connected) return pad;
    }
    return null;
  }

  _padButton(pad, index) {
    const b = pad && pad.buttons[index];
    return b ? b.value : 0;
  }

  _padAxis(pad, index) {
    const v = pad ? pad.axes[index] || 0 : 0;
    return Math.abs(v) < 0.14 ? 0 : v; // a small dead zone
  }

  // throttle +1 forward, -0.6 reverse; steer +1 right; brake bool
  driveAxes() {
    let throttle = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) throttle += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) throttle -= 0.6;
    let steer = 0;
    if (this.down('KeyD') || this.down('ArrowRight')) steer += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) steer -= 1;
    let brake = this.down('Space');
    const pad = this._pad();
    if (pad) {
      const rt = this._padButton(pad, 7);
      const lt = this._padButton(pad, 6);
      if (rt > 0.05) throttle = Math.max(throttle, rt);
      if (lt > 0.05) brake = true;
      if (this._padButton(pad, 0) > 0.4 && throttle === 0) throttle = -0.6;
      steer += this._padAxis(pad, 0);
    }
    return { throttle, steer: clamp(steer, -1, 1), brake };
  }

  // mz +1 forward (away from the camera), mx +1 to the right
  walkAxes() {
    let mx = 0;
    let mz = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) mz += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) mz -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) mx += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) mx -= 1;
    const pad = this._pad();
    if (pad) {
      mx += this._padAxis(pad, 0);
      mz -= this._padAxis(pad, 1);
    }
    return { mx, mz };
  }

  // the slow orbit for players steering the camera without the
  // mouse: the gamepad's right stick. (The arrow keys belong to
  // movement; the mouse owns the camera for keyboard players.)
  turnCamera(dt) {
    const pad = this._pad();
    if (!pad) return;
    this.yaw -= this._padAxis(pad, 2) * 2.6 * dt;
    this.pitch = clamp(this.pitch + this._padAxis(pad, 3) * dt * 1.4, 0.06, 1.3);
  }
}
