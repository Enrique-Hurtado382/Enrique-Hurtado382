"""Definiciones de partículas Bedrock para Cielo Roto."""


def P(ident, texture, material, comps):
    return {
        "format_version": "1.10.0",
        "particle_effect": {
            "description": {
                "identifier": ident,
                "basic_render_parameters": {"material": material, "texture": f"textures/particle/{texture}"},
            },
            "components": comps,
        },
    }


def billboard(size, mode="rotate_xyz", tw=64, th=64, uv=(0, 0), uv_size=(64, 64)):
    return {"size": list(size), "facing_camera_mode": mode,
            "uv": {"texture_width": tw, "texture_height": th, "uv": list(uv), "uv_size": list(uv_size)}}


def variant_uv(n, cell, size, mode="rotate_xyz"):
    """Elige una de n celdas horizontales al azar por partícula."""
    return {"size": list(size), "facing_camera_mode": mode,
            "uv": {"texture_width": n * cell, "texture_height": cell,
                   "uv": [f"math.floor(v.particle_random_1 * {n - 0.01}) * {cell}", 0], "uv_size": [cell, cell]}}


FADE = "math.clamp(v.particle_age * 4.0, 0, 1) * math.clamp((v.particle_lifetime - v.particle_age) / (v.particle_lifetime * 0.4), 0, 1)"
LINEAR_OUT = "1.0 - v.particle_age / v.particle_lifetime"


