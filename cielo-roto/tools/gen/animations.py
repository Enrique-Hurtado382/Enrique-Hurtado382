"""Animaciones Bedrock: secuencia del cielo roto, mirada, fragmentos, varita y jugador."""
from .common import T, FOREARM_L0, HAND_SLAM_H, r

FINGER_SPREAD = [-9, -3, 2, 7]


def tkey(t):
    return f"{t:.2f}"


class Anim:
    def __init__(self, name, loop=True, length=None):
        self.name, self.loop, self.length = name, loop, length
        self.bones = {}

    def key(self, bone, ch, t, val):
        self.bones.setdefault(bone, {}).setdefault(ch, {})[tkey(t)] = r(val)

    def step(self, bone, ch, t, before, after):
        self.bones.setdefault(bone, {}).setdefault(ch, {})[tkey(t)] = {"pre": r(before), "post": r(after)}

    def expr(self, bone, ch, val):
        self.bones.setdefault(bone, {})[ch] = r(val) if isinstance(val, list) else val

    def json(self):
        d = {"loop": self.loop}
        if self.length:
            d["animation_length"] = self.length
        bones = {}
        for b, chans in self.bones.items():
            bones[b] = {}
            for ch, v in chans.items():
                if isinstance(v, dict):
                    bones[b][ch] = dict(sorted(v.items(), key=lambda kv: float(kv[0])))
                else:
                    bones[b][ch] = v
        d["bones"] = bones
        return d


def hand_track(a, points):
    """Posición de la mano y escala del antebrazo (que se estira hasta la mano)."""
    for t, y in points:
        a.key("hand", "position", t, [0, y, 0])
        s = max(-y + 20.0, 1.0) / FOREARM_L0
        a.key("forearm", "scale", t, [1, s, 1])


def fingers(a, t, pose, step_from=None):
    """pose = (a, b, c, thumb_y, thumb_tip_z, spread_factor)."""
    pa, pb, pc, ty, tz, sf = pose
    for i in range(4):
        vals = {"a": [pa, 0, FINGER_SPREAD[i] * sf], "b": [pb, 0, 0], "c": [pc, 0, 0]}
        for sfx, v in vals.items():
            if step_from is not None:
                a.step(f"f{i}_{sfx}", "rotation", t, step_from[sfx][i], v)
            else:
                a.key(f"f{i}_{sfx}", "rotation", t, v)
    if step_from is not None:
        a.step("thumb", "rotation", t, step_from["thumb"], [0, ty, 0])
        a.step("t_b", "rotation", t, step_from["t_b"], [0, 0, tz])
    else:
        a.key("thumb", "rotation", t, [0, ty, 0])
        a.key("t_b", "rotation", t, [0, 0, tz])


FIST = (84, 96, 58, 75, -60, 0.0)
OPEN = (10, 12, 6, 20, -10, 1.0)
PRESS = (38, 42, 26, 34, -22, 1.0)
GRAB = (72, 88, 52, 72, -55, 0.3)


def fist_as_from():
    return {"a": [[84, 0, 0]] * 4, "b": [[96, 0, 0]] * 4, "c": [[58, 0, 0]] * 4,
            "thumb": [0, 75, 0], "t_b": [0, 0, -60]}


