/**
 * DownhillTrack.js
 * Genera la pista de descenso de forma procedural y determinista:
 * - Curva 3D descendente (CatmullRom) con pendiente media ~20 %
 * - Malla de carretera y franja de ladera
 * - Marcadores de borde, árboles instanciados (InstancedMesh por rendimiento)
 * - Puertas de salida, checkpoints y meta
 * - Obstáculos sobre la pista (rocas y troncos)
 * - Monedas en cadenas que zigzaguean por la pista
 * - Escenario: montañas en el horizonte y arbustos de colores a los lados
 *
 * Convención de coordenadas: la pista avanza hacia -Z. El punto `s` es la
 * distancia de arco desde la salida; `lateral` es el desplazamiento a la derecha.
 */
import * as THREE from 'three';
import { DOWNHILL_CONFIG as C } from './downhillConfig.js';
import { createRng, clamp01 } from './downhillPhysics.js';

const UP = new THREE.Vector3(0, 1, 0);

export class DownhillTrack {
  /**
   * @param {THREE.Scene} scene - escena propia del modo
   * @param {object} cfg        - DOWNHILL_CONFIG (inyectable para pruebas)
   */
  constructor(scene, cfg = C) {
    this.cfg = cfg;
    this.rng = createRng(cfg.seed);
    this.curve = this._buildCurve();
    this.length = this.curve.getLength();

    this.group = new THREE.Group();
    scene.add(this.group);

    this._buildSurfaces();
    this._buildEdgeMarkers();
    this._buildTrees();
    this.gates = this._buildGates();
    this.obstacles = this._buildObstacles();
    this.coins = this._buildCoins();
    this._buildScenery();
  }

  /** Anima las monedas (giro). Llamar una vez por frame. */
  update(dt) {
    for (const c of this.coins) {
      if (!c.taken) c.group.rotation.y += dt * 3;
    }
  }

  // ─── Consultas geométricas (usadas por el modo y la bicicleta) ────────────

  /** Punto del eje de la pista a la distancia s. */
  pointAt(s) {
    return this.curve.getPointAt(clamp01(s / this.length));
  }

  /** Tangente 3D unitaria (dirección de avance) en s. */
  tangentAt(s) {
    return this.curve.getTangentAt(clamp01(s / this.length));
  }

  /** Vector horizontal "derecha" en s. */
  rightAt(s) {
    const t = this.tangentAt(s);
    return new THREE.Vector3(t.x, 0, t.z).normalize().cross(UP).normalize();
  }

  /** Yaw (rotación Y) que orienta un objeto hacia el avance en s. */
  headingAt(s) {
    const t = this.tangentAt(s);
    return Math.atan2(-t.x, -t.z);
  }

  /** Punto sobre la carretera en s desplazado `lateral` metros a la derecha. */
  roadPoint(s, lateral = 0) {
    return this.pointAt(s).addScaledVector(this.rightAt(s), lateral);
  }

  // ─── Construcción ──────────────────────────────────────────────────────────

  _buildCurve() {
    const { controlPoints: n, segmentRun, segmentDrop } = this.cfg;
    const points = [];
    for (let i = 0; i < n; i++) {
      const x = Math.sin(i * 0.9) * 35 + Math.sin(i * 2.3) * 8;
      const y = (n - 1 - i) * segmentDrop + 4 + Math.sin(i * 1.7) * 2;
      const z = -i * segmentRun;
      points.push(new THREE.Vector3(x, y, z));
    }
    return new THREE.CatmullRomCurve3(points, false, 'centripetal');
  }

