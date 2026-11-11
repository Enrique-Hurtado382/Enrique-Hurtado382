"""Arma el Behavior Pack y el Resource Pack completos y el .mcaddon."""
import os
import shutil
import zipfile

from . import common as C
from . import geometry, animations, textures, particles, sounds
from .common import dump, T

TEX_ENT = "textures/entity/sky_breaker"


def manifest_bp():
    return {
        "format_version": 2,
        "header": {
            "name": "Cielo Roto [BP]",
            "description": "La Varita del Cielo: rompé el cielo como vidrio y mirá lo que hay detrás.",
            "uuid": C.UUID_BP_HEADER, "version": C.VERSION, "min_engine_version": C.MIN_ENGINE,
        },
        "modules": [
            {"type": "data", "uuid": C.UUID_BP_DATA, "version": C.VERSION},
            {"type": "script", "language": "javascript", "uuid": C.UUID_BP_SCRIPT, "version": C.VERSION,
             "entry": "scripts/main.js"},
        ],
        "dependencies": [
            {"module_name": "@minecraft/server", "version": C.SCRIPT_API},
            {"uuid": C.UUID_RP_HEADER, "version": C.VERSION},
        ],
    }


def manifest_rp():
    return {
        "format_version": 2,
        "header": {
            "name": "Cielo Roto [RP]",
            "description": "Modelos, animaciones, partículas y sonidos de la Varita del Cielo.",
            "uuid": C.UUID_RP_HEADER, "version": C.VERSION, "min_engine_version": C.MIN_ENGINE,
        },
        "modules": [{"type": "resources", "uuid": C.UUID_RP_RES, "version": C.VERSION}],
    }


# ------------------------------------------------------------- behavior ----

def bp_sky_breaker():
    return {
        "format_version": "1.21.0",
        "minecraft:entity": {
            "description": {
                "identifier": C.ENTITY_BREAKER, "is_spawnable": False, "is_summonable": True,
                "properties": {
                    "sky:gaze_x": {"type": "float", "range": [-60.0, 60.0], "default": 0.0, "client_sync": True},
                    "sky:gaze_z": {"type": "float", "range": [-60.0, 60.0], "default": 0.0, "client_sync": True},
                },
            },
            "component_groups": {"sky:gone": {"minecraft:instant_despawn": {}}},
            "components": {
                "minecraft:type_family": {"family": ["sky_breaker", "inanimate"]},
                "minecraft:collision_box": {"width": 0.2, "height": 0.2},
                "minecraft:physics": {"has_gravity": False, "has_collision": False},
                "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
                "minecraft:damage_sensor": {"triggers": [{"cause": "all", "deals_damage": "no"}]},
                "minecraft:knockback_resistance": {"value": 1.0},
                "minecraft:fire_immune": True,
                "minecraft:persistent": {},
                "minecraft:timer": {"time": T["despawn"] + 1.5, "looping": False, "time_down_event": {"event": "sky:gone"}},
            },
            "events": {"sky:gone": {"add": {"component_groups": ["sky:gone"]}}},
        },
    }


def bp_shard():
    groups = {f"sky:v{i}": {"minecraft:variant": {"value": i}} for i in range(4)}
    groups["sky:gone"] = {"minecraft:instant_despawn": {}}
    events = {f"sky:v{i}": {"add": {"component_groups": [f"sky:v{i}"]}} for i in range(4)}
    events["sky:gone"] = {"add": {"component_groups": ["sky:gone"]}}
    return {
        "format_version": "1.21.0",
        "minecraft:entity": {
            "description": {"identifier": C.ENTITY_SHARD, "is_spawnable": False, "is_summonable": True},
            "component_groups": groups,
            "components": {
                "minecraft:type_family": {"family": ["sky_shard", "inanimate"]},
                "minecraft:collision_box": {"width": 0.6, "height": 0.4},
                "minecraft:physics": {"has_gravity": True, "has_collision": True},
                "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
                "minecraft:damage_sensor": {"triggers": [{"cause": "all", "deals_damage": "no"}]},
                "minecraft:fire_immune": True,
                "minecraft:timer": {"time": 14, "looping": False, "time_down_event": {"event": "sky:gone"}},
            },
            "events": events,
        },
    }