def sequence():
    a = Anim("animation.sky_breaker.sequence", loop="hold_on_last_frame", length=T["despawn"] + 0.5)
    p, pb = T["punch"], T["punch_bottom"]

    # --- agujero y luz ---
    a.key("hole_small", "scale", 0, [0, 0, 0])
    a.step("hole_small", "scale", p - 0.02, [0, 0, 0], [0.55, 1, 0.55])
    a.key("hole_small", "scale", p + 0.12, [1.08, 1, 1.08])
    a.key("hole_small", "scale", p + 0.3, [1, 1, 1])
    a.key("hole_big", "scale", 0, [0, 0, 0])
    a.step("hole_big", "scale", T["hole_grow"] - 0.02, [0, 0, 0], [0.86, 1, 0.86])
    a.key("hole_big", "scale", T["hole_grow"] + 0.18, [1.04, 1, 1.04])
    a.key("hole_big", "scale", T["hole_grow"] + 0.4, [1, 1, 1])
    a.key("hole_big", "scale", T["heal_start"], [1, 1, 1])
    a.key("hole_big", "scale", T["heal_end"], [0, 1, 0])
    a.key("light", "scale", 0, [0, 0, 0])
    a.step("light", "scale", T["light_on"], [0, 0, 0], [0.3, 1, 0.3])
    a.key("light", "scale", T["light_peak"], [1, 1, 1])
    a.key("light", "scale", T["heal_start"], [1.25, 1, 1.25])
    a.key("light", "scale", T["heal_end"], [0, 1, 0])

    # --- ojo ---
    e0, e1 = T["eye_enter"], T["eye_settle"]
    a.key("eye_root", "scale", 0, [0, 0, 0])
    a.step("eye_root", "scale", e0, [0, 0, 0], [1, 1, 1])
    a.key("eye_root", "position", e0, [0, 400, 0])
    a.key("eye_root", "position", e0 + 0.75, [0, 90, 0])
    a.key("eye_root", "position", e1, [0, 0, 0])
    a.key("eye_root", "position", T["track_full"], [0, 0, 0])
    a.key("eye_root", "position", T["track_full"] + 1.6, [0, -34, 0])
    a.key("eye_root", "position", T["eye_squint"], [0, -34, 0])
    a.key("eye_root", "position", T["eye_squint"] + 0.3, [0, -10, 0])
    a.key("eye_root", "position", T["eye_leave"], [0, 0, 0])
    a.key("eye_root", "position", T["eye_leave"] + 0.25, [0, 50, 0])
    a.key("eye_root", "position", T["eye_hidden"], [0, 420, 0])
    a.step("eye_root", "scale", T["eye_hidden"] + 0.02, [1, 1, 1], [0, 0, 0])

    op, ope = T["eye_open"], T["eye_open_end"]
    a.key("lid_upper", "rotation", 0, [0, 0, 0])
    a.key("lid_upper", "rotation", op, [0, 0, 0])
    a.key("lid_upper", "rotation", op + 0.3, [78, 0, 0])
    a.key("lid_upper", "rotation", ope, [70, 0, 0])
    a.key("lid_lower", "rotation", 0, [0, 0, 0])
    a.key("lid_lower", "rotation", op, [0, 0, 0])
    a.key("lid_lower", "rotation", op + 0.3, [-46, 0, 0])
    a.key("lid_lower", "rotation", ope, [-40, 0, 0])
    for bt in (T["blink1"], T["blink2"], T["blink3"]):
        a.key("lid_upper", "rotation", bt, [70, 0, 0])
        a.key("lid_upper", "rotation", bt + 0.1, [4, 0, 0])
        a.key("lid_upper", "rotation", bt + 0.3, [70, 0, 0])
        a.key("lid_lower", "rotation", bt, [-40, 0, 0])
        a.key("lid_lower", "rotation", bt + 0.1, [-6, 0, 0])
        a.key("lid_lower", "rotation", bt + 0.3, [-40, 0, 0])
    sq = T["eye_squint"]
    a.key("lid_upper", "rotation", sq, [70, 0, 0])
    a.key("lid_upper", "rotation", sq + 0.25, [42, 0, 0])
    a.key("lid_upper", "rotation", T["eye_leave"], [42, 0, 0])
    a.key("lid_upper", "rotation", T["eye_leave"] + 0.35, [0, 0, 0])
    a.key("lid_lower", "rotation", sq, [-40, 0, 0])
    a.key("lid_lower", "rotation", sq + 0.25, [-24, 0, 0])
    a.key("lid_lower", "rotation", T["eye_leave"], [-24, 0, 0])
    a.key("lid_lower", "rotation", T["eye_leave"] + 0.35, [0, 0, 0])

    la, lb, lc = T["eye_look_a"], T["eye_look_b"], T["eye_center"]
    a.key("gaze_wander", "rotation", 0, [0, 0, 0])
    a.key("gaze_wander", "rotation", la, [0, 0, 0])
    a.key("gaze_wander", "rotation", la + 0.22, [-6, 0, -24])
    a.key("gaze_wander", "rotation", lb, [-6, 0, -24])
    a.key("gaze_wander", "rotation", lb + 0.22, [9, 0, 21])
    a.key("gaze_wander", "rotation", lc, [9, 0, 21])
    a.key("gaze_wander", "rotation", lc + 0.3, [0, 0, 0])

    a.key("pupil", "scale", 0, [1.55, 1, 1.55])
    a.key("pupil", "scale", op, [1.55, 1, 1.55])
    a.key("pupil", "scale", op + 0.9, [1.0, 1, 1.0])
    a.key("pupil", "scale", T["track_start"], [1.0, 1, 1.0])
    a.key("pupil", "scale", T["track_start"] + 0.4, [1.3, 1, 1.3])
    a.key("pupil", "scale", T["track_full"] + 1.0, [1.15, 1, 1.15])
    a.key("pupil", "scale", sq - 0.2, [1.15, 1, 1.15])
    a.key("pupil", "scale", sq + 0.2, [1.6, 1, 1.6])

    # --- primer puñetazo ---
    a.key("hand", "scale", 0, [0, 0, 0])
    a.step("hand", "scale", p - 0.06, [0, 0, 0], [1, 1, 1])
    a.key("hand", "rotation", 0, [0, 0, 0])
    fingers(a, 0, FIST)
    pts = [(p - 0.06, 130), (p, 130), (p + 0.12, -215), (pb, -352), (pb + 0.1, -368), (pb + 0.28, -352)]
    for k in range(5):
        pts.append((pb + 0.5 + k * 0.22, -352 + (3 if k % 2 else -3)))
    fh = T["fist_hold_end"]
    pts += [(fh, -352), (fh + 0.25, -300), (T["fist_hidden"], 160)]
    hand_track(a, pts)
    a.step("hand", "scale", T["fist_hidden"] + 0.02, [1, 1, 1], [0, 0, 0])

    # --- brazo que baja y agarra ---
    s0, s1 = T["arm_start"], T["slam"]
    a.step("hand", "scale", s0 - 0.06, [0, 0, 0], [1, 1, 1])
    a.step("hand", "rotation", s0 - 0.06, [0, 0, 0], [-90, 0, 0])
    fingers(a, s0 - 0.06, OPEN, step_from=fist_as_from())
    pts = [(s0 - 0.06, 140), (s0, 140)]
    n = 26
    for i in range(1, n + 1):
        u = i / n
        h = -140 + (HAND_SLAM_H + 140) * (u ** 2.3)
        pts.append((s0 + u * (s1 - s0), -h))
    pts += [(s1 + 0.08, -(HAND_SLAM_H + 16)), (s1 + 0.3, -(HAND_SLAM_H + 6)),
            (T["press_end"], -(HAND_SLAM_H + 6)), (T["grab_start"], -(HAND_SLAM_H + 6)),
            (T["grab_end"], -(HAND_SLAM_H + 6)), (T["grab_end"] + 0.3, -(HAND_SLAM_H - 40)),
            (T["lift_start"], -(HAND_SLAM_H - 40))]
    h0, h1 = HAND_SLAM_H - 40, -200
    l0, l1 = T["lift_start"], T["lift_end"]
    for i in range(1, 21):
        u = i / 20
        pts.append((l0 + u * (l1 - l0), -(h0 + (h1 - h0) * (u ** 2.0))))
    pts.append((T["arm_hidden"], 230))
    hand_track(a, pts)
    a.key("hand", "rotation", s1, [-90, 0, 0])
    a.key("hand", "rotation", s1 + 0.15, [-82, 0, 3])
    a.key("hand", "rotation", s1 + 0.5, [-88, 0, -2])
    a.key("hand", "rotation", T["press_end"], [-90, 0, 0])
    a.key("hand", "rotation", T["lift_start"], [-90, 0, 0])
    a.key("hand", "rotation", T["lift_start"] + 0.6, [-100, 0, 4])
    a.key("hand", "rotation", T["lift_end"], [-96, 0, 0])
    fingers(a, s1, OPEN)
    fingers(a, s1 + 0.35, PRESS)
    fingers(a, T["press_end"], PRESS)
    fingers(a, T["grab_start"], PRESS)
    fingers(a, T["grab_end"], GRAB)
    a.step("hand", "scale", T["arm_hidden"] + 0.02, [1, 1, 1], [0, 0, 0])

    a.key("chunk", "scale", 0, [0, 0, 0])
    a.step("chunk", "scale", T["grab_start"] + 0.45, [0, 0, 0], [0.6, 0.6, 0.6])
    a.key("chunk", "scale", T["grab_end"], [1, 1, 1])
    return a