  _buildSurfaces() {
    const grass = new THREE.MeshStandardMaterial({ color: 0x3f6b35, roughness: 1 });
    const dirt = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.95 });

    const shoulder = this._ribbon(this.cfg.shoulderHalfWidth, grass, -0.05);
    const road = this._ribbon(this.cfg.roadHalfWidth, dirt, 0.02);
    shoulder.receiveShadow = true;
    road.receiveShadow = true;
    this.group.add(shoulder, road);
  }

  /** Malla en forma de cinta a lo largo de la curva. */
  _ribbon(halfWidth, material, yOffset) {
    const samples = Math.ceil(this.length / this.cfg.sampleStep);
    const positions = [];
    const indices = [];

    for (let i = 0; i <= samples; i++) {
      const s = (i / samples) * this.length;
      const p = this.pointAt(s).add(new THREE.Vector3(0, yOffset, 0));
      const r = this.rightAt(s);
      const left = p.clone().addScaledVector(r, -halfWidth);
      const right = p.clone().addScaledVector(r, halfWidth);
      positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    }

    for (let i = 0; i < samples; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, material);
  }

  _buildEdgeMarkers() {
    const spacing = 20;
    const count = Math.floor(this.length / spacing) * 2;
    const geo = new THREE.BoxGeometry(0.12, 0.6, 0.12);
    const mat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0x334155 });
    const marks = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();

    let k = 0;
    for (let s = spacing; s < this.length && k < count; s += spacing) {
      for (const side of [-1, 1]) {
        const p = this.roadPoint(s, side * (this.cfg.roadHalfWidth + 0.4));
        m.makeTranslation(p.x, p.y + 0.3, p.z);
        marks.setMatrixAt(k++, m);
      }
    }
    marks.count = k;
    marks.instanceMatrix.needsUpdate = true;
    this.group.add(marks);
  }

  _buildTrees() {
    const count = 180;
    const geo = new THREE.ConeGeometry(1.4, 4.5, 7);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1f4d2b, roughness: 0.9 });
    const trees = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const pos = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      const s = this.rng() * this.length * 0.98;
      const side = this.rng() < 0.5 ? -1 : 1;
      const lateral = side * (this.cfg.roadHalfWidth + 6 + this.rng() * 40);
      const base = this.roadPoint(s, lateral);
      const k = 0.8 + this.rng() * 0.7;
      pos.set(base.x, base.y + 2.25 * k, base.z);
      scale.set(k, k, k);
      m.compose(pos, quat, scale);
      trees.setMatrixAt(i, m);
    }
    trees.instanceMatrix.needsUpdate = true;
    this.group.add(trees);
  }

  /**
   * Puertas de salida, checkpoints y meta. Cada una se orienta con la pista.
   * Devuelve [{ s, index, passed, bar }] (index -1 para salida y meta).
   */
  _buildGates() {
    const hw = this.cfg.roadHalfWidth + 0.6;
    const gates = [];

    const make = (s, color, index) => {
      const g = new THREE.Group();
      g.position.copy(this.pointAt(s));
      g.rotation.y = this.headingAt(s);

      const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const barMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 });
      const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 4, 8);

      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(side * hw, 2, 0);
        post.castShadow = true;
        g.add(post);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.5, 0.3), barMat);
      bar.position.set(0, 4, 0);
      g.add(bar);

      this.group.add(g);
      gates.push({ s, index, passed: false, bar: barMat, baseColor: color });
    };

    make(0, 0xef4444, -1);
    this.cfg.checkpointFractions.forEach((f, i) => make(this.length * f, 0xfacc15, i));
    make(this.length, 0xffffff, -1);
    return gates;
  }

  /** Obstáculos sobre la carretera. Cada uno guarda su posición de colisión. */
  _buildObstacles() {
    const obstacles = [];
    const rockGeo = new THREE.IcosahedronGeometry(0.7, 0);
    const logGeo = new THREE.CylinderGeometry(0.35, 0.35, 2.2, 8);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.9 });
    const logMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.8 });

    const startSafe = this.cfg.sprintLength + 30;
    const endSafe = this.length - 40;

    for (let s = startSafe; s < endSafe; s += this.cfg.obstacleSpacing) {
      if (this.rng() >= this.cfg.obstacleChance) continue;

      const lateral = (this.rng() * 2 - 1) * this.cfg.maxLateral;
      const isRock = this.rng() < 0.5;
      const group = new THREE.Group();
      const p = this.roadPoint(s, lateral);
      group.position.set(p.x, p.y + 0.4, p.z);
      group.rotation.y = this.headingAt(s);

      const mesh = isRock
        ? new THREE.Mesh(rockGeo, rockMat)
        : new THREE.Mesh(logGeo, logMat);
      if (!isRock) mesh.rotation.z = Math.PI / 2; // tronco atravesado en la pista
      mesh.castShadow = true;
      group.add(mesh);

      this.group.add(group);
      obstacles.push({ s, lateral, group, hit: false });
    }
    return obstacles;
  }

  /**
   * Cadenas de monedas. Cada cadena zigzaguea a izquierda y derecha, así que
   * para recogerlas todas hay que trazar la línea, no ir recto.
   * Las monedas no se colocan sobre obstáculos.
   */
  _buildCoins() {
    const { coinTrails, coinsPerTrail, coinSpacing, coinAmplitude } = this.cfg;
    const geo = new THREE.CylinderGeometry(0.28, 0.28, 0.06, 18);
    geo.rotateX(Math.PI / 2); // el disco mira hacia el avance
    const mat = new THREE.MeshStandardMaterial({
      color: 0xfacc15, emissive: 0xb45309, emissiveIntensity: 0.5, metalness: 0.9, roughness: 0.2,
    });

    const span = (coinsPerTrail - 1) * coinSpacing;
    const minS = this.cfg.sprintLength + 40;
    const maxS = this.length - 60 - span;
    const coins = [];

    for (let t = 0; t < coinTrails && maxS > minS; t++) {
      const s0 = minS + this.rng() * (maxS - minS);
      const phase = this.rng() * Math.PI * 2;

      for (let k = 0; k < coinsPerTrail; k++) {
        const s = s0 + k * coinSpacing;
        const lateral = Math.sin(phase + k * 0.9) * coinAmplitude;
        const blocked = this.obstacles.some(
          (o) => Math.abs(o.s - s) < 2.5 && Math.abs(o.lateral - lateral) < 1.8,
        );
        if (blocked) continue;

        const group = new THREE.Group();
        const p = this.roadPoint(s, lateral);
        group.position.set(p.x, p.y + 1.0, p.z);
        group.add(new THREE.Mesh(geo, mat));
        this.group.add(group);
        coins.push({ s, lateral, group, taken: false, missed: false });
      }
    }
    return coins;
  }

  /** Montañas lejanas y arbustos de colores. Solo decoran; no tienen colisión. */
  _buildScenery() {
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const color = new THREE.Color();

    // Montañas: conos grandes y lejanos (sin malla de nieve, para mantener el coste bajo)
    const mountainCount = 60;
    const mountains = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 1, 6, 1),
      new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
      mountainCount,
    );
    const palette = [0x4b6b57, 0x5f7f6a, 0x6e7f8c, 0x7b8794];
    for (let i = 0; i < mountainCount; i++) {
      const s = this.rng() * this.length;
      const lateral = (this.rng() < 0.5 ? -1 : 1) * (150 + this.rng() * 120);
      const r = 40 + this.rng() * 50;
      const h = 120 + this.rng() * 100;
      const base = this.roadPoint(s, lateral);
      pos.set(base.x, base.y - 10 + h / 2, base.z);
      scale.set(r, h, r);
      m.compose(pos, quat, scale);
      mountains.setMatrixAt(i, m);
      mountains.setColorAt(i, color.setHex(palette[Math.floor(this.rng() * palette.length)]));
    }
    mountains.instanceMatrix.needsUpdate = true;
    this.group.add(mountains);

    // Arbustos de colores a ambos lados de la pista
    const bushCount = 500;
    const bushes = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.5, 0),
      new THREE.MeshStandardMaterial({ roughness: 0.9 }),
      bushCount,
    );
    const bushColors = [0x22c55e, 0xeab308, 0xf472b6, 0xa3e635, 0x38bdf8];
    for (let i = 0; i < bushCount; i++) {
      const s = this.rng() * this.length * 0.98;
      const lateral = (this.rng() < 0.5 ? -1 : 1) * (this.cfg.roadHalfWidth + 1 + this.rng() * 6);
      const base = this.roadPoint(s, lateral);
      const k = 0.7 + this.rng() * 0.8;
      pos.set(base.x, base.y + 0.2 * k, base.z);
      scale.set(k, k * 0.6, k);
      m.compose(pos, quat, scale);
      bushes.setMatrixAt(i, m);
      bushes.setColorAt(i, color.setHex(bushColors[Math.floor(this.rng() * bushColors.length)]));
    }
    bushes.instanceMatrix.needsUpdate = true;
    this.group.add(bushes);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    this.group.removeFromParent();
  }
}
