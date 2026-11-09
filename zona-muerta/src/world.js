// The small open world: an abandoned town with a military outpost, streets,
// buildings, cars and props. Static geometry is merged per material (few draw
// calls on phones). Also handles collisions, line of sight, sky and day/night.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const MAP_HALF = 70;
export const START = new THREE.Vector3(-30, 0, -14);

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scales a BoxGeometry's UVs so textures tile every `tile` metres. */
function boxUV(geo, w, h, d, tile) {
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * dims[f][0] / tile, uv.getY(idx) * dims[f][1] / tile);
    }
  }
  return geo;
}

function planeUV(geo, w, d, tile) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile);
  return geo;
}

export function createWorld(scene, tex, { shadows = true } = {}) {
  const rand = rng(20261108);
  const buckets = new Map();
  const obstacles = [];
  const circles = [];
  const loot = [];

  const pbr = (t, extra = {}) => new THREE.MeshStandardMaterial({ map: t?.map, normalMap: t?.normal, roughness: 0.9, ...extra });
  const mats = {
    grass: pbr(tex.grass, { color: '#9aa37a' }),
    ground: pbr(tex.ground, { color: '#a08f7c' }),
    asphalt: pbr(tex.asphalt, { color: '#8a8a8a' }),
    sidewalk: pbr(tex.concrete, { color: '#b0aca4' }),
    plaster: pbr(tex.plaster, { color: '#d8cdb8' }),
    plasterBlue: pbr(tex.plaster, { color: '#9fb1bd' }),
    brick: pbr(tex.brick),
    concrete: pbr(tex.concrete, { color: '#a7a39b' }),
    shutter: pbr(tex.shutter, { roughness: 0.7, metalness: 0.3 }),
    wood: pbr(tex.wood, { color: '#a0805e' }),
    rust: pbr(tex.metal, { roughness: 0.75, metalness: 0.35 }),
    roof: pbr(tex.concrete, { color: '#5e5a55' }),
    glass: new THREE.MeshStandardMaterial({ color: '#141a20', roughness: 0.15, metalness: 0.6 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: '#2b2e31', roughness: 0.5, metalness: 0.6 }),
    tire: new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.95 }),
    sandbag: pbr(tex.ground, { color: '#c2ad84' }),
    olive: new THREE.MeshStandardMaterial({ color: '#4b5636', roughness: 0.9 }),
    tent: new THREE.MeshStandardMaterial({ color: '#56613f', roughness: 0.95, side: THREE.DoubleSide }),
    foliage: new THREE.MeshStandardMaterial({ color: '#3e5a2e', roughness: 1, flatShading: true }),
    foliageDry: new THREE.MeshStandardMaterial({ color: '#6b6a35', roughness: 1, flatShading: true }),
    trunk: new THREE.MeshStandardMaterial({ color: '#4a3826', roughness: 1 }),
    dumpster: new THREE.MeshStandardMaterial({ color: '#2f4a35', roughness: 0.7, metalness: 0.3 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffd27a', emissiveIntensity: 0 }),
    red: new THREE.MeshStandardMaterial({ color: '#a51d1d', roughness: 0.6 }),
    white: new THREE.MeshStandardMaterial({ color: '#e8e4dc', roughness: 0.7 }),
  };

  const add = (geo, mat, x = 0, y = 0, z = 0, ry = 0) => {
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
    geo.applyMatrix4(m);
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat).push(geo);
  };
  const box = (mat, w, h, d, x, y, z, ry = 0, tile = 2) => add(boxUV(new THREE.BoxGeometry(w, h, d), w, h, d, tile), mat, x, y + h / 2, z, ry);
  const block = (minX, maxX, minZ, maxZ, h) => obstacles.push({ minX, maxX, minZ, maxZ, h });
  const blockRotated = (x, z, w, d, ry, h) => {
    const c = Math.abs(Math.cos(ry));
    const s = Math.abs(Math.sin(ry));
    const hw = (w * c + d * s) / 2;
    const hd = (w * s + d * c) / 2;
    block(x - hw, x + hw, z - hd, z + hd, h);
  };
  const addLoot = (type, x, z, label) => loot.push({ id: loot.length, type, label, pos: new THREE.Vector3(x, 0, z), readyAt: 0 });

  // ---- ground and streets
  add(planeUV(new THREE.PlaneGeometry(MAP_HALF * 2 + 20, MAP_HALF * 2 + 20).rotateX(-Math.PI / 2), MAP_HALF * 2 + 20, MAP_HALF * 2 + 20, 5), mats.grass);
  const road = (w, d, x, z) => add(planeUV(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), w, d, 6), mats.asphalt, x, 0.02, z);
  const walk = (w, d, x, z) => add(planeUV(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), w, d, 2.5), mats.sidewalk, x, 0.025, z);
  road(MAP_HALF * 2, 8, 0, 0);
  road(8, MAP_HALF * 2, 0, 0);
  for (const s of [-1, 1]) {
    walk(MAP_HALF * 2, 2, 0, s * 5);
    walk(2, MAP_HALF * 2, s * 5, 0);
  }
  // dirt yard of the outpost and the gas station
  add(planeUV(new THREE.PlaneGeometry(26, 20).rotateX(-Math.PI / 2), 26, 20, 4), mats.ground, -30, 0.015, -20);
  add(planeUV(new THREE.PlaneGeometry(22, 18).rotateX(-Math.PI / 2), 22, 18, 6), mats.asphalt, -55, 0.018, -22);
  // road markings
  for (let x = -MAP_HALF + 4; x < MAP_HALF; x += 6) if (Math.abs(x) > 7) box(mats.white, 2.4, 0.01, 0.18, x, 0.022, 0);
  for (let z = -MAP_HALF + 4; z < MAP_HALF; z += 6) if (Math.abs(z) > 7) box(mats.white, 0.18, 0.01, 2.4, 0, 0.022, z);

  // ---- perimeter walls
  const wallH = 4;
  for (const s of [-1, 1]) {
    box(mats.concrete, MAP_HALF * 2 + 2, wallH, 1, 0, 0, s * (MAP_HALF + 0.5), 0, 3);
    box(mats.concrete, 1, wallH, MAP_HALF * 2 + 2, s * (MAP_HALF + 0.5), 0, 0, 0, 3);
  }

  // ---- buildings
  const windowGeo = new THREE.PlaneGeometry(1.1, 1.4);
  const windows = [];
  const building = ({ x, z, w, d, h, mat, name, loot: lootType, door = 'z' }) => {
    box(mat, w, h, d, x, 0, z, 0, 2.5);
    box(mats.roof, w + 0.5, 0.35, d + 0.5, x, h, z, 0, 3);
    box(mats.roof, w + 0.1, 0.25, 0.25, x, 3.1, z + d / 2 + 0.1, 0, 3);
    block(x - w / 2, x + w / 2, z - d / 2, z + d / 2, h);
    // windows on every facade, one row per floor
    for (let fy = 1.9; fy < h - 1; fy += 3) {
      for (let wx = -w / 2 + 1.8; wx <= w / 2 - 1.8; wx += 2.6) {
        windows.push([x + wx, fy, z + d / 2 + 0.02, 0], [x + wx, fy, z - d / 2 - 0.02, Math.PI]);
      }
      for (let wz = -d / 2 + 1.8; wz <= d / 2 - 1.8; wz += 2.6) {
        windows.push([x + w / 2 + 0.02, fy, z + wz, Math.PI / 2], [x - w / 2 - 0.02, fy, z + wz, -Math.PI / 2]);
      }
    }
    // door facing the nearest street
    const dz = door === 'z' ? (z > 0 ? -1 : 1) : 0;
    const dx = door === 'x' ? (x > 0 ? -1 : 1) : 0;
    const doorX = x + dx * (w / 2 + 0.03);
    const doorZ = z + dz * (d / 2 + 0.03);
    add(planeUV(new THREE.PlaneGeometry(1.4, 2.3), 1.4, 2.3, 1.4), mats.wood, doorX, 1.15, doorZ, dz ? (dz > 0 ? 0 : Math.PI) : (dx > 0 ? Math.PI / 2 : -Math.PI / 2));
    if (name === 'Clínica') {
      box(mats.white, 2.4, 2.4, 0.1, x, h - 3, z + dz * (d / 2 + 0.06));
      box(mats.red, 1.8, 0.5, 0.12, x, h - 2.05, z + dz * (d / 2 + 0.07));
      box(mats.red, 0.5, 1.8, 0.12, x, h - 2.7, z + dz * (d / 2 + 0.07));
    }
    if (lootType) addLoot(lootType, doorX + dx * 1.2 + (dz ? 1.6 : 0), doorZ + dz * 1.2 + (dx ? 1.6 : 0), name);
  };
  const B = [
    { x: 18, z: 16, w: 10, d: 9, h: 5.5, mat: mats.plaster, name: 'Casa', loot: 'casa' },
    { x: 34, z: 17, w: 12, d: 10, h: 6, mat: mats.plasterBlue, name: 'Casa', loot: 'casa' },
    { x: 54, z: 18, w: 11, d: 11, h: 5.5, mat: mats.brick, name: 'Casa' },
    { x: 20, z: 42, w: 12, d: 12, h: 7, mat: mats.brick, name: 'Bloque' },
    { x: 44, z: 44, w: 14, d: 12, h: 8, mat: mats.concrete, name: 'Clínica', loot: 'botiquin' },
    { x: 58, z: 58, w: 9, d: 9, h: 5, mat: mats.plaster, name: 'Casa', loot: 'casa' },
    { x: -18, z: 16, w: 14, d: 10, h: 7, mat: mats.brick, name: 'Tienda', loot: 'tienda' },
    { x: -38, z: 18, w: 12, d: 10, h: 6, mat: mats.plaster, name: 'Casa', loot: 'casa' },
    { x: -56, z: 17, w: 10, d: 10, h: 5, mat: mats.brick, name: 'Casa' },
    { x: -24, z: 44, w: 16, d: 12, h: 9, mat: mats.concrete, name: 'Comisaría', loot: 'militar' },
    { x: -52, z: 46, w: 12, d: 14, h: 6, mat: mats.plasterBlue, name: 'Casa', loot: 'casa' },
    { x: 36, z: -22, w: 26, d: 16, h: 8, mat: mats.shutter, name: 'Almacén', loot: 'caja' },
    { x: 18, z: -48, w: 12, d: 10, h: 6, mat: mats.brick, name: 'Taller', loot: 'caja' },
    { x: 50, z: -52, w: 14, d: 12, h: 7, mat: mats.concrete, name: 'Oficinas' },
    { x: -20, z: -50, w: 12, d: 10, h: 5, mat: mats.plaster, name: 'Casa', loot: 'casa' },
    { x: -48, z: -54, w: 10, d: 10, h: 5, mat: mats.brick, name: 'Casa' },
  ];
  B.forEach(building);
  // A few windows still have a light on at night; the rest stay dark.
  const lit = windows.filter(() => rand() < 0.18);
  const dark = windows.filter((w) => !lit.includes(w));
  const glassMat = new THREE.MeshStandardMaterial({ color: '#10161c', roughness: 0.2, metalness: 0.5 });
  const winMesh = new THREE.InstancedMesh(windowGeo, new THREE.MeshStandardMaterial({ color: '#10161c', roughness: 0.2, metalness: 0.5, emissive: '#ffbf66', emissiveIntensity: 0 }), lit.length);
  const darkMesh = new THREE.InstancedMesh(windowGeo, glassMat, dark.length);
  const tmpM = new THREE.Matrix4();
  lit.forEach(([x, y, z, ry], i) => winMesh.setMatrixAt(i, tmpM.makeRotationY(ry).setPosition(x, y, z)));
  dark.forEach(([x, y, z, ry], i) => darkMesh.setMatrixAt(i, tmpM.makeRotationY(ry).setPosition(x, y, z)));
  scene.add(winMesh, darkMesh);

  // ---- gas station
  for (const [px, pz] of [[-63, -27], [-47, -27], [-63, -17], [-47, -17]]) box(mats.white, 0.4, 4.2, 0.4, px, 0, pz);
  box(mats.white, 18, 0.5, 12, -55, 4.2, -22, 0, 3);
  box(mats.red, 18.1, 0.25, 12.1, -55, 4.35, -22, 0, 3);
  for (const px of [-58, -52]) {
    box(mats.darkMetal, 0.8, 1.6, 0.6, px, 0, -22);
    block(px - 0.4, px + 0.4, -22.3, -21.7, 1.6);
  }
  addLoot('tienda', -55, -26, 'Gasolinera');

  // ---- military outpost (start)
  const sandbags = (x, z, len, ry) => {
    for (let i = 0; i < len; i++) {
      const ox = Math.cos(ry) * (i - (len - 1) / 2) * 1.2;
      const oz = -Math.sin(ry) * (i - (len - 1) / 2) * 1.2;
      for (let row = 0; row < 3; row++) {
        add(new THREE.CapsuleGeometry(0.22, 0.75, 3, 8).rotateZ(Math.PI / 2).scale(1, 0.8, 1.1), mats.sandbag, x + ox + (row % 2 ? 0.3 * Math.cos(ry) : 0), 0.2 + row * 0.33, z + oz, ry);
      }
    }
    blockRotated(x, z, len * 1.2, 0.6, ry, 1);
  };
  sandbags(-30, -8, 8, 0);
  sandbags(-41, -18, 7, Math.PI / 2);
  sandbags(-19, -18, 7, Math.PI / 2);
  // tent
  const tentGeo = new THREE.CylinderGeometry(0.01, 3.2, 2.6, 4, 1, true).rotateY(Math.PI / 4).scale(1.4, 1, 1);
  add(tentGeo, mats.tent, -34, 1.3, -24);
  block(-38.5, -29.5, -27.2, -20.8, 2.6);
  for (const [cx, cz] of [[-24, -24], [-26, -24], [-25, -22.8]]) {
    box(mats.olive, 1.1, 0.7, 0.8, cx, 0, cz);
    block(cx - 0.6, cx + 0.6, cz - 0.45, cz + 0.45, 0.7);
  }
  addLoot('militar', -25, -21.6, 'Cajas militares');
  // flag
  box(mats.darkMetal, 0.08, 6, 0.08, -30, 0, -26);
  const flagGeo = new THREE.PlaneGeometry(1.6, 1, 12, 4);
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: '#4b5636', side: THREE.DoubleSide, roughness: 1 }));
  flag.position.set(-29.18, 5.4, -26);
  scene.add(flag);
  const flagBase = flagGeo.attributes.position.array.slice();

  // ---- cars
  const carColors = ['#7d2b22', '#2b4a6b', '#6d6d62', '#3d5a3a', '#8a7a52'];
  const cars = [[-20, 2.2, 0.08], [12, -2.4, 3.05], [40, 2, -0.1], [2.4, 24, 1.62], [-2.2, -30, 1.5], [58, -2.4, 3.2], [-48, 2.3, 0.15], [-2.5, 52, 1.7], [28, 30, 0.9], [-36, -38, 2.4]];
  cars.forEach(([x, z, ry], i) => {
    const paint = new THREE.MeshStandardMaterial({ map: tex.metal?.map, color: carColors[i % carColors.length], roughness: 0.6, metalness: 0.4 });
    box(paint, 4.2, 0.85, 1.8, x, 0.35, z, ry);
    const cab = new THREE.BoxGeometry(2.2, 0.7, 1.62);
    add(cab, mats.glass, x - Math.cos(ry) * 0.2, 1.55, z + Math.sin(ry) * 0.2, ry);
    for (const [wx, wz] of [[1.35, 0.85], [1.35, -0.85], [-1.35, 0.85], [-1.35, -0.85]]) {
      const c = Math.cos(ry);
      const s = Math.sin(ry);
      add(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 12).rotateX(Math.PI / 2), mats.tire, x + wx * c + wz * s, 0.36, z - wx * s + wz * c, ry);
    }
    blockRotated(x, z, 4.3, 1.9, ry, 1.9);
    addLoot('coche', x - Math.cos(ry) * 2.6, z + Math.sin(ry) * 2.6, 'Maletero');
  });

  // ---- crates, dumpsters, barrels, barriers
  const crates = [[24, 9.5], [47, 10.2], [-12, 9.5], [-44, 10], [28, -11], [52, -12], [15, -36], [-14, -40], [9.5, 60], [-60, 30]];
  crates.forEach(([x, z]) => {
    box(mats.wood, 1, 1, 1, x, 0, z, rand() * 0.5, 1);
    block(x - 0.6, x + 0.6, z - 0.6, z + 0.6, 1);
    addLoot('caja', x + 1.2, z, 'Caja');
  });
  const dumpsters = [[-26, 10], [10, 34], [28, -36], [-10, 30], [60, 30]];
  dumpsters.forEach(([x, z]) => {
    box(mats.dumpster, 2, 1.3, 1.2, x, 0, z);
    block(x - 1.05, x + 1.05, z - 0.65, z + 0.65, 1.3);
    addLoot('contenedor', x, z + (z > 0 ? -1.3 : 1.3), 'Contenedor');
  });
  for (let i = 0; i < 18; i++) {
    const x = (rand() - 0.5) * 120;
    const z = (rand() - 0.5) * 120;
    if (Math.abs(x) < 7 || Math.abs(z) < 7 || hits(x, z, 1.2)) continue;
    add(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10), mats.rust, x, 0.45, z);
    circles.push({ x, z, r: 0.35 });
  }
  for (const [x, z, ry] of [[-8, 1.5, 0], [8, -1.5, 0], [-1.5, 10, Math.PI / 2], [1.5, -10, Math.PI / 2], [26, 0, 0.2], [-6, 40, 1.4]]) {
    box(mats.concrete, 2, 0.85, 0.5, x, 0, z, ry, 1);
    blockRotated(x, z, 2, 0.5, ry, 0.85);
  }

  // ---- trees and street lamps
  const lamps = [];
  for (let i = 0; i < 70; i++) {
    const x = (rand() - 0.5) * 130;
    const z = (rand() - 0.5) * 130;
    if (Math.abs(x) < 8 || Math.abs(z) < 8 || hits(x, z, 2.5)) continue;
    const h = 2.6 + rand() * 1.6;
    add(new THREE.CylinderGeometry(0.14, 0.22, h, 7), mats.trunk, x, h / 2, z);
    const leaves = rand() < 0.3 ? mats.foliageDry : mats.foliage;
    for (let k = 0; k < 3; k++) {
      const r = 1.1 + rand() * 0.8;
      add(new THREE.IcosahedronGeometry(r, 0), leaves, x + (rand() - 0.5) * 1.2, h + r * 0.4 + k * 0.6, z + (rand() - 0.5) * 1.2, rand() * 3);
    }
    circles.push({ x, z, r: 0.35 });
  }
  for (let i = -60; i <= 60; i += 20) {
    for (const [x, z, ry] of [[i, 6.2, 0], [6.2, i + 10, Math.PI / 2]]) {
      if (Math.abs(x) < 7 && Math.abs(z) < 7) continue;
      box(mats.darkMetal, 0.14, 5, 0.14, x, 0, z);
      box(mats.darkMetal, 0.12, 0.12, 1.2, x, 4.9, z - 0.55, ry);
      box(mats.lamp, 0.35, 0.12, 0.5, x, 4.78, z - 0.9, ry);
      lamps.push([x, z]);
      circles.push({ x, z, r: 0.2 });
    }
  }

  function hits(x, z, margin) {
    return obstacles.some((o) => x > o.minX - margin && x < o.maxX + margin && z > o.minZ - margin && z < o.maxZ + margin);
  }

  // ---- merge static geometry
  for (const [mat, geos] of buckets) {
    const nonIndexed = geos.map((g) => (g.index ? g.toNonIndexed() : g));
    for (const g of nonIndexed) for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(key)) g.deleteAttribute(key);
    const merged = mergeGeometries(nonIndexed, false);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = mat !== mats.grass && mat !== mats.asphalt && mat !== mats.sidewalk && mat !== mats.ground && mat !== mats.white;
    scene.add(mesh);
  }

  // ---- spawn points for zombies (open ground away from obstacles)
  const spawns = [];
  for (let i = 0; i < 400 && spawns.length < 90; i++) {
    const x = (rand() - 0.5) * 130;
    const z = (rand() - 0.5) * 130;
    if (!hits(x, z, 1.5) && !circles.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1)) spawns.push(new THREE.Vector3(x, 0, z));
  }

  // ---- sky, lights and fog
  const skyUniforms = {
    uTop: { value: new THREE.Color('#5d8ec4') },
    uHorizon: { value: new THREE.Color('#c7d6e2') },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color('#fff2d0') },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 24, 12),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y, 0.0, 1.0); vec3 c = mix(uHorizon, uTop, pow(h, 0.55));
        float sun = pow(max(dot(normalize(vDir), uSunDir), 0.0), 220.0) + 0.25 * pow(max(dot(normalize(vDir), uSunDir), 0.0), 12.0);
        gl_FragColor = vec4(c + uSunColor * sun, 1.0); }`,
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);
  const starGeo = new THREE.BufferGeometry();
  const starPos = [];
  for (let i = 0; i < 500; i++) {
    const v = new THREE.Vector3(rand() - 0.5, rand() * 0.9 + 0.1, rand() - 0.5).normalize().multiplyScalar(380);
    starPos.push(v.x, v.y, v.z);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(stars);

  const hemi = new THREE.HemisphereLight('#cfe0ff', '#5a5040', 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff2d0', 2.2);
  sun.castShadow = shadows;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  scene.fog = new THREE.FogExp2('#b8c6cf', 0.012);

  const KEYS = [
    // hour, top, horizon, fog, sun color, sun intensity, hemi intensity, fog density
    [0, '#04060d', '#111827', '#0a0e17', '#7f95c8', 0.45, 0.22, 0.032],
    [5, '#0b1020', '#2b2a3a', '#1a1c26', '#8fa0c8', 0.35, 0.25, 0.03],
    [6.5, '#4a5f8a', '#e7a46a', '#9a8a80', '#ffb070', 1.0, 0.5, 0.02],
    [9, '#5d8ec4', '#c7d6e2', '#b8c6cf', '#fff2d0', 2.0, 0.85, 0.012],
    [15, '#5a8bc2', '#cdd8e0', '#bcc8cf', '#fff2d8', 2.2, 0.9, 0.012],
    [18, '#3b4a7a', '#e39a5a', '#8a7a72', '#ffa860', 1.1, 0.55, 0.018],
    [19.5, '#121a33', '#3b2f45', '#20202c', '#9a8fc0', 0.45, 0.3, 0.026],
    [24, '#04060d', '#111827', '#0a0e17', '#7f95c8', 0.45, 0.22, 0.032],
  ];
  const ca = new THREE.Color();
  const cb = new THREE.Color();
  const lerpColor = (target, a, b, t) => target.copy(ca.set(a)).lerp(cb.set(b), t);

  const DAY_LENGTH = 600; // real seconds for 24 game hours
  const state = { hour: 8.5, night: false };

  function update(dt, playerPos) {
    state.hour = (state.hour + (dt * 24) / DAY_LENGTH) % 24;
    const h = state.hour;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
    const [h0, ...a] = KEYS[i];
    const [h1, ...b] = KEYS[i + 1];
    const t = (h - h0) / (h1 - h0);
    lerpColor(skyUniforms.uTop.value, a[0], b[0], t);
    lerpColor(skyUniforms.uHorizon.value, a[1], b[1], t);
    lerpColor(scene.fog.color, a[2], b[2], t);
    lerpColor(sun.color, a[3], b[3], t);
    skyUniforms.uSunColor.value.copy(sun.color).multiplyScalar(state.night ? 0.25 : 1);
    sun.intensity = THREE.MathUtils.lerp(a[4], b[4], t);
    hemi.intensity = THREE.MathUtils.lerp(a[5], b[5], t);
    scene.fog.density = THREE.MathUtils.lerp(a[6], b[6], t);

    // sun by day, moon by night (same light)
    const dayAngle = ((h - 6) / 12) * Math.PI;
    state.night = h < 6 || h > 19;
    const angle = state.night ? ((h + (h < 6 ? 24 : 0) - 19) / 11) * Math.PI : dayAngle;
    const dir = new THREE.Vector3(Math.cos(angle) * 0.8, Math.max(0.25, Math.sin(angle)), 0.45).normalize();
    skyUniforms.uSunDir.value.copy(dir);
    sun.position.copy(playerPos).addScaledVector(dir, 40);
    sun.target.position.copy(playerPos);
    sky.position.copy(playerPos);
    stars.position.copy(playerPos);
    stars.material.opacity = THREE.MathUtils.clamp(1 - sun.intensity * 1.2, 0, 0.9);
    winMesh.material.emissiveIntensity = state.night ? 0.6 : 0;
    mats.lamp.emissiveIntensity = state.night ? 2.5 : 0;

    // waving flag
    const p = flagGeo.attributes.position;
    const time = performance.now() / 1000;
    for (let k = 0; k < p.count; k++) {
      const x = flagBase[k * 3] + 0.8;
      p.setZ(k, Math.sin(x * 3 - time * 4) * 0.12 * x);
    }
    p.needsUpdate = true;
  }

  // ---- collisions
  function collide(pos, r) {
    for (const o of obstacles) {
      const cx = Math.max(o.minX, Math.min(pos.x, o.maxX));
      const cz = Math.max(o.minZ, Math.min(pos.z, o.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * r;
          pos.z = cz + (dz / d) * r;
        } else {
          // inside the box: push out along the shortest axis
          const pushes = [[o.minX - r - pos.x, 0], [o.maxX + r - pos.x, 0], [0, o.minZ - r - pos.z], [0, o.maxZ + r - pos.z]];
          pushes.sort((p1, p2) => Math.abs(p1[0] + p1[1]) - Math.abs(p2[0] + p2[1]));
          pos.x += pushes[0][0];
          pos.z += pushes[0][1];
        }
      }
    }
    for (const c of circles) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < c.r + r && d > 1e-6) {
        pos.x = c.x + (dx / d) * (c.r + r);
        pos.z = c.z + (dz / d) * (c.r + r);
      }
    }
    pos.x = THREE.MathUtils.clamp(pos.x, -MAP_HALF + r, MAP_HALF - r);
    pos.z = THREE.MathUtils.clamp(pos.z, -MAP_HALF + r, MAP_HALF - r);
    return pos;
  }

  /** Returns the fraction (0..1) of the segment a→b before it hits a box, or 1. */
  function raycast(a, b) {
    let best = 1;
    const d = new THREE.Vector3().subVectors(b, a);
    for (const o of obstacles) {
      let tmin = 0;
      let tmax = best;
      const axes = [[a.x, d.x, o.minX, o.maxX], [a.y, d.y, 0, o.h], [a.z, d.z, o.minZ, o.maxZ]];
      let hit = true;
      for (const [p0, dir, mn, mx] of axes) {
        if (Math.abs(dir) < 1e-9) {
          if (p0 < mn || p0 > mx) { hit = false; break; }
        } else {
          let t1 = (mn - p0) / dir;
          let t2 = (mx - p0) / dir;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) { hit = false; break; }
        }
      }
      if (hit && tmin < best) best = tmin;
    }
    return best;
  }

  return { obstacles, circles, loot, spawns, collide, raycast, update, state, sun, hemi };
}