def gaze():
    a = Anim("animation.sky_breaker.gaze", loop=True)
    a.expr("gaze", "rotation", ["v.gx + v.sx", 0, "v.gz + v.sz"])
    a.expr("pupil_pulse", "scale", "1.0 + 0.03 * math.sin(q.life_time * 310.0)")
    return a


def shard_tumble():
    a = Anim("animation.sky_shard.tumble", loop=True)
    a.expr("root", "rotation", ["q.life_time * (150.0 + q.variant * 40.0)", "q.life_time * 30.0",
                                "q.life_time * (95.0 - q.variant * 25.0)"])
    a.expr("root", "scale", "0.7 + q.variant * 0.35")
    return a


def wand_anims():
    fp = Anim("animation.sky_varita.hold_first_person")
    fp.expr("root", "position", ["-7.0 + v.charge * 1.5", "-3.0 + v.charge * 5.5 + v.burst * 2.0",
                                 "-2.0 - v.charge * 1.0"])
    fp.expr("root", "rotation", ["152.0 - v.charge * 50.0 - v.burst * 12.0", "-9.0 + v.charge * 6.0",
                                 "25.0 - v.charge * 12.0"])
    tp = Anim("animation.sky_varita.hold_third_person")
    tp.expr("root", "position", [1.5, -2.5, -10.5])
    tp.expr("root", "rotation", [97, -1.5, -49])
    fx = Anim("animation.sky_varita.fx")
    fx.expr("ring_a", "rotation", [20, "v.spin", 0])
    fx.expr("ring_b", "rotation", ["v.spin * -1.35", 70, 0])
    fx.expr("ring_a", "scale", "1.0 + v.charge * 0.25 + v.burst * 1.4")
    fx.expr("ring_b", "scale", "1.0 + v.charge * 0.15 + v.burst * 2.0")
    fx.expr("crystal", "rotation", [0, "v.spin * 0.5", 0])
    fx.expr("crystal", "scale", "v.crystal_scale")
    fx.expr("crystal", "position", [0, "math.sin(q.life_time * 200.0) * 0.4 + v.charge * 1.5 + v.burst", 0])
    for k in range(3):
        fx.expr(f"orb_{k}", "rotation", [0, f"v.spin * {1.0 + 0.3 * k:.2f} + {k * 120}.0", 0])
        fx.expr(f"orbarm_{k}", "position", ["v.orbit_r - 4.8", f"math.sin(q.life_time * 150.0 + {k * 120}.0) * 0.5", 0])
        fx.expr(f"orbarm_{k}", "scale", "0.9 + v.charge * 0.6 + v.burst * 0.8")
    return [fp, tp, fx]


