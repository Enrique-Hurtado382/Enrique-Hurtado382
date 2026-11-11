"""Pintor procedural de texturas (piel, ojo, vidrio roto, partículas, varita)."""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from .common import HOLE_R_SMALL, HOLE_R_BIG, GLASS_SIZE, HOLE_SMALL_QUAD, HOLE_BIG_QUAD
from . import geometry as G

SKIN = np.array([0.80, 0.68, 0.60], np.float32)
SKIN_PALM = np.array([0.85, 0.70, 0.65], np.float32)
LID_SKIN = np.array([0.50, 0.40, 0.37], np.float32)
VEIN = np.array([0.44, 0.46, 0.60], np.float32)
NAIL = np.array([0.90, 0.78, 0.72], np.float32)


# ------------------------------------------------------------ utilidades --

def value_noise(w, h, cell, rng):
    gw = max(2, int(math.ceil(w / max(cell, 1))) + 1)
    gh = max(2, int(math.ceil(h / max(cell, 1))) + 1)
    g = (rng.random((gh, gw)) * 255).astype(np.uint8)
    img = Image.fromarray(g, "L").resize((max(w, 1), max(h, 1)), Image.BICUBIC)
    return np.asarray(img).astype(np.float32) / 255.0


def fbm(w, h, cell, octaves, rng, gain=0.5):
    out = np.zeros((h, w), np.float32)
    amp, tot, c = 1.0, 0.0, float(cell)
    for _ in range(octaves):
        out += amp * value_noise(w, h, max(c, 1.0), rng)
        tot += amp
        amp *= gain
        c /= 2.0
    return out / tot


def lines_mask(w, h, lines, width, blur=0.0, alpha=255):
    img = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(img)
    for pts in lines:
        if len(pts) < 2:
            continue
        d.line([(float(x), float(y)) for x, y in pts], fill=alpha, width=max(1, int(round(width))), joint="curve")
    if blur > 0:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(img).astype(np.float32) / 255.0


def polygon_mask(w, h, polys, blur=0.0):
    img = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(img)
    for pts in polys:
        d.polygon([(float(x), float(y)) for x, y in pts], fill=255)
    if blur > 0:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(img).astype(np.float32) / 255.0


def blend(col, mask, color, strength):
    m = (mask * strength)[..., None]
    return col * (1 - m) + np.asarray(color, np.float32)[None, None, :] * m


def radial(w, h, cx=None, cy=None):
    cx = w / 2 if cx is None else cx
    cy = h / 2 if cy is None else cy
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    return np.sqrt((xs + 0.5 - cx) ** 2 + (ys + 0.5 - cy) ** 2)


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def random_walk(rng, start, angle, steps, step_len, drift=0.35, bounds=None):
    pts = [start]
    x, y = start
    for _ in range(steps):
        angle += rng.normal(0, drift)
        x += math.cos(angle) * step_len
        y += math.sin(angle) * step_len
        if bounds is not None:
            if not (-4 <= x <= bounds[0] + 4 and -4 <= y <= bounds[1] + 4):
                break
        pts.append((x, y))
    return pts


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.a = np.zeros((h, w, 4), np.float32)

    def paste(self, rect, rgb, alpha=1.0):
        x, y, w, h = [int(round(v)) for v in rect]
        w, h = max(w, 1), max(h, 1)
        if rgb.shape[0] != h or rgb.shape[1] != w:
            rgb = resize_rgb(rgb, w, h)
        a = alpha if np.ndim(alpha) else np.full((h, w), float(alpha), np.float32)
        if a.shape != (h, w):
            a = np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).resize((w, h))).astype(np.float32) / 255
        self.a[y:y + h, x:x + w, :3] = np.clip(rgb, 0, 1)
        self.a[y:y + h, x:x + w, 3] = np.clip(a, 0, 1)

    def image(self):
        return Image.fromarray((np.clip(self.a, 0, 1) * 255).astype(np.uint8), "RGBA")


def resize_rgb(rgb, w, h):
    img = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8), "RGB").resize((w, h), Image.BILINEAR)
    return np.asarray(img).astype(np.float32) / 255


# ------------------------------------------------------------------ piel --

def skin_patch(w, h, rng, base=SKIN, mottle=0.10, pores=0.05):
    n1 = fbm(w, h, max(w, h) / 5, 3, rng)
    n2 = fbm(w, h, 3, 2, rng)
    n3 = fbm(w, h, max(w, h) / 3, 2, rng)
    col = np.repeat(np.repeat(base[None, None, :], h, 0), w, 1).copy()
    col *= (1 + mottle * (n1[..., None] - 0.5) * 2 + pores * (n2[..., None] - 0.5) * 2)
    col[..., 0] *= 1 + 0.05 * (n3 - 0.5)
    col[..., 2] *= 1 - 0.06 * (n3 - 0.5)
    return col


def edge_ao(col, frac=0.14, strength=0.35, axis="y"):
    h, w = col.shape[:2]
    n = h if axis == "y" else w
    t = np.arange(n, dtype=np.float32) + 0.5
    e = np.minimum(t, n - t) / max(frac * n, 1)
    f = 1 - strength * (1 - np.clip(e, 0, 1)) ** 1.5
    return col * (f[:, None, None] if axis == "y" else f[None, :, None])


