// Sound effects synthesized with the Web Audio API (no audio files).
export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.ambient = null;
  }

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startAmbient();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  suspend() { this.ctx?.suspend(); }
  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume(); }

  noiseShot({ dur, vol, type = 'lowpass', freq = 1000, q = 1, at = 0, sweepTo = null }) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  tone({ type = 'sine', from, to = from, dur, vol, at = 0 }) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Zombie groan: a detuned low voice with a wobble, quieter when far. */
  groan(distance = 5, angry = false) {
    const c = this.ctx;
    const vol = Math.max(0.02, 0.22 * (1 - distance / 25));
    const t = c.currentTime;
    const dur = angry ? 0.9 : 1.4 + Math.random() * 0.8;
    const base = (angry ? 110 : 75) + Math.random() * 30;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * (angry ? 1.4 : 0.8), t + dur);
    const lfo = c.createOscillator();
    lfo.frequency.value = 6 + Math.random() * 6;
    const lfoGain = c.createGain();
    lfoGain.gain.value = base * 0.08;
    lfo.connect(lfoGain);
    lfoGain.connect(o.frequency);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = angry ? 700 : 450;
    f.Q.value = 2.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(this.master);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
    this.noiseShot({ dur: dur * 0.7, vol: vol * 0.4, type: 'bandpass', freq: 900, q: 1.5 });
  }

  play(name, distance = 0) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    switch (name) {
      case 'shot':
        this.noiseShot({ dur: 0.35, vol: 0.9, type: 'lowpass', freq: 3800, sweepTo: 300 });
        this.tone({ type: 'triangle', from: 150, to: 45, dur: 0.18, vol: 0.6 });
        this.noiseShot({ dur: 0.9, vol: 0.12, type: 'lowpass', freq: 700, at: 0.05 });
        break;
      case 'empty': this.tone({ type: 'square', from: 1800, dur: 0.03, vol: 0.08 }); break;
      case 'reload':
        this.tone({ type: 'square', from: 900, to: 700, dur: 0.04, vol: 0.08 });
        this.tone({ type: 'square', from: 1300, to: 1000, dur: 0.04, vol: 0.1, at: 0.9 });
        this.noiseShot({ dur: 0.08, vol: 0.15, type: 'highpass', freq: 3000, at: 1.25 });
        break;
      case 'knife': this.noiseShot({ dur: 0.22, vol: 0.25, type: 'bandpass', freq: 2500, sweepTo: 6000, q: 2 }); break;
      case 'flesh':
        this.tone({ type: 'sine', from: 110, to: 50, dur: 0.15, vol: 0.4 });
        this.noiseShot({ dur: 0.12, vol: 0.3, type: 'lowpass', freq: 900 });
        break;
      case 'headshot':
        this.noiseShot({ dur: 0.2, vol: 0.45, type: 'lowpass', freq: 1500 });
        this.tone({ type: 'sine', from: 90, to: 40, dur: 0.25, vol: 0.5 });
        break;
      case 'hurt':
        this.tone({ type: 'sine', from: 80, to: 40, dur: 0.3, vol: 0.6 });
        this.noiseShot({ dur: 0.15, vol: 0.25, type: 'lowpass', freq: 600 });
        break;
      case 'heartbeat':
        this.tone({ type: 'sine', from: 60, to: 40, dur: 0.12, vol: 0.5 });
        this.tone({ type: 'sine', from: 55, to: 38, dur: 0.12, vol: 0.4, at: 0.22 });
        break;
      case 'roll': this.noiseShot({ dur: 0.3, vol: 0.15, type: 'lowpass', freq: 500 }); break;
      case 'pickup':
        this.tone({ type: 'triangle', from: 660, dur: 0.08, vol: 0.15 });
        this.tone({ type: 'triangle', from: 990, dur: 0.12, vol: 0.15, at: 0.08 });
        break;
      case 'craft':
        this.noiseShot({ dur: 0.1, vol: 0.2, type: 'highpass', freq: 2000 });
        this.tone({ type: 'triangle', from: 520, to: 780, dur: 0.2, vol: 0.15, at: 0.1 });
        break;
      case 'eat': this.noiseShot({ dur: 0.25, vol: 0.12, type: 'bandpass', freq: 1200, q: 3 }); break;
      case 'step': this.noiseShot({ dur: 0.06, vol: 0.05, type: 'lowpass', freq: 500 }); break;
      case 'groan': this.groan(distance); break;
      case 'notice':
      case 'attack': this.groan(distance, true); break;
      case 'death': this.tone({ type: 'sawtooth', from: 90, to: 35, dur: 1.2, vol: 0.2 }); break;
      default: break;
    }
  }

  /** Quiet wind in the background. */
  startAmbient() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain);
    lfoGain.connect(f.frequency);
    const g = c.createGain();
    g.gain.value = 0.06;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
    lfo.start();
    this.ambient = g;
  }
}
