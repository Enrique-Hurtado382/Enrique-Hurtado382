// Zombies: looks, animation and AI (wander → notice → chase → attack).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { applyZombie, col } from './shaders.js';

const SHIRTS = ['#6b6e5a', '#5a3b3b', '#3b4a5a', '#8a8470', '#2f2f33', '#6a5040', '#4a5a3a'];
const PANTS = ['#2c3a52', '#3a3530', '#2b2b2b', '#4a4436', '#3d4a5a'];
const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _inv = new THREE.Quaternion();
const _v = new THREE.Vector3();

/** Rotates a bone around a world-space axis (applied after the animation). */
function rotateBoneWorld(bone, axis, angle) {
  bone.parent.getWorldQuaternion(_pq);
  _inv.copy(_pq).invert();
  _q.setFromAxisAngle(axis, angle);
  bone.quaternion.premultiply(_inv.multiply(_q).multiply(_pq));
}

export class Zombies {
  constructor(scene, assets, templates, world, hooks) {
    this.scene = scene;
    this.clips = Object.fromEntries(assets.clips.map((c) => [c.name, c]));
    this.templates = templates; // { male: Object3D, female: Object3D }
    this.world = world;
    this.hooks = hooks; // { onKill, onPlayerHit, sound }
    this.list = [];
    this.timer = 0;
    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false }),
    );
  }

  create(female, pos) {
    const model = cloneSkinned(female ? this.templates.female : this.templates.male);
    const uniforms = {
      uShirtColor: col(SHIRTS[Math.floor(Math.random() * SHIRTS.length)]),
      uPantsColor: col(PANTS[Math.floor(Math.random() * PANTS.length)]),
      uSeed: { value: Math.random() * 100 },
      uHurt: { value: 0 },
    };
    const bones = {};
    model.traverse((o) => {
      if (o.isBone) bones[o.name] = o;
      if (!o.isMesh) return;
      o.frustumCulled = false;
      if (/Eyebrows/.test(o.name)) o.visible = false;
      else if (/Eyes/.test(o.name)) {
        o.material = o.material.clone();
        o.material.color.set('#d8d2a0');
        o.material.emissive = new THREE.Color('#3a3410');
      } else {
        o.material = o.material.clone();
        applyZombie(o.material, uniforms, female);
      }
    });
    const root = new THREE.Group();
    root.add(model);
    const shadow = this.blob.clone();
    shadow.position.y = 0.03;
    root.add(shadow);
    const scale = 0.94 + Math.random() * 0.12;
    model.scale.setScalar(scale);
    const mixer = new THREE.AnimationMixer(model);
    const act = (name, once = false, ts = 1) => {
      const a = mixer.clipAction(this.clips[name]);
      if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      a.timeScale = ts;
      return a;
    };
    const runner = Math.random() < 0.25;
    const z = {
      root, model, mixer, bones, uniforms, female, runner,
      actions: {
        idle: act('Idle_Loop', false, 0.6),
        walk: act('Walk_Loop', false, 0.55),
        run: act(runner ? 'Jog_Fwd_Loop' : 'Walk_Loop', false, runner ? 0.95 : 0.95),
        attack: act(Math.random() < 0.5 ? 'Punch_Jab' : 'Punch_Cross', true, 0.8),
        hit: act('Hit_Chest', true, 1.2),
        death: act('Death01', true, 0.9),
      },
      current: null,
      pos: pos.clone(),
      yaw: Math.random() * Math.PI * 2,
      state: 'wander',
      target: null,
      health: 100,
      stateT: 0,
      attackCd: 0,
      attackHit: false,
      senseT: Math.random() * 0.3,
      groanT: 2 + Math.random() * 6,
      deadT: 0,
      speed: 0,
    };
    this.play(z, 'idle');
    root.position.copy(z.pos);
    this.scene.add(root);
    this.list.push(z);
    return z;
  }

  play(z, name, fade = 0.25) {
    const next = z.actions[name];
    if (z.current === next) return;
    next.reset().play();
    if (z.current) next.crossFadeFrom(z.current, fade, false);
    z.current = next;
  }

  remove(z) {
    this.scene.remove(z.root);
    z.mixer.stopAllAction();
    z.root.traverse((o) => { if (o.isMesh && o.material !== this.blob.material) o.material.dispose(); });
    this.list.splice(this.list.indexOf(z), 1);
  }

  alive() {
    return this.list.filter((z) => z.state !== 'dead');
  }

  /** Zombies within `radius` of a noise run towards it. */
  alert(pos, radius) {
    for (const z of this.list) {
      if (z.state === 'dead') continue;
      if (z.pos.distanceTo(pos) < radius && z.state !== 'attack') {
        z.state = 'chase';
        z.lastSeen = pos.clone();
      }
    }
  }

  /** Nearest living zombie inside a view cone (for aim assist). */
  findTarget(origin, dir, maxDist, coneCos) {
    let best = null;
    let bestScore = Infinity;
    for (const z of this.list) {
      if (z.state === 'dead') continue;
      _v.copy(z.pos).setY(1.3).sub(origin);
      const d = _v.length();
      if (d > maxDist) continue;
      const c = _v.normalize().dot(dir);
      if (c < coneCos) continue;
      const blocked = this.world.raycast(origin, new THREE.Vector3(z.pos.x, 1.3, z.pos.z)) < 0.98;
      if (blocked) continue;
      const score = d * (2 - c);
      if (score < bestScore) { bestScore = score; best = z; }
    }
    return best;
  }

  /** Returns a free direction near `dir` (null if straight ahead is clear). */
  isClear(pos, dir) {
    const eye = new THREE.Vector3(pos.x, 0.6, pos.z);
    return this.world.raycast(eye, eye.clone().addScaledVector(dir, 1.8)) >= 1;
  }

  findOpening(pos, dir, side) {
    const clear = (d) => this.isClear(pos, d);
    for (const deg of [35, 60, 90, 125]) {
      for (const sgn of [side, -side]) {
        const a = THREE.MathUtils.degToRad(deg) * sgn;
        const d = new THREE.Vector3(dir.x * Math.cos(a) + dir.z * Math.sin(a), 0, -dir.x * Math.sin(a) + dir.z * Math.cos(a));
        if (clear(d)) return { dir: d, side: sgn };
      }
    }
    return { dir: dir.clone().negate(), side };
  }

  damage(z, amount, from) {
    if (z.state === 'dead') return false;
    z.health -= amount;
    z.uniforms.uHurt.value = Math.min(1, z.uniforms.uHurt.value + 0.4);
    if (z.health <= 0) {
      z.state = 'dead';
      z.deadT = 0;
      this.play(z, 'death', 0.1);
      this.hooks.onKill?.(z);
      return true;
    }
    z.state = 'hurt';
    z.stateT = 0.35;
    z.lastSeen = from?.clone() ?? z.lastSeen;
    this.play(z, 'hit', 0.08);
    return false;
  }

  spawnAround(player, camDir, count) {
    const spots = this.world.spawns.filter((s) => {
      const d = s.distanceTo(player);
      if (d < 26 || d > 62) return false;
      _v.copy(s).sub(player).normalize();
      return _v.dot(camDir) < 0.35;
    });
    for (let i = 0; i < count && spots.length; i++) {
      const s = spots.splice(Math.floor(Math.random() * spots.length), 1)[0];
      this.create(Math.random() < 0.4, s);
    }
  }

  update(dt, player, ctx) {
    const { camDir, night, playerAlive } = ctx;
    // keep the population up
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 2;
      const want = night ? 14 : 8;
      const living = this.alive().length;
      if (living < want) this.spawnAround(player.pos, camDir, Math.min(2, want - living));
      for (const z of [...this.list]) if (z.state !== 'dead' && z.pos.distanceTo(player.pos) > 75) this.remove(z);
    }

    for (const z of [...this.list]) {
      const toPlayer = _v.copy(player.pos).sub(z.pos);
      const dist = toPlayer.length();
      toPlayer.y = 0;
      z.stateT -= dt;
      z.attackCd -= dt;
      z.uniforms.uHurt.value = Math.max(0, z.uniforms.uHurt.value - dt * 0.3);

      if (z.state === 'dead') {
        z.deadT += dt;
        if (z.deadT > 8) z.root.position.y = -(z.deadT - 8) * 0.25;
        if (z.deadT > 12) this.remove(z);
        z.mixer.update(dt);
        continue;
      }

      // senses: sight (front cone, line of sight) and closeness
      z.senseT -= dt;
      if (z.senseT <= 0 && playerAlive) {
        z.senseT = 0.3;
        const facing = new THREE.Vector3(Math.sin(z.yaw), 0, Math.cos(z.yaw));
        const inFront = toPlayer.clone().normalize().dot(facing) > -0.2;
        const range = (ctx.night ? 11 : 16) * (player.crouch ? 0.6 : 1) + (player.sprinting ? 6 : 0);
        if ((dist < range && inFront) || dist < 4.5) {
          const eye = new THREE.Vector3(z.pos.x, 1.6, z.pos.z);
          const target = new THREE.Vector3(player.pos.x, 1.4, player.pos.z);
          if (this.world.raycast(eye, target) >= 0.98) {
            if (z.state === 'wander') this.hooks.sound?.('notice', dist);
            if (z.state !== 'attack' && z.state !== 'hurt') z.state = 'chase';
            z.lastSeen = player.pos.clone();
          }
        }
      }

      let desired = null;
      let speed = 0;
      switch (z.state) {
        case 'wander': {
          if (!z.target || z.pos.distanceTo(z.target) < 1.5 || z.stateT < -12) {
            z.target = new THREE.Vector3(z.pos.x + (Math.random() - 0.5) * 16, 0, z.pos.z + (Math.random() - 0.5) * 16);
            z.stateT = 0;
          }
          desired = z.target.clone().sub(z.pos);
          speed = 0.55;
          this.play(z, desired.length() > 0.5 ? 'walk' : 'idle');
          break;
        }
        case 'chase': {
          const goal = playerAlive ? player.pos : z.lastSeen;
          desired = goal.clone().sub(z.pos);
          speed = z.runner ? 3.6 : 1.55;
          if (night) speed *= 1.15;
          this.play(z, 'run');
          if (playerAlive && dist < 1.25 && z.attackCd <= 0) {
            z.state = 'attack';
            z.attackHit = false;
            z.stateT = z.actions.attack.getClip().duration / z.actions.attack.timeScale;
            this.play(z, 'attack', 0.1);
            this.hooks.sound?.('attack', dist);
          }
          if (!playerAlive && desired.length() < 1.5) z.state = 'wander';
          break;
        }
        case 'attack': {
          desired = toPlayer.clone();
          speed = 0;
          const total = z.actions.attack.getClip().duration / z.actions.attack.timeScale;
          if (!z.attackHit && z.stateT < total * 0.55) {
            z.attackHit = true;
            if (playerAlive && dist < 1.8) this.hooks.onPlayerHit?.(z.runner ? 9 : 12, z);
          }
          if (z.stateT <= 0) {
            z.state = 'chase';
            z.attackCd = 0.6;
          }
          break;
        }
        case 'hurt':
          speed = 0;
          if (z.stateT <= 0) z.state = 'chase';
          break;
        default:
          break;
      }

      // separation from other zombies
      if (desired) {
        desired.y = 0;
        let steer = desired.lengthSq() > 1e-4 ? desired.normalize() : desired;
        // feel ahead with "whiskers" and go around walls, cars and sandbags
        if (speed > 0) {
          z.avoidT = (z.avoidT ?? 0) - dt;
          z.commitT = (z.commitT ?? 0) - dt;
          if (z.avoidT <= 0) {
            z.avoidT = 0.25;
            if (this.isClear(z.pos, steer)) z.avoid = null;
            else if (!(z.avoid && z.commitT > 0 && this.isClear(z.pos, z.avoid.dir))) {
              // pick a detour and stick to it, so the zombie walks around instead of dithering
              z.avoid = this.findOpening(z.pos, steer, z.avoid?.side ?? (Math.random() < 0.5 ? 1 : -1));
              z.commitT = 1.6;
            }
          }
          if (z.avoid) steer = z.avoid.dir.clone();
        }
        for (const o of this.list) {
          if (o === z || o.state === 'dead') continue;
          const dx = z.pos.x - o.pos.x;
          const dz = z.pos.z - o.pos.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < 1.1 && d2 > 1e-6) { steer.x += (dx / Math.sqrt(d2)) * 0.6; steer.z += (dz / Math.sqrt(d2)) * 0.6; }
        }
        if (steer.lengthSq() > 1e-4) {
          const targetYaw = Math.atan2(steer.x, steer.z);
          let diff = targetYaw - z.yaw;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          z.yaw += diff * Math.min(1, dt * (z.state === 'chase' ? 6 : 3));
        }
        if (speed > 0) {
          z.pos.x += Math.sin(z.yaw) * speed * dt;
          z.pos.z += Math.cos(z.yaw) * speed * dt;
          this.world.collide(z.pos, 0.33);
        }
      }
      z.root.position.copy(z.pos);
      z.root.rotation.y = z.yaw;

      // skip animating far zombies every other frame (phones)
      z.skip = !z.skip;
      const far = dist > 35;
      if (!far || !z.skip) {
        z.mixer.update(far ? dt * 2 : dt);
        if (z.state === 'wander' || z.state === 'chase') {
          const right = _v.set(-Math.cos(z.yaw), 0, Math.sin(z.yaw)).clone();
          const reach = z.state === 'chase' ? 1.25 : 0.95;
          rotateBoneWorld(z.bones.upperarm_l, right, reach);
          rotateBoneWorld(z.bones.upperarm_r, right, reach * 0.9);
          rotateBoneWorld(z.bones.spine_02, right, 0.18);
          rotateBoneWorld(z.bones.Head, new THREE.Vector3(Math.sin(z.yaw), 0, Math.cos(z.yaw)), Math.sin(performance.now() / 700 + z.uniforms.uSeed.value) * 0.25);
        }
      }

      z.groanT -= dt;
      if (z.groanT <= 0) {
        z.groanT = 4 + Math.random() * 7;
        if (dist < 22) this.hooks.sound?.('groan', dist);
      }
    }
  }
}