def player_cast():
    a = Anim("animation.sky_varita.cast", loop=False, length=3.6)
    ra = [(0, [0, 0, 0]), (0.5, [-178, 0, -8]), (0.62, [-171, 0, -6])]
    for k in range(10):
        t = 0.8 + k * 0.22
        ra.append((t, [-174 + (2.5 if k % 2 else -2.5), 0, -6 + (1.5 if k % 2 else -1.5)]))
    ra += [(3.0, [-176, 0, -6]), (3.15, [-55, 0, 0]), (3.5, [0, 0, 0])]
    for t, v in ra:
        a.key("rightArm", "rotation", t, v)
    for t, v in [(0, [0, 0, 0]), (0.5, [18, 0, 14]), (3.0, [18, 0, 14]), (3.15, [-20, 0, 10]), (3.5, [0, 0, 0])]:
        a.key("leftArm", "rotation", t, v)
    for t, v in [(0, [0, 0, 0]), (0.5, [-32, 0, 0]), (3.0, [-34, 0, 0]), (3.15, [-8, 0, 0]), (3.5, [0, 0, 0])]:
        a.key("head", "rotation", t, v)
    for t, v in [(0, [0, 0, 0]), (0.5, [-6, 0, 0]), (3.0, [-7, 0, 0]), (3.15, [6, 0, 0]), (3.5, [0, 0, 0])]:
        a.key("body", "rotation", t, v)
    return a


def all_files():
    """Devuelve {ruta_relativa_en_RP: json}."""
    def pack(anims):
        return {"format_version": "1.8.0", "animations": {x.name: x.json() for x in anims}}
    return {
        "animations/sky_breaker.animation.json": pack([sequence(), gaze()]),
        "animations/sky_shard.animation.json": pack([shard_tumble()]),
        "animations/sky_varita.animation.json": pack(wand_anims()),
        "animations/sky_varita_player.animation.json": pack([player_cast()]),
    }