def bp_item():
    return {
        "format_version": "1.21.0",
        "minecraft:item": {
            "description": {
                "identifier": C.ITEM_WAND,
                "menu_category": {"category": "equipment", "group": "minecraft:itemGroup.name.sword"},
            },
            "components": {
                "minecraft:icon": {"textures": {"default": "varita_del_cielo"}},
                "minecraft:display_name": {"value": f"item.{C.ITEM_WAND}.name"},
                "minecraft:max_stack_size": 1,
                "minecraft:hand_equipped": True,
                "minecraft:rarity": "epic",
                "minecraft:cooldown": {"category": C.COOLDOWN_CATEGORY, "duration": 45},
                "minecraft:tags": {"tags": ["sky:varita"]},
            },
        },
    }


def bp_recipe():
    return {
        "format_version": "1.20.10",
        "minecraft:recipe_shaped": {
            "description": {"identifier": C.ITEM_WAND},
            "tags": ["crafting_table"],
            "pattern": [" A ", "GSG", " S "],
            "key": {"A": {"item": "minecraft:amethyst_shard"}, "G": {"item": "minecraft:glass"}, "S": {"item": "minecraft:stick"}},
            "unlock": [{"item": "minecraft:amethyst_shard"}],
            "result": {"item": C.ITEM_WAND},
        },
    }


def timeline_js():
    lines = ["// Generado por tools/build.py: NO editar a mano (editar tools/gen/common.py).", "export const T = {"]
    for k, v in T.items():
        lines.append(f"  {k}: {v},")
    lines.append("};")
    lines.append(f"export const CAST_SECONDS = {C.CAST_SECONDS};")
    lines.append(f"export const HOLE_HEIGHT = {C.HOLE_HEIGHT_BLOCKS};")
    lines.append(f'export const COOLDOWN_CATEGORY = "{C.COOLDOWN_CATEGORY}";')
    lines.append(f"export const HAND_SLAM_BLOCKS = {C.HAND_SLAM_H / 16:.3f};")
    return "\n".join(lines) + "\n"


# ------------------------------------------------------------- resource ----

def pre_animation_sky():
    t = T
    return [
        "v.lt = q.life_time;",
        f"v.glass_alpha = math.clamp((v.lt - {t['bolt_arrive'] - 0.1}) / 0.5, 0, 1) * math.clamp(({t['heal_end']} - v.lt) / 1.8, 0, 1);",
        f"v.glass_stage = v.lt < {t['punch']} ? 0 : (v.lt < {t['hole_grow']} ? 1 : 2);",
        f"v.hole_stage = v.lt < {t['punch'] - 0.02} ? 0 : (v.lt < {t['hole_grow'] - 0.02} ? 1 : (v.lt < {t['heal_end'] + 0.1} ? 2 : 0));",
        f"v.light_alpha = math.clamp((v.lt - {t['light_on']}) / 1.0, 0, 1) * math.clamp(({t['heal_end'] - 0.1} - v.lt) / 1.2, 0, 1) * (0.8 + 0.2 * math.sin(v.lt * 720.0));",
        f"v.track = math.clamp((v.lt - {t['track_start']}) / 1.2, 0, 1) * math.clamp(({t['eye_leave']} - v.lt) / 0.8, 0, 1);",
        "v.gx = math.lerp(v.gx ?? 0.0, q.property('sky:gaze_x') * v.track, 0.1);",
        "v.gz = math.lerp(v.gz ?? 0.0, q.property('sky:gaze_z') * v.track, 0.1);",
        "v.sx = (math.sin(v.lt * 497.0) * 0.5 + math.sin(v.lt * 131.0) * 0.7) * v.track;",
        "v.sz = (math.sin(v.lt * 613.0 + 40.0) * 0.5 + math.sin(v.lt * 97.0) * 0.7) * v.track;",
    ]


