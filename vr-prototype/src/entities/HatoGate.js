/**
 * HatoGate.js
 * Portón del hato: la meta del nivel llanero (equivale a la boya del nivel costero).
 * - Dos postes de madera con travesaño y letrero
 * - Faroles cálidos que parpadean como una luz lejana que guía al jinete
 * - Al llegar: nube de cocuyos (luciérnagas) que asciende
 */
import * as THREE from 'three';

export class HatoGate {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../scene/LlanoEnvironment.js').LlanoEnvironment} environment
   * @param {THREE.Vector3} position - Posición del centro del portón en el suelo
   */
  constructor(scene, environment, position) {
    this.scene = scene;
    this.environment = environment;
    this.position = position.clone();
    this.position.y = environment.getGroundHeight(position.x, position.z);
    this.reached = false;
    this.radius = 7;
    this.time = 0;

    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    // El portón se orienta perpendicular al sendero en ese punto
    const dx = environment.getTrailCenterX(position.z - 1) - environment.getTrailCenterX(position.z + 1);
    this.group.rotation.y = Math.atan2(-dx, 2);
    this.scene.add(this.group);

    this._build();
    this._buildFireflies();
  }

  _build() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.95 });
    const postGeo = new THREE.CylinderGeometry(0.16, 0.2, 3.6, 8);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, wood);
      post.position.set(sx * 2.6, 1.8, 0);
      post.castShadow = true;
      this.group.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.28, 0.28), wood);
    beam.position.set(0, 3.55, 0);
    beam.castShadow = true;
    this.group.add(beam);

    // Letrero
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#6b4526';
    ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = '#d9a066';
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, 1004, 236);
    ctx.fillStyle = '#ffe2b8';
    ctx.textAlign = 'center';
    ctx.font = 'bold 96px Georgia, serif';
    ctx.fillText('EL HATO', 512, 135);
    ctx.font = 'italic 44px Georgia, serif';
    ctx.fillText('¡Bienvenido, llanero!', 512, 205);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 0.85),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide })
    );
    sign.position.set(0, 2.9, 0.02);
    this.group.add(sign);

    // Faroles
    this.lanterns = [];
    for (const sx of [-1, 1]) {
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffc46b, fog: false })
      );
      bulb.position.set(sx * 2.6, 3.9, 0);
      const light = new THREE.PointLight(0xffa24a, 6, 22, 1.8);
      bulb.add(light);
      this.group.add(bulb);
      this.lanterns.push(light);
    }
  }

  _buildFireflies() {
    const N = 90;
    this._ffBase = new Float32Array(N * 3);
    this._ffPhase = new Float32Array(N);
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      this._ffBase[i * 3] = (Math.random() - 0.5) * 9;
      this._ffBase[i * 3 + 1] = 0.3 + Math.random() * 2.2;
      this._ffBase[i * 3 + 2] = (Math.random() - 0.5) * 9;
      this._ffPhase[i] = Math.random() * Math.PI * 2;
    }
    // Sprite circular suave (si no, los puntos se ven como cuadrados)
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const cx = c.getContext('2d');
    const grad = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = grad;
    cx.fillRect(0, 0, 64, 64);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.fireflies = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xe8ff7a,
        size: 0.28,
        map: new THREE.CanvasTexture(c),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      })
    );
    this.fireflies.visible = false;
    this.group.add(this.fireflies);
  }

  /**
   * @param {number} delta
   * @param {THREE.Vector3} riderPosition
   * @returns {boolean} true solo en el frame en que se alcanza la meta
   */
  update(delta, riderPosition) {
    this.time += delta;
    this.lanterns.forEach((l, i) => {
      l.intensity = 5 + Math.sin(this.time * 3 + i * 1.7) * 1.2;
    });

    let justReached = false;
    if (!this.reached && riderPosition.distanceTo(this.position) < this.radius) {
      this.reached = true;
      justReached = true;
      this.fireflies.visible = true;
      this._celebrateTime = 0;
    }

    if (this.reached) {
      this._celebrateTime += delta;
      const fade = Math.min(1, this._celebrateTime / 2);
      this.fireflies.material.opacity = 0.9 * fade;
      const p = this.fireflies.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = this._celebrateTime * 0.5 + this._ffPhase[i];
        p.setXYZ(
          i,
          this._ffBase[i * 3] + Math.sin(t * 1.3) * 0.7,
          this._ffBase[i * 3 + 1] + Math.sin(t) * 0.5 + this._celebrateTime * 0.05,
          this._ffBase[i * 3 + 2] + Math.cos(t * 1.1) * 0.7
        );
      }
      p.needsUpdate = true;
    }
    return justReached;
  }
}
