// Mobile controls (floating joystick on the left, drag to look on the right,
// action buttons) plus keyboard and mouse for testing on a computer.

export class Controls {
  constructor(el, buttons) {
    this.move = { x: 0, y: 0 }; // x right, y forward, length 0..1
    this.look = { dx: 0, dy: 0 };
    this.held = new Set();
    this.pressed = new Set();
    this.keys = new Set();
    this.enabled = true;
    this.sensitivity = 1;
    this.stick = null;
    this.lookPointer = null;

    const knob = el.querySelector('#stick');
    const knobInner = el.querySelector('#stick-knob');
    const RADIUS = 56;

    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled || e.target.closest('button')) return;
      const leftSide = e.clientX < window.innerWidth * 0.42;
      if (leftSide && !this.stick) {
        this.stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
        knob.style.left = `${e.clientX}px`;
        knob.style.top = `${e.clientY}px`;
        knob.classList.add('on');
      } else if (!leftSide && !this.lookPointer) {
        this.lookPointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    });
    el.addEventListener('pointermove', (e) => {
      if (this.stick?.id === e.pointerId) {
        let dx = e.clientX - this.stick.x;
        let dy = e.clientY - this.stick.y;
        const len = Math.hypot(dx, dy);
        if (len > RADIUS) { dx *= RADIUS / len; dy *= RADIUS / len; }
        knobInner.style.transform = `translate(${dx}px, ${dy}px)`;
        this.move.x = dx / RADIUS;
        this.move.y = -dy / RADIUS;
      } else if (this.lookPointer?.id === e.pointerId) {
        this.look.dx += (e.clientX - this.lookPointer.x) * this.sensitivity;
        this.look.dy += (e.clientY - this.lookPointer.y) * this.sensitivity;
        this.lookPointer.x = e.clientX;
        this.lookPointer.y = e.clientY;
      }
    });
    const end = (e) => {
      if (this.stick?.id === e.pointerId) {
        this.stick = null;
        this.move.x = 0;
        this.move.y = 0;
        knobInner.style.transform = '';
        knob.classList.remove('on');
      }
      if (this.lookPointer?.id === e.pointerId) this.lookPointer = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    for (const btn of buttons) {
      const name = btn.dataset.btn;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { btn.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
        this.held.add(name);
        this.pressed.add(name);
        btn.classList.add('down');
      });
      const up = () => { this.held.delete(name); btn.classList.remove('down'); };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // keyboard + mouse (computer)
    const keyMap = { Space: 'roll', KeyF: 'knife', KeyR: 'reload', KeyE: 'search', KeyQ: 'aim', KeyJ: 'fire' };
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (keyMap[e.code]) { this.pressed.add(keyMap[e.code]); this.held.add(keyMap[e.code]); }
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (keyMap[e.code]) this.held.delete(keyMap[e.code]);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.held.clear(); });
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0 && !e.target.closest('button') && document.pointerLockElement === el) { this.pressed.add('fire'); this.held.add('fire'); }
    });
    window.addEventListener('mouseup', () => this.held.delete('fire'));
    el.addEventListener('dblclick', () => el.requestPointerLock?.());
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === el) {
        this.look.dx += e.movementX * 0.6;
        this.look.dy += e.movementY * 0.6;
      }
    });
  }

  /** Movement from keys, merged with the joystick. */
  moveVector() {
    let x = this.move.x;
    let y = this.move.y;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y, len: Math.min(1, len) };
  }

  consumeLook() {
    const l = { ...this.look };
    this.look.dx = 0;
    this.look.dy = 0;
    return l;
  }

  /** True once per press. */
  take(name) {
    const had = this.pressed.has(name);
    this.pressed.delete(name);
    return had;
  }

  reset() {
    this.move.x = 0;
    this.move.y = 0;
    this.held.clear();
    this.pressed.clear();
    this.stick = null;
    this.lookPointer = null;
  }
}

/** Third-person camera over the right shoulder that avoids walls. */
export class ThirdPersonCamera {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.yaw = 0;
    this.pitch = 0.18;
    this.dist = 3.1;
    this.aim = 0;
    this.shake = 0;
    this.current = null;
  }

  applyLook(look) {
    this.yaw -= look.dx * 0.0058;
    this.pitch = Math.min(1.0, Math.max(-0.55, this.pitch + look.dy * 0.0045));
  }

  forward() {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }

  update(dt, target, aiming) {
    this.aim += ((aiming ? 1 : 0) - this.aim) * (1 - Math.exp(-dt * 10));
    const dist = 3.1 - this.aim * 1.25;
    const side = 0.45 + this.aim * 0.2;
    const pivot = target.clone();
    pivot.y += 1.55;
    const fwd = { x: Math.sin(this.yaw) * Math.cos(this.pitch), y: -Math.sin(this.pitch), z: Math.cos(this.yaw) * Math.cos(this.pitch) };
    const right = { x: -Math.cos(this.yaw), z: Math.sin(this.yaw) };
    pivot.x += right.x * side;
    pivot.z += right.z * side;
    const want = pivot.clone();
    want.x -= fwd.x * dist;
    want.y -= fwd.y * dist;
    want.z -= fwd.z * dist;
    want.y = Math.max(0.35, want.y);
    // pull in when a wall is between the shoulder and the camera
    const t = this.world.raycast(pivot, want);
    if (t < 1) want.lerpVectors(pivot, want, Math.max(0.15, t - 0.08));
    if (!this.current) this.current = want.clone();
    this.current.lerp(want, 1 - Math.exp(-dt * 18));
    this.camera.position.copy(this.current);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.12;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.12;
    }
    this.camera.lookAt(pivot.x + fwd.x * 10, pivot.y + fwd.y * 10, pivot.z + fwd.z * 10);
  }
}
