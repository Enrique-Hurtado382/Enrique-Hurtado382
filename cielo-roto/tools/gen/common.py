"""Constantes compartidas por todos los generadores del addon Cielo Roto."""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PACKS = os.path.join(ROOT, "packs")
BP = os.path.join(PACKS, "CieloRoto_BP")
RP = os.path.join(PACKS, "CieloRoto_RP")
DIST = os.path.join(ROOT, "dist")

NS = "sky"
ENTITY_BREAKER = f"{NS}:sky_breaker"
ENTITY_SHARD = f"{NS}:shard"
ITEM_WAND = f"{NS}:varita_del_cielo"
COOLDOWN_CATEGORY = "sky_varita"

# UUIDs fijos (generados una sola vez) para que el addon se actualice en lugar de duplicarse.
UUID_BP_HEADER = "5b0f2d8e-7a3c-4f61-9c0a-2d6b8e1f4a71"
UUID_BP_DATA = "a3e94c17-2b58-4d0e-8f6a-c1d7e2b94f03"
UUID_BP_SCRIPT = "0c7d5e21-9f4b-4a38-b6e2-7d13a9c5f8e4"
UUID_RP_HEADER = "e8a1c6f3-4d27-4b9e-a5c0-3f8b2d7e6a19"
UUID_RP_RES = "4f6b3a9d-1e85-4c72-9b0d-6a2f8c3e5d17"
VERSION = [1, 0, 0]
MIN_ENGINE = [1, 21, 90]
SCRIPT_API = "2.0.0"

# ---- Medidas del mundo (unidades de geometría: 16 = 1 bloque) ----
HOLE_HEIGHT_BLOCKS = 80          # altura del agujero sobre el suelo
GLASS_SIZE = 2560                # 160 bloques de lado
HOLE_SMALL_QUAD = 480            # 30 bloques
HOLE_BIG_QUAD = 576              # 36 bloques
HOLE_R_SMALL = 170               # radio del agujero (etapa 1)
HOLE_R_BIG = 236                 # radio del agujero (etapa 2)
HOLE_QUAD_Y = 8
SOCKET_Y = 4
LIGHT_Y = 6
EYE_R = 136
LID_R = 142
EYE_CENTER_Y = 60
SOCKET_SIZE = 320
FOREARM_L0 = 1200
FOREARM_W = 150
HAND_SLAM_H = 16 * (HOLE_HEIGHT_BLOCKS + 1) - 44   # altura (hacia abajo) de la mano al golpear

# ---- Línea de tiempo de la secuencia (segundos desde que aparece la entidad) ----
T = {
    "bolt_arrive": 1.0,
    "creak2": 1.7,
    "punch": 2.4,
    "punch_bottom": 2.65,
    "fist_hold_end": 3.8,
    "fist_hidden": 4.5,
    "eye_enter": 5.6,
    "eye_settle": 6.8,
    "eye_open": 7.0,
    "eye_open_end": 7.45,
    "eye_look_a": 7.7,
    "eye_look_b": 8.7,
    "eye_center": 9.6,
    "track_start": 9.8,
    "track_full": 11.0,
    "blink1": 12.4,
    "blink2": 16.1,
    "blink3": 19.3,
    "eye_squint": 21.0,
    "eye_leave": 21.6,
    "eye_hidden": 22.2,
    "hole_grow": 22.6,
    "arm_start": 23.4,
    "slam": 26.0,
    "press_end": 27.3,
    "grab_start": 27.6,
    "grab_end": 28.6,
    "lift_start": 29.0,
    "lift_end": 31.0,
    "arm_hidden": 31.4,
    "light_on": 31.8,
    "light_peak": 32.8,
    "heal_start": 33.4,
    "heal_end": 35.2,
    "despawn": 36.5,
}
CAST_SECONDS = 3.0


def dump(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def r(v, nd=3):
    """Redondea para JSON compacto."""
    if isinstance(v, (list, tuple)):
        return [r(x, nd) for x in v]
    if isinstance(v, float):
        out = round(v, nd)
        return int(out) if out == int(out) else out
    return v
