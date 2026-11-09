// Shader patches for MeshStandardMaterial:
//  - outfit: paints a fitted military outfit on the base body using its bind-pose
//    position (T-pose, metres, +Z forward), keeping the body's shading so the
//    fabric follows its shape.
//  - jiggle: small spring-driven secondary motion on chest and hips.
//  - hair sway: spring-driven motion of the lower part of the hair.
//  - zombie: rotten skin, torn clothes and blood.
import * as THREE from 'three';

const NOISE = /* glsl */ `
float zmHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float zmNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(zmHash(i + vec3(0,0,0)), zmHash(i + vec3(1,0,0)), f.x), mix(zmHash(i + vec3(0,1,0)), zmHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(zmHash(i + vec3(0,0,1)), zmHash(i + vec3(1,0,1)), f.x), mix(zmHash(i + vec3(0,1,1)), zmHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float zmFbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * zmNoise(p); p *= 2.03; a *= 0.5; } return v; }
`;

/** Adds `vBind` (bind-pose position) and optional jiggle to a skinned material's vertex shader. */
function patchVertex(shader, { jiggle = false, hair = false } = {}) {
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
varying vec3 vBind;
${jiggle ? `uniform vec3 uChestL; uniform vec3 uChestR; uniform vec3 uHipsL; uniform vec3 uHipsR;
uniform vec3 uChestOffL; uniform vec3 uChestOffR; uniform vec3 uHipsOffL; uniform vec3 uHipsOffR;` : ''}
${hair ? 'uniform vec3 uHairOffset; uniform float uHairTop;' : ''}`,
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
vBind = position;
${jiggle ? `{
  float front = smoothstep(-0.02, 0.06, position.z);
  float back = smoothstep(0.0, -0.08, position.z);
  transformed += uChestOffL * (1.0 - smoothstep(0.0, 0.105, distance(position, uChestL))) * front;
  transformed += uChestOffR * (1.0 - smoothstep(0.0, 0.105, distance(position, uChestR))) * front;
  transformed += uHipsOffL * (1.0 - smoothstep(0.0, 0.13, distance(position, uHipsL))) * back;
  transformed += uHipsOffR * (1.0 - smoothstep(0.0, 0.13, distance(position, uHipsR))) * back;
}` : ''}`,
    );
  if (hair) {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <skinning_vertex>',
      `#include <skinning_vertex>
{
  float hang = clamp((uHairTop - position.y) / 0.45, 0.0, 1.0);
  float behind = mix(0.35, 1.0, smoothstep(0.02, -0.08, position.z));
  transformed += uHairOffset * hang * hang * behind;
}`,
    );
  }
}

/**
 * Military outfit for the heroine. `m` holds bind-pose landmarks (metres).
 * Colors can be changed with the uniforms (see heroine.js).
 */
export function applyOutfit(material, uniforms) {
  material.customProgramCacheKey = () => 'outfit';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    patchVertex(shader, { jiggle: true });
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vBind;
uniform vec3 uShirt; uniform vec3 uCamoA; uniform vec3 uCamoB; uniform vec3 uCamoC; uniform vec3 uCamoD;
uniform vec3 uBoots; uniform vec3 uBelt; uniform vec3 uGloves; uniform vec3 uSkinTint;
varying float vRegionRough;
${NOISE}
// 0 skin, 1 shirt, 2 pants, 3 belt, 4 boots, 5 gloves
float zmRegion(vec3 p) {
  float ax = abs(p.x);
  if (ax > 0.615) return 5.0;                      // hands -> fingerless gloves
  bool arm = ax > 0.19 && p.y > 1.30;
  if (arm) return ax < 0.29 ? 1.0 : 0.0;           // short sleeves, bare forearms
  float neckR = length(vec2(p.x, p.z + 0.03));
  if (p.y > 1.505) return 0.0;                                       // head
  if (neckR < 0.072 && p.y > 1.43) return 0.0;                       // neck
  if (p.z > 0.0 && ax < 0.085 && p.y > 1.395 + ax * 0.6) return 0.0; // small V neckline
  if (p.y > 1.005) return 1.0;                      // fitted shirt
  if (p.y > 0.955) return 3.0;                      // belt
  if (p.y > 0.30) return 2.0;                       // pants
  return 4.0;                                       // boots
}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec3 p = vBind;
  float region = zmRegion(p);
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  float shade = clamp(lum / 0.5, 0.72, 1.18);
  float weave = 0.93 + 0.07 * zmNoise(p * 420.0);
  vec3 cloth = diffuseColor.rgb;
  if (region < 0.5) {
    cloth = diffuseColor.rgb * uSkinTint;
  } else if (region < 1.5) {
    cloth = uShirt * shade * weave;
    float hem = smoothstep(0.012, 0.0, abs(p.y - 1.012)) + smoothstep(0.01, 0.0, abs(abs(p.x) - 0.285)) * step(1.3, p.y);
    cloth *= 1.0 - 0.35 * clamp(hem, 0.0, 1.0);
  } else if (region < 2.5) {
    float n = zmFbm(p * vec3(16.0, 9.0, 16.0));
    float n2 = zmFbm(p * 19.0 + 13.0);
    float n3 = zmFbm(p * 24.0 + 41.0);
    vec3 camo = uCamoA;
    camo = mix(camo, uCamoB, smoothstep(0.46, 0.48, n));
    camo = mix(camo, uCamoC, smoothstep(0.55, 0.57, n2));
    camo = mix(camo, uCamoD, smoothstep(0.60, 0.62, n3));
    cloth = camo * shade * weave;
    float knee = (1.0 - smoothstep(0.035, 0.05, abs(p.y - 0.545))) * smoothstep(0.0, 0.03, p.z);
    cloth = mix(cloth, uBoots * 1.4 * shade, knee);
    float pocket = step(0.62, p.y) * step(p.y, 0.79) * smoothstep(0.15, 0.17, abs(p.x));
    cloth *= 1.0 - 0.18 * pocket;
  } else if (region < 3.5) {
    cloth = uBelt * shade;
    float buckle = step(abs(p.x), 0.03) * step(0.05, p.z);
    cloth = mix(cloth, vec3(0.55, 0.55, 0.5), buckle);
  } else if (region < 4.5) {
    cloth = uBoots * shade;
    float sole = 1.0 - smoothstep(0.02, 0.035, p.y);
    float lace = step(0.07, p.z) * step(0.1, p.y) * step(abs(p.x) - 0.1, 0.03) * step(0.5, fract(p.y * 60.0));
    cloth = mix(cloth, vec3(0.05), sole);
    cloth = mix(cloth, vec3(0.18), lace * 0.6);
  } else {
    float fingers = smoothstep(0.73, 0.70, abs(p.x));
    cloth = mix(diffuseColor.rgb * uSkinTint, uGloves * shade, fingers);
  }
  diffuseColor.rgb = cloth;
  vRegionRough = region;
}`,
      )
      .replace('varying float vRegionRough;', 'float vRegionRough = 0.0;')
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
if (vRegionRough > 0.5 && vRegionRough < 2.5) roughnessFactor = 0.88;
else if (vRegionRough > 3.5 && vRegionRough < 4.5) roughnessFactor = 0.42;
else if (vRegionRough > 2.5 && vRegionRough < 3.5) roughnessFactor = 0.6;
else if (vRegionRough > 4.5) roughnessFactor = 0.7;`,
      );
  };
}

