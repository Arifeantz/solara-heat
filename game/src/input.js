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
    this.pressed.clear();
  }

  // camera-relative movement axes for walking
  walkAxes() {
    let forward = 0, strafe = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) forward += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) forward -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) strafe -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) strafe += 1;
    return { forward, strafe };
  }

  // driving axes: throttle/steer in -1..1
  driveAxes() {
    let throttle = 0, steer = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) throttle += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) throttle -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) steer += 1;
    if (this.down('KeyD') || this.down('ArrowRight')) steer -= 1;
    return { throttle, steer, brake: this.down('Space') };
  }

  // arrow keys also turn the camera when the mouse is not locked (laptops,
  // screenshots, first-time players)
  turnCamera(dt) {
    if (this.locked) return;
    if (this.down('KeyQ')) this.yaw += 1.9 * dt;
    if (this.down('KeyE') && !this.pressed.has('KeyE')) this.yaw -= 1.9 * dt;
  }
}