def rp_sky_breaker_entity():
    return {
        "format_version": "1.10.0",
        "minecraft:client_entity": {
            "description": {
                "identifier": C.ENTITY_BREAKER,
                "materials": {"solid": "entity_alphatest", "glass": "entity_alphablend", "glow": "entity_emissive_alpha"},
                "textures": {
                    "glass1": f"{TEX_ENT}/glass_1", "glass2": f"{TEX_ENT}/glass_2", "glass3": f"{TEX_ENT}/glass_3",
                    "hole": f"{TEX_ENT}/hole", "eye": f"{TEX_ENT}/eye", "hand": f"{TEX_ENT}/hand",
                    "forearm": f"{TEX_ENT}/forearm",
                },
                "geometry": {"default": "geometry.sky_breaker"},
                "animations": {"sequence": "animation.sky_breaker.sequence", "gaze": "animation.sky_breaker.gaze"},
                "scripts": {"pre_animation": pre_animation_sky(), "animate": ["sequence", "gaze"],
                            "should_update_bones_and_effects_offscreen": True,
                            "should_update_effects_offscreen": True},
                "render_controllers": [
                    "controller.render.sky_breaker_eye", "controller.render.sky_breaker_hand",
                    "controller.render.sky_breaker_forearm", "controller.render.sky_breaker_hole",
                    "controller.render.sky_breaker_glow", "controller.render.sky_breaker_glass",
                ],
                "enable_attachables": False,
            },
        },
    }


def part_vis(all_bones, visible, extra=None):
    out = [{"*": False}]
    for b in all_bones:
        if b in visible:
            out.append({b: True})
    for b, expr in (extra or {}).items():
        out.append({b: expr})
    return out


def rp_sky_breaker_rcs(bones):
    eye = {b for b in bones if b.startswith(("eye_", "lid_", "gaze", "pupil", "socket"))}
    hand = {b for b in bones if b in ("hand", "palm", "thumb", "t_a", "t_b", "chunk") or b.startswith("f")}
    base = {"geometry": "Geometry.default"}
    rcs = {
        "controller.render.sky_breaker_eye": {**base, "materials": [{"*": "Material.solid"}], "textures": ["Texture.eye"],
                                              "part_visibility": part_vis(bones, eye)},
        "controller.render.sky_breaker_hand": {**base, "materials": [{"*": "Material.solid"}], "textures": ["Texture.hand"],
                                               "part_visibility": part_vis(bones, hand)},
        "controller.render.sky_breaker_forearm": {**base, "materials": [{"*": "Material.solid"}], "textures": ["Texture.forearm"],
                                                  "part_visibility": part_vis(bones, {"forearm"})},
        "controller.render.sky_breaker_hole": {**base, "materials": [{"*": "Material.solid"}], "textures": ["Texture.hole"],
                                               "part_visibility": part_vis(bones, set(), {"hole_small": "v.hole_stage == 1", "hole_big": "v.hole_stage == 2"})},
        "controller.render.sky_breaker_glow": {**base, "materials": [{"*": "Material.glow"}], "textures": ["Texture.hole"],
                                               "part_visibility": part_vis(bones, {"light"}),
                                               "color": {"r": 1.0, "g": 1.0, "b": 1.0, "a": "v.light_alpha"},
                                               "ignore_lighting": True},
        "controller.render.sky_breaker_glass": {**base, "materials": [{"*": "Material.glass"}],
                                                "arrays": {"textures": {"Array.glass": ["Texture.glass1", "Texture.glass2", "Texture.glass3"]}},
                                                "textures": ["Array.glass[v.glass_stage]"],
                                                "part_visibility": part_vis(bones, {"glass"}),
                                                "color": {"r": 1.0, "g": 1.0, "b": 1.0, "a": "v.glass_alpha"},
                                                "ignore_lighting": True},
    }
    return {"format_version": "1.10.0", "render_controllers": rcs}


