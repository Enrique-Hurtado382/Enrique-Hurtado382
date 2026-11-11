"""Generador de geometrías Bedrock (.geo.json) para Cielo Roto.

Construye el modelo del cielo roto (vidrio, agujero, ojo, brazo y mano), el fragmento
de vidrio y la varita. Cada cara de cada cubo recibe una región UV propia dentro de
un atlas; las regiones se devuelven al pintor de texturas para que dibuje cada cara
según su semántica ("piel del dorso", "uña", "esclerótica", etc.).
"""
import math
from .common import (
    GLASS_SIZE, HOLE_QUAD_Y, SOCKET_Y, LIGHT_Y, EYE_R, LID_R, EYE_CENTER_Y,
    SOCKET_SIZE, FOREARM_L0, FOREARM_W, HOLE_SMALL_QUAD, HOLE_BIG_QUAD, r,
)

FACES = ["north", "south", "east", "west", "up", "down"]
SIDES = ["north", "south", "east", "west"]

# Regiones fijas dentro de los atlas (px)
GLASS_RECT = (0, 0, 1024, 1024)
HOLE_SMALL_RECT = (0, 0, 480, 480)
HOLE_BIG_RECT = (512, 0, 512, 512)
LIGHT_RECT = (0, 512, 256, 256)
SOCKET_RECT = (640, 640, 320, 320)
SCLERA_RECT = (0, 0, 544, 544)       # proyección frontal del globo ocular
PUPIL_RECT = (560, 0, 96, 96)
EYE_PX_PER_UNIT = 2.0
SCLERA_CENTER = (272, 272)

EYE_ROWS = [-100, -67, -33, 0, 33, 67, 100]
EYE_COLS = [-100, -67, -33, 0, 33, 67, 100]
LID_ROWS_UPPER = [15, 45, 75]
LID_ROWS_LOWER = [-15, -45, -75]
LID_COLS = [-100, -67, -33, 0, 33, 67, 100]

FINGER_X = [-72, -24, 24, 72]                      # meñique -> índice (pulgar en +X)
FINGER_LEN = [(58, 44, 40), (72, 54, 48), (78, 58, 50), (72, 54, 48)]
FINGER_W = [42, 44, 46, 44]
THUMB_BASE = (86, -62, 22)
THUMB_LEN = (84, 66)
THUMB_W = (52, 46)
THUMB_REST_Z = 55
PALM_TOP = -8


def face_dims(size, face):
    sx, sy, sz = size
    if face in ("north", "south"):
        return sx, sy
    if face in ("east", "west"):
        return sz, sy
    return sx, sz


class Atlas:
    def __init__(self, name, w, h, pad=2):
        self.name, self.w, self.h, self.pad = name, w, h, pad
        self.requests = []

    def request(self, fw, fh, rec):
        self.requests.append((fw, fh, rec))

    def pack(self, regions=None):
        """Empaquetado por estantes dentro de una o varias regiones libres (x, y, w, h)."""
        regions = list(regions) if regions else [(0, 0, self.w, self.h)]
        items = sorted(self.requests, key=lambda t: (-t[1], -t[0]))
        bins = [{"rect": rg, "shelves": [], "y": rg[1]} for rg in regions]
        for fw, fh, rec in items:
            placed = False
            for b in bins:
                rx, ry, rw, rh = b["rect"]
                for sh in b["shelves"]:
                    if fh <= sh[1] and sh[2] + fw + self.pad <= rx + rw:
                        rec["rect"] = (sh[2], sh[0], fw, fh)
                        sh[2] += fw + self.pad
                        placed = True
                        break
                if placed:
                    break
                if b["y"] + fh + self.pad <= ry + rh and fw + self.pad <= rw:
                    b["shelves"].append([b["y"], fh, rx + fw + self.pad])
                    rec["rect"] = (rx, b["y"], fw, fh)
                    b["y"] += fh + self.pad
                    placed = True
                    break
            if not placed:
                raise RuntimeError(f"Atlas {self.name} lleno")


