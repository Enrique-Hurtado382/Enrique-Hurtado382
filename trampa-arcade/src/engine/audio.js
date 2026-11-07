// Chiptune sound effects and music synthesized with the Web Audio API.
// No audio files: everything is generated, so there is nothing to license.

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxOn = true;
    this.musicOn = true;
    this.song = null;
    this.timer = null;
  }

  /** Must be called from a user gesture (tap/click) the first time. */
  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicOn ? 0.55 : 0;
      this.musicGain.connect(this.master);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  suspend() {
    this.ctx?.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05);
  }

  setSfx(on) {
    this.sfxOn = on;
  }

  tone({ type = 'square', from, to = from, dur = 0.12, vol = 0.18, at = 0, dest = null }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(dest ?? this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noiseBurst({ dur = 0.2, vol = 0.25, freq = 1200, at = 0, dest = null }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest ?? this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  play(name) {
    if (!this.sfxOn || !this.ctx || this.ctx.state !== 'running') return;
    switch (name) {
      case 'jump': this.tone({ from: 330, to: 660, dur: 0.1, vol: 0.12 }); break;
      case 'spring': this.tone({ type: 'triangle', from: 180, to: 900, dur: 0.25, vol: 0.25 }); break;
      case 'death':
        this.noiseBurst({ dur: 0.35, vol: 0.35, freq: 1800 });
        this.tone({ type: 'sawtooth', from: 420, to: 50, dur: 0.45, vol: 0.18 });
        break;
      case 'win':
        [0, 4, 7, 12].forEach((n, i) => this.tone({ from: midi(72 + n), dur: 0.12, vol: 0.14, at: i * 0.07 }));
        break;
      case 'rumble': this.noiseBurst({ dur: 0.4, vol: 0.3, freq: 300 }); break;
      case 'thud': this.tone({ type: 'sine', from: 120, to: 40, dur: 0.2, vol: 0.4 }); break;
      case 'pop': this.tone({ from: 900, to: 1500, dur: 0.06, vol: 0.12 }); break;
      case 'poof': this.noiseBurst({ dur: 0.15, vol: 0.2, freq: 2500 }); break;
      case 'slide': this.tone({ type: 'sawtooth', from: 90, to: 140, dur: 0.3, vol: 0.12 }); break;
      case 'reveal': this.tone({ type: 'triangle', from: 1200, to: 600, dur: 0.12, vol: 0.2 }); break;
      case 'bump': this.tone({ type: 'square', from: 160, to: 110, dur: 0.06, vol: 0.12 }); break;
      case 'shoot': this.tone({ type: 'square', from: 1400, to: 200, dur: 0.2, vol: 0.1 }); break;
      case 'door-run':
      case 'teleport':
        this.tone({ from: 500, to: 1200, dur: 0.15, vol: 0.12 });
        this.tone({ from: 1200, to: 500, dur: 0.15, vol: 0.1, at: 0.15 });
        break;
      case 'gravity': this.tone({ type: 'sine', from: 200, to: 800, dur: 0.35, vol: 0.2 }); break;
      case 'reverse': this.tone({ type: 'square', from: 700, to: 300, dur: 0.25, vol: 0.12 }); break;
      case 'click': this.tone({ from: 660, dur: 0.04, vol: 0.08 }); break;
      case 'unlock':
        [0, 7, 12, 19].forEach((n, i) => this.tone({ type: 'triangle', from: midi(67 + n), dur: 0.18, vol: 0.18, at: i * 0.09 }));
        break;
      default: break;
    }
  }

  /** Loops a little chiptune built from the universe's chord progression. */
  playMusic(music) {
    if (!this.ctx) return;
    if (this.song === music) return;
    this.stopMusic();
    this.song = music;
    const stepDur = 60 / music.tempo / 2; // eighth notes
    let step = 0;
    let next = this.ctx.currentTime + 0.05;
    const arp = [0, 1, 2, 1, 0, 1, 2, 3];
    this.timer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      while (next < this.ctx.currentTime + 0.15) {
        const bar = Math.floor(step / 8) % music.chords.length;
        const chord = music.chords[bar];
        const i = step % 8;
        const at = next - this.ctx.currentTime;
        if (i % 2 === 0) {
          this.tone({ type: 'triangle', from: midi(music.root - 12 + chord[0] + (i === 4 ? 12 : 0)), dur: stepDur * 1.8, vol: 0.16, at, dest: this.musicGain });
        }
        const deg = arp[i];
        const note = deg === 3 ? chord[0] + 12 : chord[deg];
        this.tone({ type: 'square', from: midi(music.root + 12 + note), dur: stepDur * 0.8, vol: 0.045, at, dest: this.musicGain });
        if (i === 0 || i === 4) this.noiseBurst({ dur: 0.04, vol: 0.05, freq: 6000, at, dest: this.musicGain });
        step += 1;
        next += stepDur;
      }
    }, 40);
  }

  stopMusic() {
    clearInterval(this.timer);
    this.timer = null;
    this.song = null;
  }
}
