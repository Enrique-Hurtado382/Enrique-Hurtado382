"""Síntesis procedural de los sonidos del addon (numpy -> wav -> ogg con ffmpeg)."""
import math
import os
import subprocess
import tempfile
import numpy as np

SR = 22050


def t_axis(sec):
    return np.arange(int(sec * SR)) / SR


def env(n, attack, release, hold=None):
    e = np.ones(n, np.float32)
    a = int(attack * SR)
    rl = int(release * SR)
    if a > 0:
        e[:a] = np.linspace(0, 1, a)
    if rl > 0:
        e[-rl:] *= np.linspace(1, 0, rl)
    return e


def noise(n, rng):
    return rng.standard_normal(n).astype(np.float32)


def bandpass(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    mask = ((f >= lo) & (f <= hi)).astype(np.float32)
    # bordes suaves
    w = max(1, int(len(f) * 0.002))
    mask = np.convolve(mask, np.ones(w) / w, mode="same")
    return np.fft.irfft(X * mask, n=len(x)).astype(np.float32)


def sine(freq, sec, phase=0.0):
    t = t_axis(sec)
    if np.ndim(freq):
        ph = 2 * np.pi * np.cumsum(freq) / SR
        return np.sin(ph + phase).astype(np.float32)
    return np.sin(2 * np.pi * freq * t + phase).astype(np.float32)


def decay(sec, tau):
    return np.exp(-t_axis(sec) / tau).astype(np.float32)


def mix(parts, length):
    out = np.zeros(int(length * SR), np.float32)
    for start, sig, gain in parts:
        s = int(start * SR)
        e = min(len(out), s + len(sig))
        if e > s:
            out[s:e] += sig[: e - s] * gain
    return out


def tink(freq, sec, tau, rng):
    s = sine(freq, sec) * decay(sec, tau)
    s += 0.3 * sine(freq * 2.7, sec) * decay(sec, tau * 0.5)
    return s


def normalize(x, peak=0.85):
    m = np.max(np.abs(x)) or 1
    return (x / m * peak).astype(np.float32)


# ----------------------------------------------------------- sonidos ----

def glass_creak(rng):
    L = 1.3
    parts = []
    t = 0.05
    while t < L - 0.15:
        f = rng.uniform(2400, 6500)
        parts.append((t, bandpass(noise(int(0.03 * SR), rng), 1800, 7000) * decay(0.03, 0.006), 0.7))
        parts.append((t, tink(f, 0.12, 0.025, rng), 0.5))
        t += rng.uniform(0.04, 0.16) * (1.0 - 0.5 * t / L)
    low = bandpass(noise(int(L * SR), rng), 180, 520) * (0.5 + 0.5 * np.sin(t_axis(L) * 23)) * env(int(L * SR), 0.2, 0.4)
    parts.append((0, low, 0.35))
    return normalize(mix(parts, L))


def glass_shatter(rng):
    L = 2.4
    parts = [(0, bandpass(noise(int(0.25 * SR), rng), 1200, 9000) * decay(0.25, 0.06), 1.0),
             (0, sine(np.linspace(140, 60, int(0.3 * SR)), 0.3) * decay(0.3, 0.08), 0.8),
             (0, bandpass(noise(int(1.2 * SR), rng), 300, 2500) * decay(1.2, 0.3), 0.5)]
    t = 0.02
    while t < 1.9:
        f = rng.uniform(2200, 9500)
        parts.append((t, tink(f, 0.3, rng.uniform(0.03, 0.12), rng), rng.uniform(0.15, 0.5) * (1 - t / 2.4)))
        t += rng.uniform(0.012, 0.06) * (1 + 1.5 * t)
    return normalize(mix(parts, L))


def rumble(rng, L=6.0):
    n = int(L * SR)
    brown = np.cumsum(noise(n, rng))
    brown -= np.convolve(brown, np.ones(2000) / 2000, mode="same")
    low = bandpass(brown, 18, 110)
    t = t_axis(L)
    lfo = 0.6 + 0.4 * np.sin(t * 2.3) * np.sin(t * 0.7 + 1)
    return normalize(low * lfo * env(n, 0.8, 1.5))


def eye_hum(rng, L=6.0):
    n = int(L * SR)
    t = t_axis(L)
    s = sine(48, L) + 0.8 * sine(49.6, L) + 0.5 * sine(72.4, L) + 0.3 * sine(96.9, L)
    breath = bandpass(noise(n, rng), 250, 900) * (0.5 + 0.5 * np.sin(t * 1.4))
    s = s * (0.8 + 0.2 * np.sin(t * 5.1)) + breath * 0.6
    return normalize(s * env(n, 1.2, 1.6))


def blink(rng):
    L = 0.28
    parts = [(0, bandpass(noise(int(0.04 * SR), rng), 500, 2000) * decay(0.04, 0.01), 0.8),
             (0.005, sine(np.linspace(320, 110, int(0.12 * SR)), 0.12) * decay(0.12, 0.04), 1.0),
             (0.06, bandpass(noise(int(0.08 * SR), rng), 300, 1200) * decay(0.08, 0.02), 0.5)]
    return normalize(mix(parts, L))


def whoosh(rng, L=2.6):
    n = int(L * SR)
    t = t_axis(L)
    x = noise(n, rng)
    out = np.zeros(n, np.float32)
    seg = int(0.1 * SR)
    for i in range(0, n, seg):
        u = i / n
        lo, hi = 150 + 2500 * u ** 2, 600 + 5000 * u ** 1.5
        chunk = bandpass(x[i:i + seg], lo, hi)
        out[i:i + len(chunk)] = chunk
    amp = (t / L) ** 2.2
    amp[-int(0.15 * SR):] *= np.linspace(1, 0, int(0.15 * SR))
    return normalize(out * amp)


def slam(rng):
    L = 3.2
    n = int(L * SR)
    parts = [(0, sine(np.linspace(95, 26, int(0.7 * SR)), 0.7) * decay(0.7, 0.25), 1.0),
             (0, bandpass(noise(int(0.5 * SR), rng), 80, 2600) * decay(0.5, 0.09), 0.9),
             (0.03, rumble(rng, 2.8) * decay(2.8, 1.1), 0.9)]
    t = 0.05
    while t < 1.6:
        parts.append((t, bandpass(noise(int(0.05 * SR), rng), 250, 1600) * decay(0.05, 0.012), rng.uniform(0.1, 0.35) * (1 - t / 1.8)))
        t += rng.uniform(0.02, 0.09)
    return normalize(mix(parts, L))


def crack_ground(rng):
    L = 1.1
    parts = []
    t = 0.0
    k = 0
    while t < 0.95:
        lo = 220 - k * 8
        parts.append((t, bandpass(noise(int(0.07 * SR), rng), max(lo, 60), 1400 - k * 40) * decay(0.07, 0.015), rng.uniform(0.4, 1.0)))
        t += rng.uniform(0.04, 0.12)
        k += 1
    parts.append((0, bandpass(noise(int(L * SR), rng), 40, 160) * env(int(L * SR), 0.05, 0.5), 0.5))
    return normalize(mix(parts, L))


def wand_charge(rng):
    L = 3.15
    n = int(L * SR)
    t = t_axis(L)
    glide = 220 * (4.0 ** (t / 3.0))
    s = np.zeros(n, np.float32)
    for k, ratio in enumerate((1.0, 1.5, 2.0, 3.0, 4.0)):
        trem = 0.6 + 0.4 * np.sin(2 * np.pi * (6 + 10 * t / L) * t + k)
        s += sine(glide * ratio, L) * trem / (k + 1)
    shimmer = bandpass(noise(n, rng), 2000, 7000) * (t / L) ** 2
    parts = [(0, s * (0.3 + 0.7 * t / L), 1.0), (0, shimmer, 0.7)]
    tt = 0.3
    while tt < 3.0:
        parts.append((tt, tink(rng.uniform(1800, 5200), 0.25, 0.05, rng), 0.3 * tt / 3))
        tt += rng.uniform(0.05, 0.2) * (1 - 0.6 * tt / 3)
    out = mix(parts, L)
    out[-int(0.05 * SR):] *= np.linspace(1, 0, int(0.05 * SR))
    return normalize(out)


def wand_cast(rng):
    L = 1.6
    parts = [(0, bandpass(noise(int(0.3 * SR), rng), 800, 9000) * decay(0.3, 0.07), 1.0),
             (0, sine(np.linspace(70, 35, int(0.4 * SR)), 0.4) * decay(0.4, 0.12), 0.9)]
    for f in (880, 1320, 1760, 2640):
        parts.append((0.02, sine(np.linspace(f, f / 2, int(1.2 * SR)), 1.2) * decay(1.2, 0.35), 0.25))
    return normalize(mix(parts, L))


def bolt(rng):
    L = 1.15
    n = int(L * SR)
    t = t_axis(L)
    out = np.zeros(n, np.float32)
    seg = int(0.05 * SR)
    x = noise(n, rng)
    for i in range(0, n, seg):
        u = i / n
        chunk = bandpass(x[i:i + seg], 300 + 3500 * u, 900 + 7000 * u)
        out[i:i + len(chunk)] = chunk
    tone = sine(400 * (6 ** (t / L)), L) * 0.5
    return normalize((out + tone) * np.sqrt(t / L) * env(n, 0.05, 0.1))


def seal(rng):
    L = 2.8
    n = int(L * SR)
    parts = []
    for k, f in enumerate((523.25, 659.25, 783.99, 1046.5, 1318.5)):
        s = sine(f, L) * env(n, 0.45 + 0.1 * k, 1.6)
        parts.append((0.08 * k, s, 0.35 / (k * 0.4 + 1)))
    parts.append((0, bandpass(noise(n, rng), 2500, 8000) * env(n, 1.0, 1.4) * 0.3, 0.5))
    return normalize(mix(parts, L))


SOUNDS = {
    "glass_creak": glass_creak,
    "glass_shatter": glass_shatter,
    "rumble": rumble,
    "eye_hum": eye_hum,
    "blink": blink,
    "whoosh": whoosh,
    "slam": slam,
    "crack_ground": crack_ground,
    "wand_charge": wand_charge,
    "wand_cast": wand_cast,
    "bolt": bolt,
    "seal": seal,
}


def write_wav(path, data):
    import wave
    pcm = (np.clip(data, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def build_sounds(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    rng = np.random.default_rng(42)
    with tempfile.TemporaryDirectory() as tmp:
        for name, fn in SOUNDS.items():
            data = fn(rng)
            wav = os.path.join(tmp, name + ".wav")
            write_wav(wav, data)
            ogg = os.path.join(out_dir, name + ".ogg")
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", wav, "-c:a", "libvorbis", "-q:a", "4", ogg], check=True)
    return list(SOUNDS)


def sound_definitions():
    cats = {"wand_charge": "player", "wand_cast": "player", "bolt": "player"}
    defs = {}
    for name in SOUNDS:
        defs[f"sky.{name}"] = {
            "category": cats.get(name, "ambient"),
            "min_distance": 4.0,
            "max_distance": 160.0,
            "sounds": [{"name": f"sounds/sky/{name}", "volume": 1.0, "load_on_low_memory": True}],
        }
    return {"format_version": "1.14.0", "sound_definitions": defs}