def veins(col, rng, count, strength=0.32, width=None, along="y", lengthy=False):
    h, w = col.shape[:2]
    width = width or max(2, int(min(w, h) / 24))
    lines = []
    for _ in range(count):
        if along == "y":
            start = (rng.uniform(0.1, 0.9) * w, rng.uniform(-0.05, 0.3) * h)
            ang = math.pi / 2 + rng.normal(0, 0.25)
        else:
            start = (rng.uniform(-0.05, 0.3) * w, rng.uniform(0.1, 0.9) * h)
            ang = rng.normal(0, 0.25)
        steps = int(rng.uniform(0.5, 1.1) * (max(h, w) if lengthy else min(h, w)) / 6)
        pts = random_walk(rng, start, ang, max(steps, 4), 6, drift=0.22, bounds=(w, h))
        lines.append(pts)
        if rng.random() < 0.6 and len(pts) > 6:
            k = rng.integers(3, len(pts) - 2)
            lines.append(random_walk(rng, pts[k], ang + rng.choice([-1, 1]) * rng.uniform(0.4, 0.9),
                                     max(3, steps // 2), 5, drift=0.25, bounds=(w, h)))
    m = lines_mask(w, h, lines, width, blur=width * 0.7)
    col = blend(col, m, VEIN, strength)
    # leve brillo junto a la vena (relieve)
    m2 = np.roll(m, -max(1, width // 2), axis=1) * (1 - m)
    return blend(col, m2, [1.0, 0.92, 0.88], 0.10)


def wrinkles(col, rng, ys, strength=0.3, width=1.5, wav=0.6):
    h, w = col.shape[:2]
    lines = []
    for y in ys:
        pts = []
        for x in np.linspace(-2, w + 2, max(6, w // 6)):
            pts.append((x, y * h + rng.normal(0, wav) + math.sin(x / max(w, 1) * 6.0 + y * 9) * wav * 2))
        lines.append(pts)
    m = lines_mask(w, h, lines, width, blur=0.7)
    return blend(col, m, [0.42, 0.30, 0.27], strength)


def creases_palm(col, rng):
    h, w = col.shape[:2]
    def arc(p0, p1, bulge, n=24):
        (x0, y0), (x1, y1) = p0, p1
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        nx, ny = -(y1 - y0), (x1 - x0)
        L = math.hypot(nx, ny) or 1
        cx, cy = mx + nx / L * bulge, my + ny / L * bulge
        pts = []
        for t in np.linspace(0, 1, n):
            x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1
            y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1
            pts.append((x + rng.normal(0, 0.6), y + rng.normal(0, 0.6)))
        return pts
    lines = [arc((0.08 * w, 0.30 * h), (0.92 * w, 0.22 * h), -0.06 * h),
             arc((0.08 * w, 0.46 * h), (0.78 * w, 0.56 * h), 0.05 * h),
             arc((0.62 * w, 0.30 * h), (0.70 * w, 0.96 * h), -0.22 * w)]
    m = lines_mask(w, h, lines, max(1.5, w / 55), blur=1.0)
    col = blend(col, m, [0.55, 0.36, 0.33], 0.42)
    # eminencia tenar (bulto más claro)
    rr = radial(w, h, 0.80 * w, 0.78 * h)
    col = col * (1 + 0.06 * (1 - smooth(rr, 0, 0.3 * w)))[..., None]
    return col


def nail(col, rng):
    h, w = col.shape[:2]
    x0, x1 = 0.16 * w, 0.84 * w
    y0, y1 = 0.40 * h, 0.97 * h
    img = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([x0, y0, x1, y1], radius=(x1 - x0) * 0.35, fill=255)
    m = np.asarray(img).astype(np.float32) / 255
    shadow = np.asarray(img.filter(ImageFilter.GaussianBlur(max(1.5, w / 14)))).astype(np.float32) / 255
    col = blend(col, np.clip(shadow - m, 0, 1), [0.55, 0.38, 0.34], 0.5)
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    grad = 1 + 0.10 * ((xs / w) - 0.5) - 0.08 * ((ys / h) - 0.7)
    ncol = NAIL[None, None, :] * grad[..., None]
    col = col * (1 - m[..., None]) + ncol * m[..., None]
    lun = Image.new("L", (w, h), 0)
    ImageDraw.Draw(lun).ellipse([x0 + (x1 - x0) * 0.2, y0 - (y1 - y0) * 0.05, x1 - (x1 - x0) * 0.2, y0 + (y1 - y0) * 0.22], fill=255)
    lm = np.asarray(lun.filter(ImageFilter.GaussianBlur(1))).astype(np.float32) / 255 * m
    col = blend(col, lm, [0.97, 0.93, 0.91], 0.7)
    spec = lines_mask(w, h, [[(x0 + (x1 - x0) * 0.3, y0 + 2), (x0 + (x1 - x0) * 0.25, y1 - 3)]], max(1, w / 16), blur=w / 12) * m
    return blend(col, spec, [1.0, 1.0, 1.0], 0.45)


def paint_hand_face(rec, rng):
    x, y, w, h = [int(round(v)) for v in rec["rect"]]
    sem = rec["semantic"]
    meta = rec.get("meta", {})
    base = SKIN_PALM if ("front" in sem or sem in ("finger_tip", "thumb_tip")) else SKIN
    col = skin_patch(w, h, rng, base)
    if sem in ("finger_back", "thumb_back"):
        col = wrinkles(col, rng, [0.08, 0.14, 0.2, 0.84, 0.9], 0.25, 1.3)
        if rng.random() < 0.7:
            col = veins(col, rng, 1, strength=0.18, width=max(2, w // 12))
        col = edge_ao(col, 0.16, 0.30)
    elif sem in ("finger_front", "thumb_front"):
        col = wrinkles(col, rng, [0.06, 0.11, 0.9, 0.95], 0.35, 1.6)
        col = edge_ao(col, 0.14, 0.25)
    elif sem in ("finger_side", "thumb_side"):
        col = edge_ao(col, 0.14, 0.28)
        if rng.random() < 0.35:
            col = wrinkles(col, rng, [0.1, 0.9], 0.2, 1.2)
    elif sem in ("finger_nail", "thumb_nail"):
        col = wrinkles(col, rng, [0.08, 0.15, 0.22], 0.25, 1.3)
        col = nail(col, rng)
        col = edge_ao(col, 0.12, 0.2)
    elif sem in ("finger_joint", "thumb_joint"):
        col = col * 0.82
    elif sem in ("finger_tip", "thumb_tip"):
        rr = radial(w, h)
        col = col * (1 - 0.25 * smooth(rr, 0.2 * w, 0.6 * w))[..., None]
    elif sem == "palm_front":
        col = creases_palm(col, rng)
        col = edge_ao(col, 0.1, 0.25)
    elif sem == "palm_back":
        col = veins(col, rng, 6, strength=0.34, width=max(3, w // 60), lengthy=True)
        # tendones (crestas claras verticales sobre los nudillos)
        lines = [[(fx * w, 0.25 * h), (fx * w + rng.normal(0, 2), 0.92 * h)] for fx in (0.20, 0.40, 0.60, 0.80)]
        col = blend(col, lines_mask(w, h, lines, w / 22, blur=w / 20), [1.0, 0.94, 0.90], 0.12)
        col = wrinkles(col, rng, [0.90, 0.94, 0.97], 0.32, 1.6, wav=1.0)
        col = edge_ao(col, 0.08, 0.2)
    elif sem == "palm_side":
        col = veins(col, rng, 1, strength=0.2)
        col = edge_ao(col, 0.1, 0.25)
    elif sem == "palm_knuckle":
        col = wrinkles(col, rng, [0.3, 0.5, 0.7], 0.3, 1.5, wav=1.2)
        col = col * 0.9
    elif sem == "knuckle":
        rr = radial(w, h)
        col = col * (1 + 0.10 * (1 - smooth(rr, 0, 0.5 * min(w, h))))[..., None]
        col = wrinkles(col, rng, [0.3, 0.5, 0.7], 0.3, 1.2, wav=1.2)
    elif sem in ("wrist", "wrist_front"):
        col = veins(col, rng, 3, strength=0.28, width=max(3, w // 45), lengthy=True)
        if sem == "wrist_front":
            col = wrinkles(col, rng, [0.3, 0.42], 0.3, 2.0, wav=1.5)
        col = edge_ao(col, 0.1, 0.2)
    elif sem == "forearm":
        col = skin_patch(w, h, rng, SKIN, mottle=0.12)
        col = veins(col, rng, 4, strength=0.40, width=max(4, w // 22), along="y", lengthy=True)
        grad = np.linspace(0.70, 1.0, h, dtype=np.float32)
        col = col * grad[:, None, None]
        col = edge_ao(col, 0.06, 0.25, axis="x")
    elif sem.startswith("earth"):
        col = earth_patch(w, h, rng, sem)
    return (x, y, w, h), col


def earth_patch(w, h, rng, sem):
    if sem == "earth_top":
        base = np.array([0.36, 0.56, 0.22], np.float32)
        n = fbm(w, h, 6, 3, rng)
        col = base[None, None, :] * (0.75 + 0.5 * n[..., None])
        col[..., 1] *= 1 + 0.1 * (fbm(w, h, 12, 2, rng) - 0.5)
        return col
    if sem == "earth_bottom":
        base = np.array([0.50, 0.50, 0.50], np.float32)
        n = fbm(w, h, 5, 3, rng)
        col = base[None, None, :] * (0.7 + 0.6 * n[..., None])
        m = polygon_mask(w, h, [[(rng.uniform(0, w), rng.uniform(0, h)) for _ in range(4)] for _ in range(5)])
        return blend(col, m, [0.35, 0.35, 0.37], 0.5)
    base = np.array([0.46, 0.32, 0.22], np.float32)
    n = fbm(w, h, 5, 3, rng)
    col = base[None, None, :] * (0.7 + 0.6 * n[..., None])
    ys = np.arange(h, dtype=np.float32)[:, None] / max(h, 1)
    grass = np.clip((0.14 - ys) / 0.14, 0, 1) * (0.5 + 0.5 * fbm(w, h, 3, 1, rng))
    col = blend(col, grass * np.ones((h, w), np.float32), [0.34, 0.54, 0.2], 0.9)
    stones = polygon_mask(w, h, [[(rng.uniform(0, w) + math.cos(a) * rng.uniform(2, 5), rng.uniform(0.2, 1) * h + math.sin(a) * 3)
                                  for a in np.linspace(0, 6.28, 6)] for _ in range(max(2, w * h // 900))])
    return blend(col, stones, [0.48, 0.47, 0.46], 0.7)


def paint_hand_atlas(records, size=1024):
    cv = Canvas(size, size)
    for i, rec in enumerate(records):
        rng = np.random.default_rng(1000 + i)
        rect, col = paint_hand_face(rec, rng)
        cv.paste(rect, col)
    return cv.image()


def paint_forearm_atlas(records, size=1024):
    cv = Canvas(size, size)
    for i, rec in enumerate(records):
        rng = np.random.default_rng(5000 + i)
        rect, col = paint_hand_face(rec, rng)
        cv.paste(rect, col)
    return cv.image()


# ------------------------------------------------------------------- ojo --

def sclera_image(size, rng):
    w = h = size
    cx = cy = size / 2
    R = G.EYE_R * G.EYE_PX_PER_UNIT
    rr = radial(w, h, cx, cy)
    t = np.clip(rr / R, 0, 1.4)
    white = np.array([0.95, 0.93, 0.90], np.float32)
    rim = np.array([0.80, 0.66, 0.66], np.float32)
    col = white[None, None, :] * (1 - smooth(t, 0.45, 1.0))[..., None] + rim[None, None, :] * smooth(t, 0.45, 1.0)[..., None]
    col *= (1 + 0.04 * (fbm(w, h, 24, 3, rng) - 0.5))[..., None]
    # venas rojas desde el borde hacia el centro
    lines = []
    for _ in range(46):
        a = rng.uniform(0, 2 * math.pi)
        start = (cx + math.cos(a) * R * 1.05, cy + math.sin(a) * R * 1.05)
        pts = random_walk(rng, start, a + math.pi, int(rng.uniform(6, 22)), 7, drift=0.28)
        pts = [p for p in pts if math.hypot(p[0] - cx, p[1] - cy) > 75 * G.EYE_PX_PER_UNIT]
        lines.append(pts)
        if len(pts) > 5 and rng.random() < 0.7:
            k = rng.integers(2, len(pts) - 1)
            lines.append(random_walk(rng, pts[k], a + math.pi + rng.choice([-1, 1]) * 0.7, int(rng.uniform(3, 9)), 6, 0.3))
    m = lines_mask(w, h, lines, 2.2, blur=1.0)
    fade = smooth(t, 0.35, 0.95)
    col = blend(col, m * (0.35 + 0.65 * fade), [0.72, 0.16, 0.16], 0.55)
    m2 = lines_mask(w, h, lines[::2], 1.0, blur=0.4)
    col = blend(col, m2 * fade, [0.6, 0.1, 0.1], 0.5)
    # iris
    ir = 55 * G.EYE_PX_PER_UNIT
    pr = 17 * G.EYE_PX_PER_UNIT
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    ang = np.arctan2(ys + 0.5 - cy, xs + 0.5 - cx)
    u = np.clip(rr / ir, 0, 1.2)
    fib = np.zeros((h, w), np.float32)
    for k in range(3):
        fib += np.sin(ang * (90 + 50 * k) + k * 1.7 + np.sin(ang * (7 + 3 * k)) * 2) * (0.5 / (k + 1))
    fib += fbm(w, h, 6, 3, rng) - 0.5
    inner = np.array([0.56, 0.72, 0.80], np.float32)
    mid = np.array([0.33, 0.52, 0.66], np.float32)
    outer = np.array([0.10, 0.19, 0.30], np.float32)
    iris = inner[None, None, :] * (1 - smooth(u, 0.3, 0.65))[..., None] + mid[None, None, :] * smooth(u, 0.3, 0.65)[..., None]
    iris = iris * (1 - smooth(u, 0.72, 1.0))[..., None] + outer[None, None, :] * smooth(u, 0.72, 1.0)[..., None]
    iris *= (1 + 0.22 * fib)[..., None]
    iris *= (1 - 0.25 * smooth(u, 0.9, 1.0))[..., None]
    crypts = smooth(fbm(w, h, 10, 2, rng), 0.62, 0.8) * smooth(u, 0.35, 0.6) * (1 - smooth(u, 0.75, 0.9))
    iris = blend(iris, crypts, [0.08, 0.14, 0.22], 0.6)
    im = smooth(u, 1.0, 0.96)
    col = col * (1 - im[..., None]) + iris * im[..., None]
    # sombra del párpado superior sobre el iris
    shade = smooth((ys - cy) / ir, 0.1, -0.9) * smooth(u, 1.05, 0.5)
    col = col * (1 - 0.35 * shade)[..., None]
    # pupila
    pm = smooth(rr, pr + 3, pr - 2)
    col = col * (1 - pm[..., None]) + np.array([0.02, 0.02, 0.03], np.float32)[None, None, :] * pm[..., None]
    # brillos
    hl = smooth(radial(w, h, cx - 0.33 * ir, cy - 0.33 * ir), 0.19 * ir, 0.05 * ir)
    col = blend(col, hl, [1, 1, 1], 0.9)
    hl2 = smooth(radial(w, h, cx + 0.28 * ir, cy + 0.30 * ir), 0.09 * ir, 0.02 * ir)
    col = blend(col, hl2, [1, 1, 1], 0.6)
    alpha = np.ones((h, w), np.float32)
    return col, alpha


def pupil_image(size):
    rr = radial(size, size)
    a = smooth(rr, size * 0.47, size * 0.40)
    col = np.zeros((size, size, 3), np.float32) + 0.015
    col[..., 2] = 0.03
    return col, a


def lid_patch(w, h, rng, edge=False):
    col = skin_patch(w, h, rng, LID_SKIN, mottle=0.14, pores=0.06)
    if edge:
        col = col * 0.55
        return col
    col = wrinkles(col, rng, list(np.linspace(0.1, 0.9, 6) + rng.normal(0, 0.02, 6)), 0.28, 1.4, wav=1.4)
    col = edge_ao(col, 0.1, 0.18)
    return col


def socket_image(size, rng):
    rr = radial(size, size)
    t = rr / (size / 2)
    skin = np.array([0.42, 0.33, 0.30], np.float32)
    dark = np.array([0.04, 0.04, 0.08], np.float32)
    k = smooth(t, 0.55, 0.98)[..., None]
    col = skin[None, None, :] * (1 - k) + dark[None, None, :] * k
    col *= (1 + 0.12 * (fbm(size, size, 30, 3, rng) - 0.5))[..., None]
    lines = []
    for _ in range(70):
        a = rng.uniform(0, 2 * math.pi)
        r0 = rng.uniform(0.25, 0.45) * size / 2
        pts = random_walk(rng, (size / 2 + math.cos(a) * r0, size / 2 + math.sin(a) * r0), a, int(rng.uniform(8, 24)), 5, 0.18)
        lines.append(pts)
    col = blend(col, lines_mask(size, size, lines, 2.5, 1.2), [0.18, 0.12, 0.11], 0.45)
    alpha = smooth(t, 1.0, 0.985)
    return col, alpha


def paint_eye_atlas(records, size=1024):
    cv = Canvas(size, size)
    rng = np.random.default_rng(77)
    col, a = sclera_image(G.SCLERA_RECT[2], rng)
    cv.paste(G.SCLERA_RECT, col, a)
    col, a = pupil_image(G.PUPIL_RECT[2])
    cv.paste(G.PUPIL_RECT, col, a)
    col, a = socket_image(G.SOCKET_RECT[2], rng)
    cv.paste(G.SOCKET_RECT, col, a)
    for i, rec in enumerate(records):
        if rec["semantic"] not in ("lid", "lid_edge"):
            continue
        x, y, w, h = [int(round(v)) for v in rec["rect"]]
        r2 = np.random.default_rng(9000 + i)
        cv.paste((x, y, w, h), lid_patch(w, h, r2, edge=rec["semantic"] == "lid_edge"))
    return cv.image()


# ------------------------------------------------------- vidrio y agujero --

class CrackWeb:
    """Telaraña de grietas compartida por el vidrio, el agujero y el ícono."""

    def __init__(self, seed=7, n_rays=17, n_rings=8):
        rng = np.random.default_rng(seed)
        self.n_rays, self.n_rings = n_rays, n_rings
        self.base = np.linspace(0, 2 * math.pi, n_rays, endpoint=False) + rng.uniform(-0.09, 0.09, n_rays)
        self.rays = []
        for ang in self.base:
            pts, rr, a = [], 0.05, ang
            r_end = rng.uniform(0.78, 1.0)
            while rr < r_end:
                pts.append((rr, a))
                rr += 0.028 * rng.uniform(0.8, 1.2)
                a += rng.normal(0, 0.05)
            pts.append((r_end, a))
            self.rays.append(pts)
        r0 = HOLE_R_SMALL / (GLASS_SIZE / 2)
        self.ring_r = [r0 * (1 / r0) ** ((k + 1) / (n_rings + 1)) for k in range(n_rings)]
        self.ring_jit = rng.uniform(0.94, 1.06, (n_rings, n_rays))
        self.ring_gap = rng.random((n_rings, n_rays)) < 0.16
        self.ring_mid = rng.uniform(-0.012, 0.012, (n_rings, n_rays))
        self.secondary = []
        for i in range(n_rays):
            for k in (1, 3, 5):
                if rng.random() < 0.6:
                    self.secondary.append((i, k, rng.uniform(0.25, 0.7), rng.uniform(0.3, 0.7), rng.normal(0, 0.05)))
        self.hole_shape = rng.uniform(0.82, 1.18, 2 * n_rays)
        self.shine = rng.random((n_rings, n_rays)) < 0.45
        self.shine_a = rng.uniform(0.05, 0.16, (n_rings, n_rays))
        self.extra = [(rng.uniform(0, 2 * math.pi), rng.uniform(0.2, 0.9), int(rng.uniform(3, 8)), rng.normal(0, 0.1)) for _ in range(40)]

    def ray_angle(self, i, rr):
        pts = self.rays[i]
        if rr <= pts[0][0]:
            return pts[0][1]
        for (r0, a0), (r1, a1) in zip(pts, pts[1:]):
            if r0 <= rr <= r1:
                t = (rr - r0) / max(r1 - r0, 1e-6)
                return a0 + (a1 - a0) * t
        return pts[-1][1]

    def ray_xy(self, i, rr):
        a = self.ray_angle(i, rr)
        return (math.cos(a) * rr, math.sin(a) * rr)

    def hole_polygon(self, radius):
        angs = []
        for i in range(self.n_rays):
            a0 = self.base[i]
            a1 = self.base[(i + 1) % self.n_rays] + (2 * math.pi if i == self.n_rays - 1 else 0)
            angs += [a0, (a0 + a1) / 2]
        return [(math.cos(a) * radius * s, math.sin(a) * radius * s) for a, s in zip(angs, self.hole_shape)]

    def render_glass(self, size, stage):
        cx = cy = size / 2
        S = size / 2
        def P(xy):
            return (cx + xy[0] * S, cy + xy[1] * S)
        core, glow = [], []       # (points, width)
        max_r = 0.34 if stage == 1 else 1.0
        n_rings = 3 if stage == 1 else self.n_rings
        wscale = 0.75 if stage == 1 else 1.0
        for i, pts in enumerate(self.rays):
            seg = [(rr, a) for rr, a in pts if rr <= max_r]
            if stage == 1 and i % 2 == 1:
                seg = seg[: max(2, len(seg) // 2)]
            for (r0, a0), (r1, a1) in zip(seg, seg[1:]):
                wdt = (5.2 - 3.6 * r0) * wscale
                core.append(([P((math.cos(a0) * r0, math.sin(a0) * r0)), P((math.cos(a1) * r1, math.sin(a1) * r1))], wdt))
        for k in range(n_rings):
            for i in range(self.n_rays):
                if self.ring_gap[k, i] or (stage == 3 and k == 0 and i % 3 == 0):
                    continue
                j = (i + 1) % self.n_rays
                rr = self.ring_r[k] * self.ring_jit[k, i]
                if rr > max_r:
                    continue
                p0 = self.ray_xy(i, rr)
                p1 = self.ray_xy(j, rr * self.ring_jit[k, j] / self.ring_jit[k, i])
                mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
                mr = math.hypot(*mid) or 1
                mid = (mid[0] * (1 + self.ring_mid[k, i] / mr), mid[1] * (1 + self.ring_mid[k, i] / mr))
                core.append(([P(p0), P(mid), P(p1)], (2.6 - 1.2 * rr) * wscale))
        if stage >= 2:
            for i, k, frac, off, drift in self.secondary:
                r0 = self.ring_r[k]
                j = (i + 1) % self.n_rays
                a = self.ray_angle(i, r0) * (1 - off) + (self.ray_angle(j, r0) + (2 * math.pi if j == 0 else 0)) * off
                pts = [(math.cos(a) * r0, math.sin(a) * r0)]
                rr = r0
                while rr < min(1.0, r0 + frac):
                    rr += 0.03
                    a += drift
                    pts.append((math.cos(a) * rr, math.sin(a) * rr))
                core.append(([P(p) for p in pts], 1.6))
        if stage == 3:
            for a, rr, n, drift in self.extra:
                pts = []
                for s in range(n):
                    pts.append((math.cos(a) * rr, math.sin(a) * rr))
                    rr += 0.02
                    a += drift
                core.append(([P(p) for p in pts], 1.2))
        img_core = Image.new("L", (size, size), 0)
        img_glow = Image.new("L", (size, size), 0)
        dc, dg = ImageDraw.Draw(img_core), ImageDraw.Draw(img_glow)
        for pts, wdt in core:
            dc.line(pts, fill=255, width=max(1, int(round(wdt))), joint="curve")
            dg.line(pts, fill=255, width=max(2, int(round(wdt * 3))), joint="curve")
        cm = np.asarray(img_core.filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32) / 255
        gm = np.asarray(img_glow.filter(ImageFilter.GaussianBlur(5))).astype(np.float32) / 255
        # celdas con reflejo
        polys, alphas = [], []
        rings = [HOLE_R_SMALL / (GLASS_SIZE / 2)] + self.ring_r
        for k in range(min(5, n_rings)):
            for i in range(self.n_rays):
                if not self.shine[k, i]:
                    continue
                j = (i + 1) % self.n_rays
                ra, rb = rings[k], rings[k + 1]
                quad = [self.ray_xy(i, ra), self.ray_xy(i, rb), self.ray_xy(j, rb), self.ray_xy(j, ra)]
                polys.append([P(q) for q in quad])
                alphas.append(self.shine_a[k, i] * (1 - k / 6))
        shine = np.zeros((size, size), np.float32)
        for poly, al in zip(polys, alphas):
            shine = np.maximum(shine, polygon_mask(size, size, [poly]) * al)
        rr = radial(size, size) / S
        halo = (1 - smooth(rr, 0.14, 0.40)) * 0.20 * (1.0 if stage >= 2 else 0.4)
        a_core = cm * 0.95
        a_glow = gm * 0.42
        a_sh = np.clip(shine + halo, 0, 1)
        alpha = 1 - (1 - a_core) * (1 - a_glow) * (1 - a_sh)
        col = (np.array([1, 1, 1], np.float32)[None, None, :] * a_core[..., None]
               + np.array([0.78, 0.90, 1.0], np.float32)[None, None, :] * (a_glow * (1 - a_core))[..., None]
               + np.array([0.93, 0.97, 1.0], np.float32)[None, None, :] * (a_sh * (1 - a_core) * (1 - a_glow))[..., None])
        col = col / np.maximum(alpha, 1e-4)[..., None]
        out = np.dstack([np.clip(col, 0, 1), np.clip(alpha, 0, 1)])
        return Image.fromarray((out * 255).astype(np.uint8), "RGBA")

    def render_hole(self, size, radius_units, units_per_px, rng):
        cx = cy = size / 2
        poly = [(cx + x / units_per_px, cy + y / units_per_px) for x, y in self.hole_polygon(radius_units)]
        m = polygon_mask(size, size, [poly])
        rim = lines_mask(size, size, [poly + [poly[0]]], 3, blur=0.6)
        rim_glow = lines_mask(size, size, [poly + [poly[0]]], 9, blur=6)
        rr = radial(size, size)
        dark = np.array([0.03, 0.035, 0.07], np.float32)
        navy = np.array([0.07, 0.08, 0.17], np.float32)
        k = (1 - smooth(rr, 0, size * 0.38))[..., None]
        col = dark[None, None, :] * (1 - k) + navy[None, None, :] * k
        stars = np.zeros((size, size), np.float32)
        for _ in range(90):
            sx, sy = rng.uniform(0, size), rng.uniform(0, size)
            stars = np.maximum(stars, smooth(radial(size, size, sx, sy), 1.6, 0.3) * rng.uniform(0.25, 0.9))
        col = blend(col, stars * m, [0.9, 0.92, 1.0], 1.0)
        col = blend(col, rim_glow, [0.75, 0.88, 1.0], 0.55)
        col = blend(col, rim, [1, 1, 1], 0.95)
        alpha = np.clip(np.maximum(m, np.maximum(rim, rim_glow * 0.9)), 0, 1)
        out = np.dstack([np.clip(col, 0, 1), alpha])
        return Image.fromarray((out * 255).astype(np.uint8), "RGBA")


def light_image(size):
    rr = radial(size, size) / (size / 2)
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float32)
    ang = np.arctan2(ys - size / 2, xs - size / 2)
    rays = 0.5 + 0.5 * np.cos(ang * 14)
    rays = rays ** 6 * smooth(rr, 0.25, 0.6) * (1 - smooth(rr, 0.6, 1.0))
    core = 1 - smooth(rr, 0.0, 0.55)
    alpha = np.clip(core + rays * 0.6, 0, 1)
    col = np.array([1, 1, 1], np.float32)[None, None, :] * (1 - smooth(rr, 0.1, 0.5))[..., None] \
        + np.array([0.70, 0.88, 1.0], np.float32)[None, None, :] * smooth(rr, 0.1, 0.5)[..., None]
    return Image.fromarray((np.dstack([col, alpha]) * 255).astype(np.uint8), "RGBA")


def paint_hole_atlas(web, size=1024):
    cv = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rng = np.random.default_rng(3)
    cv.paste(web.render_hole(G.HOLE_SMALL_RECT[2], HOLE_R_SMALL, HOLE_SMALL_QUAD / G.HOLE_SMALL_RECT[2], rng), (G.HOLE_SMALL_RECT[0], G.HOLE_SMALL_RECT[1]))
    cv.paste(web.render_hole(G.HOLE_BIG_RECT[2], HOLE_R_BIG, HOLE_BIG_QUAD / G.HOLE_BIG_RECT[2], rng), (G.HOLE_BIG_RECT[0], G.HOLE_BIG_RECT[1]))
    cv.paste(light_image(G.LIGHT_RECT[2]), (G.LIGHT_RECT[0], G.LIGHT_RECT[1]))
    return cv


# ------------------------------------------------------------ partículas --

def shard_image(size, rng):
    cx = cy = size / 2
    n = int(rng.integers(5, 8))
    angs = np.sort(rng.uniform(0, 2 * math.pi, n))
    pts = [(cx + math.cos(a) * rng.uniform(0.26, 0.47) * size, cy + math.sin(a) * rng.uniform(0.26, 0.47) * size) for a in angs]
    m = polygon_mask(size, size, [pts])
    edge = lines_mask(size, size, [pts + [pts[0]]], 2.2, blur=0.4)
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float32)
    streak = np.exp(-((xs - ys + rng.uniform(-8, 8)) ** 2) / (2 * (size * 0.08) ** 2))
    col = np.array([0.78, 0.88, 1.0], np.float32)[None, None, :] * np.ones((size, size, 1), np.float32)
    col = blend(col, streak, [1, 1, 1], 0.7)
    col = blend(col, edge, [1, 1, 1], 1.0)
    alpha = np.clip(m * (0.50 + 0.35 * streak) + edge, 0, 1)
    return Image.fromarray((np.dstack([col, alpha]) * 255).astype(np.uint8), "RGBA")


def dust_image(size, rng):
    acc = np.zeros((size, size), np.float32)
    for _ in range(int(rng.integers(9, 15))):
        a, d = rng.uniform(0, 2 * math.pi), rng.uniform(0, size * 0.22)
        sx, sy = size / 2 + math.cos(a) * d, size / 2 + math.sin(a) * d
        sig = rng.uniform(size * 0.12, size * 0.26)
        acc += np.exp(-radial(size, size, sx, sy) ** 2 / (2 * sig ** 2)) * rng.uniform(0.5, 1.0)
    acc /= acc.max()
    alpha = np.clip(acc * 1.3, 0, 1) * (1 - smooth(radial(size, size) / (size / 2), 0.7, 1.0))
    alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2))).astype(np.float32) / 255
    shade = 0.85 + 0.15 * (1 - acc)
    col = np.dstack([shade, shade * 0.98, shade * 0.95])
    return Image.fromarray((np.dstack([col, alpha]) * 255).astype(np.uint8), "RGBA")


def glow_image(size, power=2.0):
    rr = radial(size, size) / (size / 2)
    alpha = np.clip(1 - rr, 0, 1) ** power
    col = np.ones((size, size, 3), np.float32)
    return Image.fromarray((np.dstack([col, alpha]) * 255).astype(np.uint8), "RGBA")


def ring_image(size):
    rr = radial(size, size) / (size / 2)
    alpha = smooth(rr, 0.55, 0.8) * (1 - smooth(rr, 0.85, 1.0))
    col = np.ones((size, size, 3), np.float32)
    return Image.fromarray((np.dstack([col, alpha]) * 255).astype(np.uint8), "RGBA")


def flash_image(size):
    rr = radial(size, size) / (size / 2)
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float32) - size / 2
    star = np.exp(-np.abs(xs) / (size * 0.02)) + np.exp(-np.abs(ys) / (size * 0.02))
    star += 0.6 * (np.exp(-np.abs(xs - ys) / (size * 0.025)) + np.exp(-np.abs(xs + ys) / (size * 0.025)))
    alpha = np.clip(np.clip(1 - rr, 0, 1) ** 1.5 * 1.2 + star * (1 - smooth(rr, 0.3, 1.0)) * 0.6, 0, 1)
    col = np.ones((size, size, 3), np.float32)
    return Image.fromarray((np.dstack([col, alpha]) * 255).astype(np.uint8), "RGBA")


def debris_image(size, rng):
    cx = cy = size / 2
    angs = np.sort(rng.uniform(0, 2 * math.pi, int(rng.integers(5, 8))))
    pts = [(cx + math.cos(a) * rng.uniform(0.25, 0.48) * size, cy + math.sin(a) * rng.uniform(0.25, 0.48) * size) for a in angs]
    m = polygon_mask(size, size, [pts])
    base = np.array(rng.choice([[0.42, 0.30, 0.20], [0.50, 0.50, 0.50], [0.36, 0.26, 0.18], [0.33, 0.50, 0.22]]), np.float32)
    n = fbm(size, size, 4, 2, rng)
    col = base[None, None, :] * (0.7 + 0.6 * n[..., None])
    return Image.fromarray((np.dstack([col, m]) * 255).astype(np.uint8), "RGBA")


def strip(images):
    w = sum(i.width for i in images)
    out = Image.new("RGBA", (w, images[0].height), (0, 0, 0, 0))
    x = 0
    for i in images:
        out.paste(i, (x, 0))
        x += i.width
    return out


# ---------------------------------------------------------------- varita --

WAND_STAGES = {
    0: ([0.45, 0.85, 1.00], [0.85, 0.97, 1.0], 0.55),
    1: ([0.62, 0.93, 1.00], [1.0, 1.0, 1.0], 0.85),
    2: ([0.95, 0.99, 1.00], [1.0, 1.0, 1.0], 1.0),
    3: ([0.28, 0.42, 0.56], [0.55, 0.65, 0.75], 0.25),
}


def wand_face(rec, rng, stage):
    x, y, w, h = [int(round(v)) for v in rec["rect"]]
    sem = rec["semantic"]
    cry, core, ring_a = WAND_STAGES[stage]
    if sem in ("wood", "wood_dark"):
        base = np.array([0.30, 0.20, 0.14], np.float32) * (0.8 if sem == "wood_dark" else 1.0)
        n = fbm(w, h, 2, 2, rng)
        grain = 0.5 + 0.5 * np.sin(np.arange(w)[None, :] * 2.1 + fbm(w, h, 6, 2, rng) * 6)
        col = base[None, None, :] * (0.75 + 0.35 * n[..., None]) * (0.85 + 0.3 * grain[..., None])
        return (x, y, w, h), col, np.ones((h, w), np.float32)
    if sem == "leather":
        col = np.array([0.16, 0.12, 0.10], np.float32)[None, None, :] * (0.8 + 0.4 * fbm(w, h, 2, 2, rng))[..., None]
        return (x, y, w, h), col, np.ones((h, w), np.float32)
    if sem == "gold":
        ys = np.arange(h, dtype=np.float32)[:, None] / max(h, 1)
        shade = 0.75 + 0.5 * np.exp(-((ys - 0.35) ** 2) / 0.05)
        col = np.array([0.85, 0.66, 0.28], np.float32)[None, None, :] * shade[..., None] * np.ones((h, w, 1), np.float32)
        return (x, y, w, h), col, np.ones((h, w), np.float32)
    if sem in ("crystal", "crystal_core"):
        ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
        d = (xs / max(w, 1) + ys / max(h, 1)) / 2
        c = np.array(core if sem == "crystal_core" else cry, np.float32)
        col = c[None, None, :] * (0.78 + 0.45 * d[..., None])
        col = blend(col, (d > 0.65).astype(np.float32), [1, 1, 1], 0.35)
        return (x, y, w, h), col, np.ones((h, w), np.float32)
    return (x, y, w, h), np.zeros((h, w, 3), np.float32), np.zeros((h, w), np.float32)


def paint_wand_atlas(records, stage, size=256):
    cv = Canvas(size, size)
    for i, rec in enumerate(records):
        if rec["semantic"] == "ring":
            continue
        rng = np.random.default_rng(300 + i)
        rect, col, a = wand_face(rec, rng, stage)
        cv.paste(rect, col, a)
    img = cv.image()
    cry, core, ring_a = WAND_STAGES[stage]
    for rect, thick in ((G.RING_A_RECT, (0.70, 0.86)), (G.RING_B_RECT, (0.74, 0.84))):
        s = rect[2]
        rr = radial(s, s) / (s / 2)
        band = smooth(rr, thick[0] - 0.08, thick[0]) * (1 - smooth(rr, thick[1], thick[1] + 0.08))
        ys, xs = np.mgrid[0:s, 0:s].astype(np.float32)
        ang = np.arctan2(ys - s / 2, xs - s / 2)
        runes = (np.sin(ang * 12) > 0.3).astype(np.float32) * smooth(rr, 0.76, 0.78) * (1 - smooth(rr, 0.80, 0.82))
        alpha = np.clip(band * (0.55 + 0.45 * ring_a) + runes * 0.5, 0, 1)
        col = np.array(cry, np.float32)[None, None, :] * np.ones((s, s, 1), np.float32)
        col = blend(col, runes, [1, 1, 1], 0.8)
        ring = Image.fromarray((np.dstack([col, alpha]) * 255).astype(np.uint8), "RGBA")
        img.paste(ring, (rect[0], rect[1]), ring)
    return img


def wand_icon(size=32):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i in range(22):
        x, y = 5 + i * 0.78, 27 - i * 0.78
        c = (70, 46, 30, 255) if i % 5 else (55, 36, 24, 255)
        d.rectangle([x, y, x + 2, y + 2], fill=c)
        d.point((x + 2, y), fill=(120, 88, 60, 255))
    for i in (3, 6):
        x, y = 5 + i * 0.78, 27 - i * 0.78
        d.rectangle([x - 1, y - 1, x + 3, y + 3], outline=(38, 28, 22, 255))
    d.rectangle([19, 9, 24, 14], fill=(201, 162, 74, 255))
    d.rectangle([20, 10, 23, 13], fill=(0, 0, 0, 0))
    d.polygon([(25, 2), (29, 6), (25, 10), (21, 6)], fill=(120, 225, 255, 255))
    d.polygon([(25, 4), (27, 6), (25, 8), (23, 6)], fill=(230, 250, 255, 255))
    for px, py in ((18, 4), (30, 10), (16, 11), (29, 2)):
        d.point((px, py), fill=(200, 245, 255, 255))
    return img


def pack_icon(web, size=256):
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float32)
    t = ys / size
    col = np.array([0.42, 0.66, 0.95], np.float32)[None, None, :] * (1 - t)[..., None] + np.array([0.70, 0.84, 0.98], np.float32)[None, None, :] * t[..., None]
    bg = Image.fromarray((np.dstack([col, np.ones((size, size), np.float32)]) * 255).astype(np.uint8), "RGBA")
    glass = web.render_glass(size, 2)
    bg.alpha_composite(glass)
    rng = np.random.default_rng(1)
    hole = web.render_hole(int(size * 0.5), HOLE_R_SMALL, HOLE_SMALL_QUAD / (size * 0.5), rng)
    bg.alpha_composite(hole, (int(size * 0.25), int(size * 0.25)))
    scl, _ = sclera_image(int(size * 0.26), rng)
    eye = Image.fromarray((np.clip(scl, 0, 1) * 255).astype(np.uint8), "RGB").convert("RGBA")
    rr = radial(eye.width, eye.height) / (eye.width / 2)
    a = (1 - smooth(rr, 0.9, 1.0)) * 255
    eye.putalpha(Image.fromarray(a.astype(np.uint8)))
    bg.alpha_composite(eye, (int(size * 0.37), int(size * 0.37)))
    return bg
