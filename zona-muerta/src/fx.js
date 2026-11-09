// Visual effects with small object pools: muzzle flash, tracers, blood, dust.
import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    const flashTex = radialTexture('#fff6c8', '#ff9a20');
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flash.scale.setScalar(0.45);
    this.flash.visible = false;
    this.flashLight = new THREE.PointLight('#ffb35a', 0, 9, 2);
    scene.add(this.flash, this.flashLight);
    this.flashT = 0;

    this.tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
    this.tracers = [];
    this.bloodMat = new THREE.MeshBasicMaterial({ color: '#6a0a0a' });
    this.dustMat = new THREE.MeshBasicMaterial({ color: '#9a8f80' });
    this.dropGeo = new THREE.SphereGeometry(0.03, 5, 4);
    this.pool = [];
  }

  muzzle(pos) {
    this.flash.position.copy(pos);
    this.flash.material.rotation = Math.random() * Math.PI;
    this.flash.visible = true;
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 6;
    this.flashT = 0.06;
  }

  tracer(from, to) {
    const line = new THREE.Line(this.tracerGeo, new THREE.LineBasicMaterial({ color: '#ffe0a0', transparent: true, opacity: 0.8 }));
    line.position.copy(from);
    line.scale.set(1, 1, from.distanceTo(to));
    line.lookAt(to);
    this.scene.add(line);
    this.tracers.push({ line, t: 0.06 });
  }

  burst(pos, kind, count = 14) {
    for (let i = 0; i < count; i++) {
      const mesh = this.pool.pop() ?? new THREE.Mesh(this.dropGeo);
      mesh.material = kind === 'blood' ? this.bloodMat : this.dustMat;
      mesh.position.copy(pos);
      mesh.scale.setScalar(kind === 'blood' ? 0.6 + Math.random() : 0.5 + Math.random() * 0.6);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        v: new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3),
        life: 0.5 + Math.random() * 0.4,
      });
    }
  }

  update(dt) {
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; }
    }
    for (const t of this.tracers) {
      t.t -= dt;
      if (t.t <= 0) { this.scene.remove(t.line); t.line.material.dispose(); }
    }
    this.tracers = this.tracers.filter((t) => t.t > 0);
    for (const p of this.particles) {
      p.life -= dt;
      p.v.y -= 9.8 * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      if (p.mesh.position.y < 0.02) { p.mesh.position.y = 0.02; p.v.set(0, 0, 0); }
      if (p.life <= 0) { this.scene.remove(p.mesh); this.pool.push(p.mesh); }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }
}

function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