def all_particles():
    out = {}

    out["sky:wand_motes"] = P("sky:wand_motes", "sky_glow", "particles_add", {
        "minecraft:emitter_rate_steady": {"spawn_rate": 45, "max_particles": 120},
        "minecraft:emitter_lifetime_once": {"active_time": 0.55},
        "minecraft:emitter_shape_sphere": {"radius": 2.4, "direction": "inwards"},
        "minecraft:particle_initial_speed": "math.random(2.5, 4.0)",
        "minecraft:particle_lifetime_expression": {"max_lifetime": "math.random(0.55, 0.8)"},
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 0.4},
        "minecraft:particle_appearance_billboard": billboard([0.14, 0.14]),
        "minecraft:particle_appearance_tinting": {"color": ["0.55 + 0.45 * v.particle_age", "0.9", "1.0", LINEAR_OUT]},
    })
    out["sky:wand_ring"] = P("sky:wand_ring", "sky_ring", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 1},
        "minecraft:emitter_lifetime_once": {"active_time": 0.1},
        "minecraft:emitter_shape_point": {},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.8},
        "minecraft:particle_appearance_billboard": billboard(["0.4 + v.particle_age * 7.0", "0.4 + v.particle_age * 7.0"], "emitter_transform_xz", 128, 128, (0, 0), (128, 128)),
        "minecraft:particle_appearance_tinting": {"color": [0.6, 0.95, 1.0, "0.9 * (1.0 - v.particle_age / 0.8)"]},
    })
    out["sky:wand_burst"] = P("sky:wand_burst", "sky_glow", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 70},
        "minecraft:emitter_lifetime_once": {"active_time": 0.1},
        "minecraft:emitter_shape_sphere": {"radius": 0.3, "direction": "outwards"},
        "minecraft:particle_initial_speed": "math.random(6, 13)",
        "minecraft:particle_lifetime_expression": {"max_lifetime": "math.random(0.5, 1.2)"},
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -5, 0], "linear_drag_coefficient": 1.4},
        "minecraft:particle_appearance_billboard": billboard([0.2, 0.2]),
        "minecraft:particle_appearance_tinting": {"color": [1.0, 1.0, 1.0, LINEAR_OUT]},
    })
    out["sky:flash"] = P("sky:flash", "sky_flash", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 1},
        "minecraft:emitter_lifetime_once": {"active_time": 0.1},
        "minecraft:emitter_shape_point": {},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.3},
        "minecraft:particle_appearance_billboard": billboard(["6.0 * (1.0 - v.particle_age / 0.3)", "6.0 * (1.0 - v.particle_age / 0.3)"], "lookat_xyz", 128, 128, (0, 0), (128, 128)),
        "minecraft:particle_appearance_tinting": {"color": [0.85, 0.97, 1.0, 1.0]},
    })
    out["sky:impact_flash"] = P("sky:impact_flash", "sky_flash", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 1},
        "minecraft:emitter_lifetime_once": {"active_time": 0.1},
        "minecraft:emitter_shape_point": {"offset": [0, 2, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.28},
        "minecraft:particle_appearance_billboard": billboard(["16.0 * (1.0 - v.particle_age / 0.28)", "16.0 * (1.0 - v.particle_age / 0.28)"], "lookat_xyz", 128, 128, (0, 0), (128, 128)),
        "minecraft:particle_appearance_tinting": {"color": [1.0, 0.95, 0.85, 0.9]},
    })
    out["sky:bolt_head"] = P("sky:bolt_head", "sky_glow", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 1},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.14},
        "minecraft:particle_appearance_billboard": billboard([2.2, 2.2], "lookat_xyz"),
        "minecraft:particle_appearance_tinting": {"color": [0.8, 0.96, 1.0, 1.0]},
    })
    out["sky:bolt_trail"] = P("sky:bolt_trail", "sky_glow", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 7},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": 0.5, "direction": "outwards"},
        "minecraft:particle_initial_speed": "math.random(0.3, 1.2)",
        "minecraft:particle_lifetime_expression": {"max_lifetime": "math.random(0.5, 1.0)"},
        "minecraft:particle_appearance_billboard": billboard(["0.6 * " + LINEAR_OUT, "0.6 * " + LINEAR_OUT]),
        "minecraft:particle_appearance_tinting": {"color": [0.5, 0.9, 1.0, 0.9]},
    })

    out["sky:glass_shards_burst"] = P("sky:glass_shards_burst", "sky_shards", "particles_blend", {
        "minecraft:emitter_rate_instant": {"num_particles": 80},
        "minecraft:emitter_lifetime_once": {"active_time": 0.1},
        "minecraft:emitter_shape_sphere": {"radius": 4, "direction": "outwards"},
        "minecraft:particle_initial_speed": "math.random(5, 16)",
        "minecraft:particle_initial_spin": {"rotation": "math.random(0, 360)", "rotation_rate": "math.random(-240, 240)"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "math.random(6, 9)"},
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -9.8, 0], "linear_drag_coefficient": 0.12},
        "minecraft:particle_appearance_billboard": variant_uv(4, 64, ["0.5 + v.particle_random_2 * 1.4", "0.5 + v.particle_random_2 * 1.4"]),
        "minecraft:particle_appearance_tinting": {"color": [0.9, 0.96, 1.0, 1.0]},
        "minecraft:particle_appearance_lighting": {},
    })
    out["sky:glass_glitter"] = P("sky:glass_glitter", "sky_glow", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 140},
        "minecraft:emitter_lifetime_once": {"active_time": 0.1},
        "minecraft:emitter_shape_sphere": {"radius": 7, "direction": "outwards"},
        "minecraft:particle_initial_speed": "math.random(1, 4)",
        "minecraft:particle_lifetime_expression": {"max_lifetime": "math.random(5, 8)"},
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -3.5, 0], "linear_drag_coefficient": 0.5},
        "minecraft:particle_appearance_billboard": billboard(["0.08 + v.particle_random_1 * 0.12", "0.08 + v.particle_random_1 * 0.12"]),
        "minecraft:particle_appearance_tinting": {"color": [0.9, 0.97, 1.0, "(0.3 + 0.7 * math.abs(math.sin(v.particle_age * 420 + v.particle_random_2 * 360))) * " + LINEAR_OUT]},
    })
    out["sky:shard_shatter"] = P("sky:shard_shatter", "sky_shards", "particles_blend", {
        "minecraft:emitter_rate_instant": {"num_particles": 16},
        "minecraft:emitter_lifetime_once": {"active_time": 0.1},
        "minecraft:emitter_shape_sphere": {"radius": 0.3, "direction": "outwards"},
        "minecraft:particle_initial_speed": "math.random(2, 5)",
        "minecraft:particle_initial_spin": {"rotation": "math.random(0, 360)", "rotation_rate": "math.random(-400, 400)"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "math.random(0.6, 1.1)"},
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -14, 0], "linear_drag_coefficient": 0.3},
        "minecraft:particle_motion_collision": {"enabled": True, "collision_drag": 6, "coefficient_of_restitution": 0.3, "collision_radius": 0.05},
        "minecraft:particle_appearance_billboard": variant_uv(4, 64, [0.14, 0.14]),
        "minecraft:particle_appearance_tinting": {"color": [0.9, 0.96, 1.0, 1.0]},
        "minecraft:particle_appearance_lighting": {},
    })

    dust_alpha = "math.clamp(v.particle_age * 3.0, 0, 1) * math.clamp((v.particle_lifetime - v.particle_age) / (v.particle_lifetime * 0.45), 0, 1) * 0.9"
    out["sky:dust_cloud"] = P("sky:dust_cloud", "sky_dust", "particles_blend", {
        "minecraft:emitter_rate_instant": {"num_particles": 110},
        "minecraft:emitter_lifetime_once": {"active_time": 0.1},
        "minecraft:emitter_shape_disc": {"radius": 3.5, "plane_normal": [0, 1, 0], "direction": "outwards"},
        "minecraft:particle_initial_speed": "math.random(7, 22)",
        "minecraft:particle_initial_spin": {"rotation": "math.random(0, 360)", "rotation_rate": "math.random(-25, 25)"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "math.random(5, 9)"},
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 1.2, 0], "linear_drag_coefficient": 1.3},
        "minecraft:particle_appearance_billboard": variant_uv(4, 128, ["2.5 + v.particle_age * 1.4 + v.particle_random_2 * 2.0", "2.5 + v.particle_age * 1.4 + v.particle_random_2 * 2.0"]),
        "minecraft:particle_appearance_tinting": {"color": ["0.74 - v.particle_random_3 * 0.08", "0.68 - v.particle_random_3 * 0.08", "0.58 - v.particle_random_3 * 0.06", dust_alpha]},
        "minecraft:particle_appearance_lighting": {},
    })
    out["sky:dust_ring"] = P("sky:dust_ring", "sky_ring", "particles_blend", {
        "minecraft:emitter_rate_instant": {"num_particles": 2},
        "minecraft:emitter_lifetime_once": {"active_time": 0.1},
        "minecraft:emitter_shape_point": {"offset": [0, 0.6, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 1.0},
        "minecraft:particle_appearance_billboard": billboard(["2 + v.particle_age * 55.0 * (0.7 + v.particle_random_1 * 0.6)", "2 + v.particle_age * 55.0 * (0.7 + v.particle_random_1 * 0.6)"], "emitter_transform_xz", 128, 128, (0, 0), (128, 128)),
        "minecraft:particle_appearance_tinting": {"color": [0.86, 0.80, 0.70, "0.7 * (1.0 - v.particle_age)"]},
        "minecraft:particle_appearance_lighting": {},
    })
    out["sky:debris"] = P("sky:debris", "sky_debris", "particles_alpha", {
        "minecraft:emitter_rate_instant": {"num_particles": 60},
        "minecraft:emitter_lifetime_once": {"active_time": 0.1},
        "minecraft:emitter_shape_disc": {"radius": 2.5, "plane_normal": [0, 1, 0], "direction": ["math.random(-1, 1)", "math.random(1.0, 2.6)", "math.random(-1, 1)"]},
        "minecraft:particle_initial_speed": "math.random(9, 19)",
        "minecraft:particle_initial_spin": {"rotation": "math.random(0, 360)", "rotation_rate": "math.random(-300, 300)"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "math.random(2, 3.6)"},
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -24, 0], "linear_drag_coefficient": 0.1},
        "minecraft:particle_motion_collision": {"enabled": True, "collision_drag": 5, "coefficient_of_restitution": 0.25, "collision_radius": 0.25},
        "minecraft:particle_appearance_billboard": variant_uv(4, 32, ["0.25 + v.particle_random_2 * 0.5", "0.25 + v.particle_random_2 * 0.5"]),
        "minecraft:particle_appearance_lighting": {},
    })
    out["sky:crack_dust"] = P("sky:crack_dust", "sky_dust", "particles_blend", {
        "minecraft:emitter_rate_instant": {"num_particles": 5},
        "minecraft:emitter_lifetime_once": {"active_time": 0.1},
        "minecraft:emitter_shape_point": {"offset": [0, 0.5, 0], "direction": ["math.random(-0.4, 0.4)", 1, "math.random(-0.4, 0.4)"]},
        "minecraft:particle_initial_speed": "math.random(1.5, 3.5)",
        "minecraft:particle_initial_spin": {"rotation": "math.random(0, 360)", "rotation_rate": "math.random(-40, 40)"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "math.random(1.2, 2.2)"},
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -0.6, 0], "linear_drag_coefficient": 1.2},
        "minecraft:particle_appearance_billboard": variant_uv(4, 128, ["0.7 + v.particle_age * 1.2", "0.7 + v.particle_age * 1.2"]),
        "minecraft:particle_appearance_tinting": {"color": [0.7, 0.64, 0.55, "0.7 * " + LINEAR_OUT]},
        "minecraft:particle_appearance_lighting": {},
    })
    out["sky:dust_linger"] = P("sky:dust_linger", "sky_dust", "particles_blend", {
        "minecraft:emitter_rate_instant": {"num_particles": 3},
        "minecraft:emitter_lifetime_once": {"active_time": 0.1},
        "minecraft:emitter_shape_sphere": {"radius": 1.5, "direction": "outwards"},
        "minecraft:particle_initial_speed": "math.random(0.2, 0.6)",
        "minecraft:particle_initial_spin": {"rotation": "math.random(0, 360)", "rotation_rate": "math.random(-15, 15)"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "math.random(4, 7)"},
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.25, 0], "linear_drag_coefficient": 0.6},
        "minecraft:particle_appearance_billboard": variant_uv(4, 128, ["2.0 + v.particle_age * 0.5", "2.0 + v.particle_age * 0.5"]),
        "minecraft:particle_appearance_tinting": {"color": [0.72, 0.66, 0.57, "0.35 * " + FADE]},
        "minecraft:particle_appearance_lighting": {},
    })
    out["sky:arm_wind"] = P("sky:arm_wind", "sky_dust", "particles_blend", {
        "minecraft:emitter_rate_instant": {"num_particles": 36},
        "minecraft:emitter_lifetime_once": {"active_time": 0.1},
        "minecraft:emitter_shape_disc": {"radius": 5, "plane_normal": [0, 1, 0], "direction": "outwards"},
        "minecraft:particle_initial_speed": "math.random(8, 14)",
        "minecraft:particle_lifetime_expression": {"max_lifetime": "math.random(0.8, 1.4)"},
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 1.0},
        "minecraft:particle_appearance_billboard": variant_uv(4, 128, ["1.5 + v.particle_age * 2.5", "1.5 + v.particle_age * 2.5"]),
        "minecraft:particle_appearance_tinting": {"color": [0.95, 0.97, 1.0, "0.35 * " + LINEAR_OUT]},
    })
    out["sky:void_motes"] = P("sky:void_motes", "sky_glow", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 12},
        "minecraft:emitter_lifetime_once": {"active_time": 0.1},
        "minecraft:emitter_shape_sphere": {"radius": 6, "direction": "inwards"},
        "minecraft:particle_initial_speed": "math.random(0.3, 1.0)",
        "minecraft:particle_lifetime_expression": {"max_lifetime": "math.random(3, 5)"},
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -1.2, 0], "linear_drag_coefficient": 0.3},
        "minecraft:particle_appearance_billboard": billboard([0.2, 0.2]),
        "minecraft:particle_appearance_tinting": {"color": [0.55, 0.3, 0.8, "0.8 * " + FADE]},
    })
    out["sky:seal_glow"] = P("sky:seal_glow", "sky_glow", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 40},
        "minecraft:emitter_lifetime_once": {"active_time": 0.1},
        "minecraft:emitter_shape_sphere": {"radius": 10, "direction": "inwards"},
        "minecraft:particle_initial_speed": "math.random(3, 6)",
        "minecraft:particle_lifetime_expression": {"max_lifetime": "math.random(1.2, 2.2)"},
        "minecraft:particle_appearance_billboard": billboard([0.5, 0.5]),
        "minecraft:particle_appearance_tinting": {"color": [0.85, 0.96, 1.0, "0.9 * " + FADE]},
    })
    return out