def rp_shard_entity():
    return {
        "format_version": "1.10.0",
        "minecraft:client_entity": {
            "description": {
                "identifier": C.ENTITY_SHARD,
                "materials": {"default": "entity_alphablend"},
                "textures": {f"s{i}": f"textures/entity/sky_shard/shard_{i}" for i in range(4)},
                "geometry": {"default": "geometry.sky_shard"},
                "animations": {"tumble": "animation.sky_shard.tumble"},
                "scripts": {"animate": ["tumble"]},
                "render_controllers": ["controller.render.sky_shard"],
            },
        },
    }


def rp_shard_rc():
    return {"format_version": "1.10.0", "render_controllers": {"controller.render.sky_shard": {
        "geometry": "Geometry.default", "materials": [{"*": "Material.default"}],
        "arrays": {"textures": {"Array.skins": [f"Texture.s{i}" for i in range(4)]}},
        "textures": ["Array.skins[q.variant]"]}}}


def rp_wand_attachable():
    cat = C.COOLDOWN_CATEGORY
    pre = [
        "v.cd_total = q.cooldown_time('slot.weapon.mainhand');",
        "v.cd_rem = q.cooldown_time_remaining('slot.weapon.mainhand');",
        "v.cast_t = (v.cd_total > 0.0 && v.cd_rem > 0.0) ? (v.cd_total - v.cd_rem) : -1.0;",
        f"v.charge = (v.cast_t >= 0.0 && v.cast_t < {C.CAST_SECONDS}) ? math.clamp(v.cast_t / {C.CAST_SECONDS}, 0, 1) : 0.0;",
        f"v.burst = (v.cast_t >= {C.CAST_SECONDS} && v.cast_t < {C.CAST_SECONDS + 0.7}) ? (1.0 - (v.cast_t - {C.CAST_SECONDS}) / 0.7) : 0.0;",
        f"v.recharge = (v.cast_t >= {C.CAST_SECONDS + 0.7}) ? 1.0 : 0.0;",
        "v.spin_speed = 70.0 + v.charge * v.charge * 900.0 + v.burst * 500.0;",
        "v.spin = (v.spin ?? 0.0) + v.spin_speed * q.delta_time;",
        "v.spin = v.spin > 36000.0 ? v.spin - 36000.0 : v.spin;",
        "v.wand_stage = v.burst > 0.0 ? 2 : (v.charge > 0.33 ? 1 : (v.recharge > 0.0 ? 3 : 0));",
        "v.orbit_r = 4.8 - v.charge * 2.6 + v.burst * 6.0;",
        "v.crystal_scale = 1.0 + v.charge * 0.5 + v.burst * 1.6 - v.recharge * 0.25;",
    ]
    return {
        "format_version": "1.10.0",
        "minecraft:attachable": {
            "description": {
                "identifier": C.ITEM_WAND,
                "materials": {"default": "entity_alphatest", "glow": "entity_emissive_alpha"},
                "textures": {f"s{i}": f"textures/entity/sky_varita/varita_{i}" for i in range(4)},
                "geometry": {"default": "geometry.sky_varita"},
                "animations": {
                    "hold_first_person": "animation.sky_varita.hold_first_person",
                    "hold_third_person": "animation.sky_varita.hold_third_person",
                    "fx": "animation.sky_varita.fx",
                },
                "scripts": {
                    "pre_animation": pre,
                    "animate": [{"hold_first_person": "c.is_first_person"},
                                {"hold_third_person": "!c.is_first_person"}, "fx"],
                },
                "render_controllers": ["controller.render.sky_varita"],
            },
        },
    }


