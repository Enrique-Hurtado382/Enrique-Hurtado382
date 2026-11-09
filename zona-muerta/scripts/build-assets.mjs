// Converts the CC0 Quaternius packs into small GLB files for mobile:
//   heroine.glb, hair-long.glb, hair-buns.glb, zombie-male.glb, anims.glb
//
// Usage: npm run assets -- "<carpeta Universal Base Characters[Standard]>" "<carpeta Universal Animation Library[Standard]>"
// Download both packs (free, CC0) from https://quaternius.com
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [ubcDir, ualDir] = process.argv.slice(2);
if (!ubcDir || !ualDir) {
  console.error('Uso: npm run assets -- "<Universal Base Characters[Standard]>" "<Universal Animation Library[Standard]>"');
  process.exit(1);
}

const out = new URL('../public/models/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// Some glTF files reference "X_png.png" names that ship as "X.png"; copy into a
// scratch folder and add the missing aliases so the files load.
function staged(dir) {
  const tmp = mkdtempSync(join(tmpdir(), 'zm-'));
  cpSync(dir, tmp, { recursive: true });
  for (const file of readdirSync(tmp)) {
    const alias = file.replace(/\.png$/, '_png.png');
    if (file.endsWith('.png') && !file.endsWith('_png.png') && !existsSync(join(tmp, alias))) cpSync(join(tmp, file), join(tmp, alias));
  }
  return tmp;
}

async function convert(file, target, size) {
  const doc = await io.read(file);
  await doc.transform(
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 }),
  );
  await io.write(join(out, target), doc);
  console.log('✔', target);
}

const bodyDir = staged(join(ubcDir, 'Base Characters', 'Godot - UE'));
await convert(join(bodyDir, 'Superhero_Female_FullBody.gltf'), 'heroine.glb', 1024);
await convert(join(bodyDir, 'Superhero_Male_FullBody.gltf'), 'zombie-male.glb', 512);

const hairDir = staged(join(ubcDir, 'Hairstyles', 'Rigged to Head Bone', 'glTF (Godot -Unreal)'));
await convert(join(hairDir, 'Hair_Long.gltf'), 'hair-long.glb', 512);
await convert(join(hairDir, 'Hair_Buns.gltf'), 'hair-buns.glb', 512);

// Animations only: drop the mannequin mesh and keep the clips the game uses.
const KEEP = new Set([
  'Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Walk_Formal_Loop',
  'Pistol_Idle_Loop', 'Pistol_Aim_Neutral', 'Pistol_Shoot', 'Pistol_Reload',
  'Punch_Jab', 'Punch_Cross', 'Sword_Attack', 'Roll',
  'Death01', 'Hit_Chest', 'Hit_Head', 'Interact', 'PickUp_Table',
  'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Push_Loop',
]);
const anims = await io.read(join(ualDir, 'Unreal-Godot', 'UAL1_Standard.glb'));
const root = anims.getRoot();
for (const anim of root.listAnimations()) if (!KEEP.has(anim.getName())) anim.dispose();
for (const node of root.listNodes()) if (node.getMesh()) node.setMesh(null);
for (const mesh of root.listMeshes()) mesh.dispose();
await anims.transform(resample({ tolerance: 0.0005 }), prune({ keepLeaves: true }), dedup());
await io.write(join(out, 'anims.glb'), anims);
console.log('✔ anims.glb', root.listAnimations().length, 'animaciones');
