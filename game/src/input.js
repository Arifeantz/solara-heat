// input.js — keyboard and mouse for Solara Heat.
//
// WASD drives and walks, the mouse (pointer-locked) steers the camera, and
// the action keys are single-press events the game loop polls: E to enter or
// leave a car, F or a click to throw a punch, P or Esc to pause.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // keys that went down since the last poll
    this.yaw = 0; // camera orbit angle: at 0 it sits south of the player, looking north into the city
    this.pitch = 0.32;
    this.locked = false;
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => {
      if (!this.locked) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * 0.0026;
      this.pitch += e.movementY * 0.0022;
      if (this.pitch < -0.15) this.pitch = -0.15;
      if (this.pitch > 1.25) this.pitch = 1.25;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (this.locked && e.button === 0) this.pressed.add('MouseLeft');
    });
  }

  down(code) {
    return this.keys.has(code);
  }
  // consume a one-shot press
  tap(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }
  endFrame() {
    this.pollGamepad();
    this.pressed.clear();
  }

  // ------------------------------------------------------------ gamepad
  // A standard-mapping pad works alongside the keyboard: left stick to
  // walk and steer, triggers to drive, right stick for the camera, and
  // the face buttons wearing the keyboard's clothes (A is E, X is a
  // punch, Y answers the CabCo phone, Start pauses). Polled once per
  // frame from endFrame so button edges land in `pressed` exactly like
  // key edges do.
  gamepad() {
    if (!navigator.getGamepads) return null;
    for (const pad of navigator.getGamepads()) {
      if (pad && pad.connected) return pad;
    }
    return null;
  }

  pollGamepad() {
    const pad = this.gamepad();
    if (!pad) {
      this.padButtons = [];
      return;
    }
    const prev = this.padButtons || [];
    const now = pad.buttons.map((b) => !!b.pressed);
    const edge = (i) => now[i] && !prev[i];
    if (edge(0)) this.pressed.add('KeyE'); // A: enter / leave a car
    if (edge(2)) this.pressed.add('MouseLeft'); // X: punch
    if (edge(3)) this.pressed.add('KeyT'); // Y: CabCo fare
    if (edge(9)) this.pressed.add('KeyP'); // Start: pause
    if (now[1]) this.keys.add('PadBrake'); else this.keys.delete('PadBrake'); // B held: brake
    this.padButtons = now;
  }

  // one stick axis with a dead zone, so a resting pad never drifts
  stick(pad, i) {
    const v = pad && pad.axes[i] ? pad.axes[i] : 0;
    return Math.abs(v) < 0.16 ? 0 : v;
  }

  // camera-relative movement axes for walking
  walkAxes() {
    let forward = 0, strafe = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) forward += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) forward -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) strafe -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) strafe += 1;
    const pad = this.gamepad();
    if (pad) {
      forward -= this.stick(pad, 1);
      strafe += this.stick(pad, 0);
    }
    return { forward, strafe };
  }

  // driving axes: throttle/steer in -1..1
  driveAxes() {
    let throttle = 0, steer = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) throttle += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) throttle -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) steer += 1;
    if (this.down('KeyD') || this.down('ArrowRight')) steer -= 1;
    const pad = this.gamepad();
    if (pad) {
      steer -= this.stick(pad, 0);
      const rt = pad.buttons[7] ? pad.buttons[7].value : 0;
      const lt = pad.buttons[6] ? pad.buttons[6].value : 0;
      throttle += rt - lt;
      if (throttle > 1) throttle = 1;
      if (throttle < -1) throttle = -1;
    }
    return { throttle, steer, brake: this.down('Space') || this.down('PadBrake') };
  }

  // arrow keys also turn the camera when the mouse is not locked (laptops,
  // screenshots, first-time players); the pad's right stick always turns it
  turnCamera(dt) {
    const pad = this.gamepad();
    if (pad) {
      const rx = this.stick(pad, 2);
      if (rx) this.yaw -= rx * 2.6 * dt;
    }
    if (this.locked) return;
    if (this.down('KeyQ')) this.yaw += 1.9 * dt;
    if (this.down('KeyE') && !this.pressed.has('KeyE')) this.yaw -= 1.9 * dt;
  }
}