def rp_wand_rc():
    glow_bones = ["crystal", "ring_a", "ring_b", "orbarm_0", "orbarm_1", "orbarm_2"]
    mats = [{"*": "Material.default"}] + [{b: "Material.glow"} for b in glow_bones]
    return {"format_version": "1.10.0", "render_controllers": {"controller.render.sky_varita": {
        "geometry": "Geometry.default", "materials": mats,
        "arrays": {"textures": {"Array.skins": [f"Texture.s{i}" for i in range(4)]}},
        "textures": ["Array.skins[v.wand_stage]"]}}}


LANG = {
    "es_ES": {
        f"item.{C.ITEM_WAND}.name": "Varita del Cielo",
        f"entity.{C.ENTITY_BREAKER}.name": "Cielo Roto",
        f"entity.{C.ENTITY_SHARD}.name": "Fragmento de cielo",
    },
    "es_MX": {
        f"item.{C.ITEM_WAND}.name": "Varita del Cielo",
        f"entity.{C.ENTITY_BREAKER}.name": "Cielo Roto",
        f"entity.{C.ENTITY_SHARD}.name": "Fragmento de cielo",
    },
    "en_US": {
        f"item.{C.ITEM_WAND}.name": "Sky Wand",
        f"entity.{C.ENTITY_BREAKER}.name": "Broken Sky",
        f"entity.{C.ENTITY_SHARD}.name": "Sky Shard",
    },
}


def write_lang(root):
    os.makedirs(os.path.join(root, "texts"), exist_ok=True)
    with open(os.path.join(root, "texts", "languages.json"), "w", encoding="utf-8") as f:
        f.write('["en_US", "es_ES", "es_MX"]\n')
    for code, entries in LANG.items():
        with open(os.path.join(root, "texts", f"{code}.lang"), "w", encoding="utf-8") as f:
            for k, v in entries.items():
                f.write(f"{k}={v}\n")


# ------------------------------------------------------------------ build --

def clean(path):
    if os.path.isdir(path):
        shutil.rmtree(path)
    os.makedirs(path, exist_ok=True)