/** Lower hair moves with a spring (see heroine.js). */
export function applyHairSway(material, uniforms) {
  material.customProgramCacheKey = () => 'hair';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    patchVertex(shader, { hair: true });
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
diffuseColor.rgb = vec3(dot(diffuseColor.rgb, vec3(0.3333))) / 0.55 * uHairTint;`,
    ).replace('#include <common>', '#include <common>\nuniform vec3 uHairTint;');
  };
}

/** Zombie look: grey-green rotten skin, torn dirty clothes, blood. */
export function applyZombie(material, uniforms, female) {
  material.customProgramCacheKey = () => (female ? 'zombie-f' : 'zombie-m');
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    patchVertex(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vBind;
uniform vec3 uShirtColor; uniform vec3 uPantsColor; uniform float uSeed; uniform float uHurt;
${NOISE}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec3 p = vBind;
  float ax = abs(p.x);
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  float shade = clamp(lum / 0.5, 0.7, 1.2);
  vec3 skin = mix(vec3(lum), diffuseColor.rgb, 0.25) * vec3(0.78, 0.86, 0.72);
  float rot = zmFbm(p * 11.0 + uSeed);
  skin = mix(skin, vec3(0.32, 0.36, 0.25) * shade, smoothstep(0.55, 0.75, rot) * 0.8);
  float veins = smoothstep(0.03, 0.0, abs(zmNoise(p * 38.0 + uSeed) - 0.5));
  skin = mix(skin, vec3(0.25, 0.22, 0.3), veins * 0.35);
  vec3 col = skin;
  float torn = smoothstep(0.62, 0.68, zmFbm(p * 14.0 + uSeed * 3.0));
  bool arm = ax > 0.2 && p.y > 1.3;
  float shirtTop = ${female ? '1.43' : '1.47'};
  if (!arm && p.y > 0.98 && p.y < shirtTop && torn < 0.5) col = uShirtColor * shade * (0.75 + 0.25 * zmNoise(p * 60.0));
  if (arm && ax < 0.32 && torn < 0.5) col = uShirtColor * shade;
  if (p.y < 0.98 && p.y > 0.09 && torn < 0.5) col = uPantsColor * shade * (0.8 + 0.2 * zmNoise(p * 90.0));
  float dirt = zmFbm(p * 6.0 + uSeed * 7.0);
  col *= 0.75 + 0.35 * dirt;
  float blood = smoothstep(0.58, 0.64, zmFbm(p * 9.0 + uSeed * 5.0)) * (step(1.0, p.y) * step(0.0, p.z));
  float mouth = (1.0 - smoothstep(0.0, 0.06, distance(p, vec3(0.0, ${female ? '1.575' : '1.62'}, 0.10))));
  col = mix(col, vec3(0.28, 0.02, 0.02), clamp(blood * 0.85 + mouth * 0.9 + uHurt * 0.5 * blood, 0.0, 1.0));
  diffuseColor.rgb = col;
}`,
      );
  };
}

/** Uniform helpers. */
export const v3 = (x, y, z) => ({ value: new THREE.Vector3(x, y, z) });
export const col = (hex) => ({ value: new THREE.Color(hex) });
