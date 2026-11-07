// Keyboard and multi-touch input. The left pad moves (left half / right half,
// you can slide your thumb between them) and the right pad jumps.

export class Input {
  constructor({ movePad, jumpPad, onPause }) {
    this.keys = new Set();
    this.touchMove = 0;
    this.touchJump = false;
    this.movePointers = new Map();
    this.jumpPointers = new Set();

    const keyMap = {
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyZ: 'jump', KeyK: 'jump',
    };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') { onPause?.(); return; }
      const k = keyMap[e.code];
      if (k) { this.keys.add(k); e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => {
      const k = keyMap[e.code];
      if (k) this.keys.delete(k);
    });
    window.addEventListener('blur', () => this.reset());

    const moveDir = (e) => {
      const rect = movePad.getBoundingClientRect();
      return e.clientX < rect.left + rect.width / 2 ? -1 : 1;
    };
    const updateMove = () => {
      let dir = 0;
      for (const d of this.movePointers.values()) dir = d;
      this.touchMove = dir;
      movePad.dataset.dir = String(dir);
    };
    movePad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      movePad.setPointerCapture(e.pointerId);
      this.movePointers.set(e.pointerId, moveDir(e));
      updateMove();
    });
    movePad.addEventListener('pointermove', (e) => {
      if (!this.movePointers.has(e.pointerId)) return;
      this.movePointers.set(e.pointerId, moveDir(e));
      updateMove();
    });
    const endMove = (e) => {
      this.movePointers.delete(e.pointerId);
      updateMove();
    };
    movePad.addEventListener('pointerup', endMove);
    movePad.addEventListener('pointercancel', endMove);

    jumpPad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      jumpPad.setPointerCapture(e.pointerId);
      this.jumpPointers.add(e.pointerId);
      this.touchJump = true;
      jumpPad.classList.add('pressed');
    });
    const endJump = (e) => {
      this.jumpPointers.delete(e.pointerId);
      this.touchJump = this.jumpPointers.size > 0;
      jumpPad.classList.toggle('pressed', this.touchJump);
    };
    jumpPad.addEventListener('pointerup', endJump);
    jumpPad.addEventListener('pointercancel', endJump);
    for (const el of [movePad, jumpPad]) el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  reset() {
    this.keys.clear();
    this.movePointers.clear();
    this.jumpPointers.clear();
    this.touchMove = 0;
    this.touchJump = false;
  }

  state() {
    return {
      left: this.keys.has('left') || this.touchMove < 0,
      right: this.keys.has('right') || this.touchMove > 0,
      jump: this.keys.has('jump') || this.touchJump,
    };
  }
}