def build_all(skip_sounds=False):
    BP, RP = C.BP, C.RP
    clean(BP)
    clean(RP)

    # --- geometrías y registros de UV ---
    sky = geometry.build_sky_breaker()
    sky_json = sky.finalize()
    shard = geometry.build_shard()
    shard_json = shard.finalize()
    wand = geometry.build_wand()
    wand_json = wand.finalize()
    dump(os.path.join(RP, "models/entity/sky_breaker.geo.json"), sky_json)
    dump(os.path.join(RP, "models/entity/sky_shard.geo.json"), shard_json)
    dump(os.path.join(RP, "models/entity/sky_varita.geo.json"), wand_json)

    # --- texturas ---
    tex_dir = os.path.join(RP, TEX_ENT)
    os.makedirs(tex_dir, exist_ok=True)
    web = textures.CrackWeb()
    for stage in (1, 2, 3):
        web.render_glass(1024, stage).save(os.path.join(tex_dir, f"glass_{stage}.png"))
    textures.paint_hole_atlas(web).save(os.path.join(tex_dir, "hole.png"))
    textures.paint_eye_atlas(sky.records_for("eye")).save(os.path.join(tex_dir, "eye.png"))
    textures.paint_hand_atlas(sky.records_for("hand")).save(os.path.join(tex_dir, "hand.png"))
    textures.paint_forearm_atlas(sky.records_for("forearm")).save(os.path.join(tex_dir, "forearm.png"))
    import numpy as np
    sh_dir = os.path.join(RP, "textures/entity/sky_shard")
    os.makedirs(sh_dir, exist_ok=True)
    shard_imgs = [textures.shard_image(64, np.random.default_rng(100 + i)) for i in range(4)]
    for i, im in enumerate(shard_imgs):
        im.save(os.path.join(sh_dir, f"shard_{i}.png"))
    wd = os.path.join(RP, "textures/entity/sky_varita")
    os.makedirs(wd, exist_ok=True)
    for stage in range(4):
        textures.paint_wand_atlas(wand.records_for("wand"), stage).save(os.path.join(wd, f"varita_{stage}.png"))
    it = os.path.join(RP, "textures/items")
    os.makedirs(it, exist_ok=True)
    textures.wand_icon().save(os.path.join(it, "varita_del_cielo.png"))
    pd = os.path.join(RP, "textures/particle")
    os.makedirs(pd, exist_ok=True)
    textures.strip(shard_imgs).save(os.path.join(pd, "sky_shards.png"))
    textures.strip([textures.dust_image(128, np.random.default_rng(200 + i)) for i in range(4)]).save(os.path.join(pd, "sky_dust.png"))
    textures.glow_image(64).save(os.path.join(pd, "sky_glow.png"))
    textures.ring_image(128).save(os.path.join(pd, "sky_ring.png"))
    textures.flash_image(128).save(os.path.join(pd, "sky_flash.png"))
    textures.strip([textures.debris_image(32, np.random.default_rng(300 + i)) for i in range(4)]).save(os.path.join(pd, "sky_debris.png"))
    icon = textures.pack_icon(web)
    icon.save(os.path.join(RP, "pack_icon.png"))
    icon.save(os.path.join(BP, "pack_icon.png"))
    dump(os.path.join(RP, "textures/item_texture.json"), {
        "resource_pack_name": "cielo_roto", "texture_name": "atlas.items",
        "texture_data": {"varita_del_cielo": {"textures": "textures/items/varita_del_cielo"}}})

    # --- animaciones, entidades cliente, render controllers, attachable ---
    for rel, data in animations.all_files().items():
        dump(os.path.join(RP, rel), data)
    dump(os.path.join(RP, "entity/sky_breaker.entity.json"), rp_sky_breaker_entity())
    dump(os.path.join(RP, "render_controllers/sky_breaker.render_controllers.json"), rp_sky_breaker_rcs(sky.bone_names()))
    dump(os.path.join(RP, "entity/sky_shard.entity.json"), rp_shard_entity())
    dump(os.path.join(RP, "render_controllers/sky_shard.render_controllers.json"), rp_shard_rc())
    dump(os.path.join(RP, "attachables/sky_varita.attachable.json"), rp_wand_attachable())
    dump(os.path.join(RP, "render_controllers/sky_varita.render_controllers.json"), rp_wand_rc())

    # --- partículas ---
    for ident, data in particles.all_particles().items():
        dump(os.path.join(RP, "particles", ident.split(":")[1] + ".particle.json"), data)

    # --- sonidos ---
    if not skip_sounds:
        sounds.build_sounds(os.path.join(RP, "sounds/sky"))
    dump(os.path.join(RP, "sounds/sound_definitions.json"), sounds.sound_definitions())

    write_lang(RP)
    dump(os.path.join(RP, "manifest.json"), manifest_rp())

    # --- behavior ---
    dump(os.path.join(BP, "manifest.json"), manifest_bp())
    dump(os.path.join(BP, "entities/sky_breaker.json"), bp_sky_breaker())
    dump(os.path.join(BP, "entities/sky_shard.json"), bp_shard())
    dump(os.path.join(BP, "items/varita_del_cielo.json"), bp_item())
    dump(os.path.join(BP, "recipes/varita_del_cielo.json"), bp_recipe())
    os.makedirs(os.path.join(BP, "scripts"), exist_ok=True)
    with open(os.path.join(BP, "scripts/timeline.js"), "w", encoding="utf-8") as f:
        f.write(timeline_js())
    shutil.copy(os.path.join(C.ROOT, "tools/src/main.js"), os.path.join(BP, "scripts/main.js"))

    # --- .mcaddon ---
    os.makedirs(C.DIST, exist_ok=True)
    out = os.path.join(C.DIST, "CieloRoto.mcaddon")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for root_dir in (BP, RP):
            for dp, _, files in os.walk(root_dir):
                for fn in files:
                    full = os.path.join(dp, fn)
                    z.write(full, os.path.relpath(full, C.PACKS))
    return out