def _overlap(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah


class Geo:
    def __init__(self, ident, tex_w, tex_h, vis=(2, 2, (0, 0, 0))):
        self.ident, self.tex_w, self.tex_h, self.vis = ident, tex_w, tex_h, vis
        self.bones = []
        self.atlases = {}
        self.reserved = {}
        self.records = []

    def atlas(self, name, w=None, h=None, regions=None):
        self.atlases[name] = Atlas(name, w or self.tex_w, h or self.tex_h)
        self.reserved[name] = regions
        return self.atlases[name]

    def bone(self, name, pivot, parent=None, rotation=None, binding=None):
        b = {"name": name, "pivot": r(list(pivot)), "cubes": []}
        if parent is not None:
            b["parent"] = parent["name"] if isinstance(parent, dict) else parent
        if rotation:
            b["rotation"] = r(list(rotation))
        if binding:
            b["binding"] = binding
        self.bones.append(b)
        return b

    def cube(self, bone, origin, size, atlas=None, semantic="default", faces=None, scale=1.0,
             rotation=None, pivot=None, inflate=None, only=None, fixed=None, meta=None):
        cube = {"origin": r(list(origin)), "size": r(list(size))}
        if rotation:
            cube["rotation"] = r(list(rotation))
        if pivot:
            cube["pivot"] = r(list(pivot))
        if inflate:
            cube["inflate"] = inflate
        uv = {}
        for face in FACES:
            if only and face not in only:
                continue
            fw, fh = face_dims(size, face)
            sem = (faces or {}).get(face, semantic)
            rec = {"atlas": atlas, "bone": bone["name"], "face": face, "semantic": sem,
                   "size": (fw, fh), "meta": meta or {}}
            if fixed and face in fixed:
                rec["rect"] = tuple(fixed[face])
                self.records.append(rec)
                uv[face] = rec
                continue
            if fw <= 0 or fh <= 0:
                continue
            pw = max(2, int(round(fw * scale)))
            ph = max(2, int(round(fh * scale)))
            self.atlases[atlas].request(pw, ph, rec)
            self.records.append(rec)
            uv[face] = rec
        cube["uv"] = uv
        bone["cubes"].append(cube)
        return cube

    def finalize(self):
        for name, a in self.atlases.items():
            a.pack(self.reserved.get(name))
        for b in self.bones:
            for c in b["cubes"]:
                for face, rec in list(c["uv"].items()):
                    u, v, w, h = rec["rect"]
                    c["uv"][face] = {"uv": [u, v], "uv_size": [w, h]}
            if not b["cubes"]:
                del b["cubes"]
        desc = {
            "identifier": self.ident,
            "texture_width": self.tex_w,
            "texture_height": self.tex_h,
            "visible_bounds_width": self.vis[0],
            "visible_bounds_height": self.vis[1],
            "visible_bounds_offset": list(self.vis[2]),
        }
        return {"format_version": "1.16.0", "minecraft:geometry": [{"description": desc, "bones": self.bones}]}

    def records_for(self, atlas):
        return [rec for rec in self.records if rec["atlas"] == atlas]

    def bone_names(self):
        return [b["name"] for b in self.bones]


# ---------------------------------------------------------------- ojo ----

def eye_proj_rect(phi, theta, w, d):
    """Rectángulo UV (px) de una faceta del globo ocular proyectada desde abajo."""
    k = EYE_PX_PER_UNIT
    ph, th = math.radians(phi), math.radians(theta)
    cx = EYE_R * math.sin(th)
    cz = EYE_R * math.cos(th) * math.sin(ph)
    hu = max(1.0, (w / 2) * abs(math.cos(th)))
    hv = max(1.0, (d / 2) * abs(math.cos(ph)))
    u0 = SCLERA_CENTER[0] + (cx - hu) * k
    v0 = SCLERA_CENTER[1] + (cz - hv) * k
    return (round(u0, 2), round(v0, 2), round(2 * hu * k, 2), round(2 * hv * k, 2))


def build_eye(g, parent):
    C = (0, EYE_CENTER_Y, 0)
    eye_root = g.bone("eye_root", C, parent)
    socket = g.bone("socket", C, eye_root)
    hs = SOCKET_SIZE / 2
    g.cube(socket, [-hs, SOCKET_Y, -hs], [SOCKET_SIZE, 0, SOCKET_SIZE], atlas="eye",
           fixed={"down": SOCKET_RECT}, only=["down"], semantic="socket")

    gaze_w = g.bone("gaze_wander", C, eye_root)
    gaze = g.bone("gaze", C, gaze_w)
    dth = math.radians(EYE_COLS[1] - EYE_COLS[0])
    dph = math.radians(EYE_ROWS[1] - EYE_ROWS[0])
    w = EYE_R * dth * 1.12
    d = EYE_R * dph * 1.12
    for ri, phi in enumerate(EYE_ROWS):
        rb = g.bone(f"eye_r{ri}", C, gaze, rotation=[phi, 0, 0])
        for ci, th in enumerate(EYE_COLS):
            rect = eye_proj_rect(phi, th, w, d)
            g.cube(rb, [-w / 2, EYE_CENTER_Y - EYE_R, -d / 2], [w, 0, d], atlas="eye",
                   fixed={"down": rect}, only=["down"], rotation=[0, 0, th], pivot=C,
                   semantic="sclera", meta={"phi": phi, "theta": th})
    pulse = g.bone("pupil_pulse", C, gaze)
    pupil = g.bone("pupil", (0, EYE_CENTER_Y - EYE_R - 2, 0), pulse)
    g.cube(pupil, [-24, EYE_CENTER_Y - EYE_R - 2, -24], [48, 0, 48], atlas="eye",
           fixed={"down": PUPIL_RECT}, only=["down"], semantic="pupil")

    lw = LID_R * math.radians(LID_COLS[1] - LID_COLS[0]) * 1.12
    ld = LID_R * math.radians(30) * 1.12
    for lid_name, rows in (("lid_upper", LID_ROWS_UPPER), ("lid_lower", LID_ROWS_LOWER)):
        lid = g.bone(lid_name, C, eye_root)
        for ri, phi in enumerate(rows):
            rb = g.bone(f"{lid_name}_r{ri}", C, lid, rotation=[phi, 0, 0])
            for ci, th in enumerate(LID_COLS):
                g.cube(rb, [-lw / 2, EYE_CENTER_Y - LID_R - 1.5, -ld / 2], [lw, 3, ld], atlas="eye",
                       semantic="lid", faces={"north": "lid_edge", "south": "lid_edge",
                                              "east": "lid_edge", "west": "lid_edge"},
                       only=["north", "south", "east", "west", "down"],
                       scale=0.9, rotation=[0, 0, th], pivot=C,
                       meta={"row": ri, "lid": lid_name, "theta": th})
    return eye_root


# --------------------------------------------------------------- mano ----

def seg(g, bone, x, ytop, L, w, z=0.0, kind="finger", tip=False, scale=0.9):
    """Segmento de dedo: dos cajas giradas 45° (sección octogonal)."""
    faces = {"north": f"{kind}_back", "south": f"{kind}_front", "east": f"{kind}_side",
             "west": f"{kind}_side", "up": f"{kind}_joint", "down": f"{kind}_joint"}
    meta = {"tip": tip, "L": L, "w": w}
    if tip:
        faces["north"] = f"{kind}_nail"
        faces["down"] = f"{kind}_tip"
    g.cube(bone, [x - w / 2, ytop - L, z - w / 2], [w, L, w], atlas="hand", faces=faces,
           semantic=f"{kind}_side", scale=scale, meta=meta)
    w2 = w * 0.94
    g.cube(bone, [x - w2 / 2, ytop - L + 1, z - w2 / 2], [w2, L - 2, w2], atlas="hand",
           semantic=f"{kind}_side", faces={"up": f"{kind}_joint", "down": f"{kind}_joint"},
           scale=scale, rotation=[0, 45, 0], pivot=[x, ytop - L / 2, z], meta=meta)


def build_hand(g, hand):
    # Muñeca (solapa con el extremo del antebrazo)
    g.cube(hand, [-70, -10, -52], [140, 70, 104], atlas="hand", semantic="wrist",
           faces={"south": "wrist_front"}, scale=1.0)
    palm = g.bone("palm", (0, 0, 0), hand)
    g.cube(palm, [-95, -200, -35], [190, 200 + PALM_TOP * -1, 70], atlas="hand", semantic="palm_side",
           faces={"south": "palm_front", "north": "palm_back", "up": "palm_side", "down": "palm_knuckle"},
           scale=1.2)
    # Bultos de los nudillos
    for i, x in enumerate(FINGER_X):
        wk = FINGER_W[i] - 4
        g.cube(palm, [x - wk / 2, -210, -44], [wk, 34, 26], atlas="hand", semantic="knuckle",
               scale=1.0, meta={"finger": i})
    # Dedos
    for i, x in enumerate(FINGER_X):
        La, Lb, Lc = FINGER_LEN[i]
        w = FINGER_W[i]
        fa = g.bone(f"f{i}_a", (x, -196, 0), palm)
        seg(g, fa, x, -196, La, w)
        fb = g.bone(f"f{i}_b", (x, -196 - La, 0), fa)
        seg(g, fb, x, -196 - La, Lb, w - 4)
        fc = g.bone(f"f{i}_c", (x, -196 - La - Lb, 0), fb)
        seg(g, fc, x, -196 - La - Lb, Lc, w - 7, tip=True)
    # Pulgar: hueso raíz (gira en Y) -> t_a (inclinado en Z) -> t_b
    tx, ty, tz = THUMB_BASE
    thumb = g.bone("thumb", (tx, ty, tz), palm)
    ta = g.bone("t_a", (tx, ty, tz), thumb, rotation=[0, 0, THUMB_REST_Z])
    seg(g, ta, tx, ty, THUMB_LEN[0], THUMB_W[0], z=tz, kind="thumb")
    tb = g.bone("t_b", (tx, ty - THUMB_LEN[0], tz), ta)
    seg(g, tb, tx, ty - THUMB_LEN[0], THUMB_LEN[1], THUMB_W[1], z=tz, kind="thumb", tip=True)
    # Pedazo de terreno que la mano arranca
    chunk = g.bone("chunk", (0, -150, 90), palm)
    ef = {"up": "earth_top", "down": "earth_bottom"}
    g.cube(chunk, [-72, -205, 42], [144, 104, 100], atlas="hand", semantic="earth_side", faces=ef, scale=0.8)
    g.cube(chunk, [-44, -126, 62], [92, 62, 72], atlas="hand", semantic="earth_side", faces=ef, scale=0.8,
           rotation=[0, 25, 0], pivot=[2, -95, 98])
    g.cube(chunk, [-96, -176, 92], [74, 74, 62], atlas="hand", semantic="earth_side", faces=ef, scale=0.8,
           rotation=[0, -20, 0], pivot=[-59, -139, 123])
    g.cube(chunk, [18, -190, 110], [70, 60, 54], atlas="hand", semantic="earth_side", faces=ef, scale=0.8,
           rotation=[0, 35, 0], pivot=[53, -160, 137])
    return palm


def build_arm(g, parent):
    arm_root = g.bone("arm_root", (0, 0, 0), parent)
    forearm = g.bone("forearm", (0, 0, 0), arm_root)
    hw = FOREARM_W / 2
    for k in range(2):
        fixed = {f: ((k * 4 + i) * 128, 0, 120, 1000) for i, f in enumerate(SIDES)}
        g.cube(forearm, [-hw, -FOREARM_L0, -hw], [FOREARM_W, FOREARM_L0, FOREARM_W], atlas="forearm",
               fixed=fixed, only=SIDES, rotation=[0, 45 * k, 0], pivot=[0, 0, 0], semantic="forearm",
               meta={"k": k})
    hand = g.bone("hand", (0, 0, 0), arm_root)
    build_hand(g, hand)
    return arm_root


def build_sky_breaker():
    g = Geo("geometry.sky_breaker", 1024, 1024, vis=(340, 230, (0, -48, 0)))
    for a in ("glass", "hole", "forearm"):
        g.atlas(a)
    g.atlas("eye", regions=[(0, 548, 636, 476), (660, 0, 364, 636), (548, 100, 110, 536)])
    g.atlas("hand")
    root = g.bone("root", (0, 0, 0))
    glass = g.bone("glass", (0, 0, 0), root)
    half = GLASS_SIZE / 2
    g.cube(glass, [-half, 0, -half], [GLASS_SIZE, 0, GLASS_SIZE], atlas="glass",
           fixed={"down": GLASS_RECT}, only=["down"], semantic="glass")
    hs = g.bone("hole_small", (0, 0, 0), root)
    q = HOLE_SMALL_QUAD / 2
    g.cube(hs, [-q, HOLE_QUAD_Y, -q], [HOLE_SMALL_QUAD, 0, HOLE_SMALL_QUAD], atlas="hole",
           fixed={"down": HOLE_SMALL_RECT}, only=["down"], semantic="hole_small")
    hb = g.bone("hole_big", (0, 0, 0), root)
    q = HOLE_BIG_QUAD / 2
    g.cube(hb, [-q, HOLE_QUAD_Y, -q], [HOLE_BIG_QUAD, 0, HOLE_BIG_QUAD], atlas="hole",
           fixed={"down": HOLE_BIG_RECT}, only=["down"], semantic="hole_big")
    light = g.bone("light", (0, 0, 0), root)
    g.cube(light, [-230, LIGHT_Y, -230], [460, 0, 460], atlas="hole",
           fixed={"down": LIGHT_RECT}, only=["down"], semantic="light")
    build_eye(g, root)
    build_arm(g, root)
    return g


def build_shard():
    g = Geo("geometry.sky_shard", 64, 64, vis=(8, 8, (0, 0, 0)))
    g.atlas("shard")
    root = g.bone("root", (0, 0, 0))
    g.cube(root, [-24, 0, -24], [48, 1, 48], atlas="shard",
           fixed={"up": (0, 0, 64, 64), "down": (0, 0, 64, 64)}, only=["up", "down"], semantic="shard")
    return g


# -------------------------------------------------------------- varita ----

RING_A_RECT = (128, 128, 128, 128)
RING_B_RECT = (0, 128, 128, 128)


def build_wand():
    g = Geo("geometry.sky_varita", 256, 256, vis=(3, 4, (0, 1, 0)))
    g.atlas("wand", regions=[(0, 0, 256, 126)])
    root = g.bone("root", (0, 24, 0), binding="q.item_slot_to_bone_name(c.item_slot)")
    S = 2.0
    g.cube(root, [-1, -3, -1], [2, 26, 2], atlas="wand", semantic="wood", scale=S)
    g.cube(root, [-0.8, -2, -0.8], [1.6, 24, 1.6], atlas="wand", semantic="wood_dark", scale=S,
           rotation=[0, 45, 0], pivot=[0, 10, 0])
    for y in (0.5, 3.4, 6.3):
        g.cube(root, [-1.4, y, -1.4], [2.8, 1.2, 2.8], atlas="wand", semantic="leather", scale=S)
    g.cube(root, [-1.7, 21, -1.7], [3.4, 2.2, 3.4], atlas="wand", semantic="gold", scale=S)
    for k in range(3):
        pb = g.bone(f"prong_{k}", (0, 23, 0), root, rotation=[0, 120 * k, 0])
        g.cube(pb, [-0.5, 22.6, 1.2], [1, 6.2, 1], atlas="wand", semantic="gold", scale=S,
               rotation=[-22, 0, 0], pivot=[0, 23, 1.2])
    core = g.bone("core", (0, 27, 0), root)
    crystal = g.bone("crystal", (0, 27, 0), core)
    g.cube(crystal, [-1.6, 25.4, -1.6], [3.2, 3.2, 3.2], atlas="wand", semantic="crystal", scale=S,
           rotation=[45, 0, 45], pivot=[0, 27, 0])
    g.cube(crystal, [-0.9, 26.1, -0.9], [1.8, 1.8, 1.8], atlas="wand", semantic="crystal_core", scale=S,
           rotation=[0, 45, 0], pivot=[0, 27, 0])
    ring_a = g.bone("ring_a", (0, 27, 0), core)
    g.cube(ring_a, [-4.5, 26.9, -4.5], [9, 0.2, 9], atlas="wand",
           fixed={"up": RING_A_RECT, "down": RING_A_RECT}, only=["up", "down"], semantic="ring")
    ring_b = g.bone("ring_b", (0, 27, 0), core)
    g.cube(ring_b, [-6, 26.9, -6], [12, 0.2, 12], atlas="wand",
           fixed={"up": RING_B_RECT, "down": RING_B_RECT}, only=["up", "down"], semantic="ring")
    # Órbitas: orbit_k inclina el plano, orb_k gira, orbarm_k acerca/aleja el fragmento
    for k, tilt in enumerate((25, -38, 62)):
        ob = g.bone(f"orbit_{k}", (0, 27, 0), core, rotation=[tilt, 0, 0])
        orb = g.bone(f"orb_{k}", (0, 27, 0), ob)
        arm = g.bone(f"orbarm_{k}", (0, 27, 0), orb)
        g.cube(arm, [4.2, 26.1, -0.6], [1.2, 1.8, 1.2], atlas="wand", semantic="crystal", scale=S,
               rotation=[0, 0, 45], pivot=[4.8, 27, 0])
    return g
