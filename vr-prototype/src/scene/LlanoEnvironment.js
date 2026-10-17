/**
 * LlanoEnvironment.js
 * Genera el entorno del llano venezolano en 360 grados, al atardecer:
 * - Cielo de atardecer con sol bajo al frente-izquierda (Sky addon) y nubes teñidas
 * - Sabana ondulada con vegetación de pasto seco/verde (vértices coloreados + textura procedural)
 * - Sendero de tierra que serpentea hacia el hato (destino)
 * - Vegetación llanera: samanes (copa en sombrilla), palmas moriche y matas de pasto instanciadas
 * - Cercas de corral, línea de árboles en el horizonte y bruma cálida
 *
 * Convención de ejes (igual que la costa): el avance del jinete es hacia -Z.
 * Todo es procedural (sin descargas de texturas ni modelos) y determinista (RNG con semilla).
 */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Longitud de la ruta desde la salida hasta el portón del hato (metros) */
export const LLANO_ROUTE_LENGTH = 360;

/** Centro del área modelada (el terreno se desvanece a cota 0 hacia los bordes) */
const AREA_CENTER_Z = -200;

/** PRNG determinista (mulberry32) para que el paisaje sea idéntico en cada sesión */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class LlanoEnvironment {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this._rand = mulberry32(20260);

    this._buildAtmosphereAndLighting();
    this._buildTerrain();
    this._buildTrail();
    this._buildGrassTufts();
    this._buildTrees();
    this._buildFences();
    this._buildHorizonTreeline();
    this._buildClouds();
  }

  // ─── Funciones analíticas del terreno y del sendero ─────────────────────────
  /** Cota del terreno en (x, z). Compartida por malla, sendero, vegetación, caballo y cámara. */
  getGroundHeight(x, z) {
    const raw = (px, pz) =>
      0.55 * Math.sin(px * 0.011 + 1.3) * Math.cos(pz * 0.009) +
      0.35 * Math.sin(px * 0.027 - pz * 0.021 + 2.0) +
      0.12 * Math.sin(px * 0.09 + pz * 0.07);
    const r = Math.hypot(x, z - AREA_CENTER_Z);
    const falloff = 1 - THREE.MathUtils.smoothstep(r, 420, 660); // plano en los bordes del mapa
    return (raw(x, z) - raw(0, 0)) * falloff;
  }

  /** Coordenada X del centro del sendero a la profundidad z */
  getTrailCenterX(z) {
    // El tramo inicial es recto (la salida) y luego serpentea suavemente
    const bend = THREE.MathUtils.smoothstep(-z, 10, 70);
    return bend * (Math.sin(z * 0.012) * 14 + Math.sin(z * 0.031) * 4);
  }

  // ─── Atmósfera, Sol e Iluminación ──────────────────────────────────────────
  _buildAtmosphereAndLighting() {
    // Bruma cálida de atardecer (el color se mezcla con el horizonte del cielo)
    this.fogColor = new THREE.Color(0xc99d8a);
    this.scene.fog = new THREE.FogExp2(this.fogColor, 0.0013);
    this.scene.background = this.fogColor.clone();

    this.sky = new Sky();
    this.sky.scale.setScalar(2000);
    this.scene.add(this.sky);

    const u = this.sky.material.uniforms;
    u['turbidity'].value = 10;
    u['rayleigh'].value = 1.7;
    u['mieCoefficient'].value = 0.012;
    u['mieDirectionalG'].value = 0.88;

    // Sol rasante al frente-izquierda del rumbo de salida (-Z)
    this.sunPosition = new THREE.Vector3();
    const elevation = 2.0; // grados sobre el horizonte
    const azimuth = 205;
    this.sunPosition.setFromSphericalCoords(
      1,
      THREE.MathUtils.degToRad(90 - elevation),
      THREE.MathUtils.degToRad(azimuth)
    );
    u['sunPosition'].value.copy(this.sunPosition);

    this.sunLight = new THREE.DirectionalLight(0xffa35c, 2.6);
    this.sunLight.position.copy(this.sunPosition).multiplyScalar(120);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 320;
    const d = 40;
    Object.assign(this.sunLight.shadow.camera, { left: -d, right: d, top: d, bottom: -d });
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.05;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Relleno ambiental: cielo durazno arriba / tierra tibia abajo
    this.scene.add(new THREE.HemisphereLight(0xffd2b0, 0x7a5f3a, 1.3));
  }

  /** Mantiene el volumen de sombras alrededor del jinete */
  follow(position) {
    this.sunLight.target.position.copy(position);
    this.sunLight.position.copy(position).addScaledVector(this.sunPosition, 120);
    this.sunLight.target.updateMatrixWorld();
  }

  // ─── Terreno de sabana ─────────────────────────────────────────────────────
  _buildTerrain() {
    const size = 1400;
    const segs = 175; // celdas de 8 m
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const dry = new THREE.Color(0xcfb56a);
    const green = new THREE.Color(0x88a548);
    const c = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i);
      const wz = pos.getZ(i) + AREA_CENTER_Z;
      pos.setY(i, this.getGroundHeight(wx, wz));

      // Manchas grandes de pasto seco ↔ verde
      const n = 0.5 + 0.5 * Math.sin(wx * 0.02 + wz * 0.013) * Math.cos(wz * 0.017 - wx * 0.008);
      const fine = 0.5 + 0.5 * Math.sin(wx * 0.31) * Math.sin(wz * 0.27);
      c.copy(dry).lerp(green, THREE.MathUtils.clamp(n * 0.85 + fine * 0.15, 0, 1));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const tex = this._createGrassDetailTexture();
    tex.repeat.set(size / 4, size / 4);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0,
    });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.position.set(0, 0, AREA_CENTER_Z);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);

    // Suelo lejano: evita ver el vacío más allá del área modelada
    const farGeo = new THREE.CircleGeometry(5000, 48);
    farGeo.rotateX(-Math.PI / 2);
    this.farGround = new THREE.Mesh(
      farGeo,
      new THREE.MeshStandardMaterial({ color: 0x90863f, roughness: 1 })
    );
    this.farGround.position.set(0, -0.06, AREA_CENTER_Z);
    this.farGround.receiveShadow = true;
    this.scene.add(this.farGround);
  }

  _createGrassDetailTexture() {
    const s = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = s;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e6e6e6';
    ctx.fillRect(0, 0, s, s);
    const rnd = mulberry32(77);
    for (let i = 0; i < 1800; i++) {
      const v = 150 + Math.floor(rnd() * 105);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      const x = rnd() * s;
      const y = rnd() * s;
      ctx.fillRect(x, y, 1 + rnd() * 1.5, 2 + rnd() * 4); // briznas de pasto
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  // ─── Sendero de tierra ─────────────────────────────────────────────────────
  _buildTrail() {
    const zStart = 25;
    const zEnd = -(LLANO_ROUTE_LENGTH + 40);
    const step = 2;
    const halfW = 1.7;
    const count = Math.ceil((zStart - zEnd) / step);

    const verts = [];
    const uvs = [];
    const idx = [];
    for (let i = 0; i <= count; i++) {
      const z = zStart - i * step;
      const cx = this.getTrailCenterX(z);
      for (const side of [-1, 1]) {
        const x = cx + side * halfW;
        verts.push(x, this.getGroundHeight(x, z) + 0.06, z);
        uvs.push(side < 0 ? 0 : 1, i * 0.25);
      }
      if (i < count) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: 0x8a6a45,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.trail = new THREE.Mesh(geo, mat);
    this.trail.receiveShadow = true;
    this.scene.add(this.trail);
  }

  // ─── Matas de pasto instanciadas (una sola draw call) ──────────────────────
  _buildGrassTufts() {
    const COUNT = 9000;
    // Cada mata = 5 hojas abiertas (3 triángulos c/u) fusionadas en una geometría
    const blades = [];
    for (let i = 0; i < 5; i++) {
      const blade = new THREE.ConeGeometry(0.035, 0.6, 3, 1, true);
      blade.translate(0, 0.3, 0);
      blade.rotateZ((i % 2 ? 1 : -1) * (0.12 + (i * 0.05)));
      blade.rotateY((i / 5) * Math.PI * 2);
      blade.translate(Math.cos(i * 1.9) * 0.05, 0, Math.sin(i * 1.9) * 0.05);
      blades.push(blade);
    }
    const geo = mergeGeometries(blades);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, COUNT);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    const dry = new THREE.Color(0xd4b865);
    const green = new THREE.Color(0x8fae4a);
    let placed = 0;
    while (placed < COUNT) {
      const z = 20 - this._rand() * (LLANO_ROUTE_LENGTH + 90);
      // 70% de las matas cerca del sendero (donde se mira), el resto más lejos
      const spread = this._rand() < 0.7 ? 32 : 130;
      const cx = this.getTrailCenterX(z);
      const x = cx + (this._rand() - 0.5) * spread;
      if (Math.abs(x - cx) < 2.2) continue; // dejar libre el sendero
      const s = 0.8 + this._rand() * 1.0;
      e.set((this._rand() - 0.5) * 0.2, this._rand() * Math.PI * 2, (this._rand() - 0.5) * 0.2);
      q.setFromEuler(e);
      m.compose(
        new THREE.Vector3(x, this.getGroundHeight(x, z), z),
        q,
        new THREE.Vector3(s, s * (0.8 + this._rand() * 0.9), s)
      );
      mesh.setMatrixAt(placed, m);
      col.copy(dry).lerp(green, this._rand());
      mesh.setColorAt(placed, col);
      placed++;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = true;
    this.grass = mesh;
    this.scene.add(mesh);
  }

  // ─── Samanes y palmas moriche ──────────────────────────────────────────────
  _buildTrees() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.95 });
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x56853a, roughness: 0.85, flatShading: true });
    const palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x8a7552, roughness: 0.9 });
    const frondMat = new THREE.MeshStandardMaterial({
      color: 0x4d7a35,
      roughness: 0.75,
      side: THREE.DoubleSide,
    });

    // Samanes: algunos junto al sendero y otros dispersos en todas las direcciones (360°)
    const samanCount = 26;
    for (let i = 0; i < samanCount; i++) {
      const z = 30 - this._rand() * (LLANO_ROUTE_LENGTH + 120);
      const side = this._rand() < 0.5 ? -1 : 1;
      const off = 14 + this._rand() * 90;
      const x = this.getTrailCenterX(z) + side * off;
      this._buildSaman(x, z, 0.8 + this._rand() * 0.7, trunkMat, crownMat);
    }
    // Un samán emblemático cerca de la salida, visible desde el spawn
    this._buildSaman(-16, -22, 1.5, trunkMat, crownMat);
    // Árboles también detrás del punto de salida para completar el 360°
    for (let i = 0; i < 8; i++) {
      const a = this._rand() * Math.PI * 2;
      const r = 30 + this._rand() * 70;
      this._buildSaman(Math.cos(a) * r, 15 + Math.abs(Math.sin(a)) * r, 0.8 + this._rand() * 0.6, trunkMat, crownMat);
    }

    // Palmas moriche en grupos
    const clusters = 9;
    for (let i = 0; i < clusters; i++) {
      const cz = -20 - this._rand() * (LLANO_ROUTE_LENGTH - 20);
      const cx = this.getTrailCenterX(cz) + (this._rand() < 0.5 ? -1 : 1) * (22 + this._rand() * 55);
      const n = 3 + Math.floor(this._rand() * 3);
      for (let k = 0; k < n; k++) {
        this._buildMorichePalm(
          cx + (this._rand() - 0.5) * 12,
          cz + (this._rand() - 0.5) * 12,
          palmTrunkMat,
          frondMat
        );
      }
    }
  }

  _buildSaman(x, z, scale, trunkMat, crownMat) {
    const g = new THREE.Group();
    g.position.set(x, this.getGroundHeight(x, z), z);
    g.scale.setScalar(scale);

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.8, 5.5, 8), trunkMat);
    trunk.position.y = 2.75;
    trunk.castShadow = true;
    g.add(trunk);

    // Copa en sombrilla ancha, característica del samán
    for (let i = 0; i < 4; i++) {
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(3.4 + this._rand() * 1.4, 1), crownMat);
      crown.scale.set(1.5, 0.55, 1.5);
      crown.position.set((this._rand() - 0.5) * 4.5, 6.2 + this._rand() * 1.0, (this._rand() - 0.5) * 4.5);
      crown.rotation.y = this._rand() * Math.PI;
      crown.castShadow = true;
      crown.receiveShadow = true;
      g.add(crown);
    }
    this.scene.add(g);
  }

  _buildMorichePalm(x, z, trunkMat, frondMat) {
    const g = new THREE.Group();
    g.position.set(x, this.getGroundHeight(x, z), z);
    const height = 7 + this._rand() * 4;

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, height, 7), trunkMat);
    trunk.position.y = height / 2;
    trunk.castShadow = true;
    g.add(trunk);

    const fronds = 9;
    const frondGeo = new THREE.ConeGeometry(0.55, 3.8, 4);
    frondGeo.translate(0, 1.9, 0); // pivote en la base de la hoja
    for (let i = 0; i < fronds; i++) {
      const f = new THREE.Mesh(frondGeo, frondMat);
      f.position.y = height;
      f.rotation.y = (i / fronds) * Math.PI * 2;
      f.rotation.z = 1.15 + this._rand() * 0.35; // caída hacia afuera
      f.scale.set(1, 1, 0.18);
      f.castShadow = true;
      g.add(f);
    }
    this.scene.add(g);
  }

  // ─── Cercas de corral a lo largo del sendero ───────────────────────────────
  _buildFences() {
    const postGeo = new THREE.CylinderGeometry(0.07, 0.09, 1.5, 6);
    postGeo.translate(0, 0.75, 0);
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4c30, roughness: 0.95 });
    const spacing = 5;
    const zFrom = -30;
    const zTo = -(LLANO_ROUTE_LENGTH - 30);
    const n = Math.floor((zFrom - zTo) / spacing);
    const posts = new THREE.InstancedMesh(postGeo, woodMat, n * 2);
    const m = new THREE.Matrix4();

    const railGeo = new THREE.BoxGeometry(0.05, 0.07, spacing);
    railGeo.translate(0, 0, -spacing / 2);
    const rails = new THREE.InstancedMesh(railGeo, woodMat, n * 4);

    let pi = 0;
    let ri = 0;
    const q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const z = zFrom - i * spacing;
      for (const side of [-1, 1]) {
        const x = this.getTrailCenterX(z) + side * 7;
        const y = this.getGroundHeight(x, z);
        m.makeTranslation(x, y, z);
        posts.setMatrixAt(pi++, m);

        // Dos travesaños hacia el siguiente poste
        const nx = this.getTrailCenterX(z - spacing) + side * 7;
        const ny = this.getGroundHeight(nx, z - spacing);
        const dir = new THREE.Vector3(nx - x, ny - y, -spacing).normalize();
        q.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
        for (const h of [0.55, 1.1]) {
          m.compose(new THREE.Vector3(x, y + h, z), q, new THREE.Vector3(1, 1, 1));
          rails.setMatrixAt(ri++, m);
        }
      }
    }
    posts.count = pi;
    rails.count = ri;
    posts.instanceMatrix.needsUpdate = true;
    rails.instanceMatrix.needsUpdate = true;
    posts.castShadow = rails.castShadow = true;
    this.scene.add(posts, rails);
  }

  // ─── Línea de árboles lejana: garantiza horizonte en todo el 360° ──────────
  _buildHorizonTreeline() {
    const COUNT = 220;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0x4b5a3d, fog: true });
    const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
    const m = new THREE.Matrix4();
    for (let i = 0; i < COUNT; i++) {
      const a = (i / COUNT) * Math.PI * 2 + (this._rand() - 0.5) * 0.04;
      const r = 620 + this._rand() * 120;
      const w = 14 + this._rand() * 26;
      const h = 6 + this._rand() * 12;
      m.compose(
        new THREE.Vector3(Math.cos(a) * r, h * 0.35, AREA_CENTER_Z + Math.sin(a) * r),
        new THREE.Quaternion(),
        new THREE.Vector3(w, h, w)
      );
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
  }

  // ─── Nubes de atardecer (sprites teñidos por el sol) ───────────────────────
  _buildClouds() {
    const s = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = s;
    const ctx = canvas.getContext('2d');
    const rnd = mulberry32(5);
    for (let i = 0; i < 14; i++) {
      const x = s * (0.25 + rnd() * 0.5);
      const y = s * (0.35 + rnd() * 0.3);
      const r = s * (0.14 + rnd() * 0.16);
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.55)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    this.clouds = new THREE.Group();
    this.clouds.position.z = AREA_CENTER_Z;
    const COUNT = 22;
    for (let i = 0; i < COUNT; i++) {
      const a = (i / COUNT) * Math.PI * 2 + this._rand() * 0.2;
      const r = 700 + this._rand() * 500;
      const alt = 130 + this._rand() * 260;
      // Más cerca del sol → más naranja
      const sunAlign = Math.max(0, Math.cos(a - THREE.MathUtils.degToRad(90 - 205)));
      const color = new THREE.Color(0xb7a2ae).lerp(new THREE.Color(0xff7a38), sunAlign * 0.9);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        fog: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.position.set(Math.cos(a) * r, alt, Math.sin(a) * r);
      sp.scale.set(420 + this._rand() * 260, 150 + this._rand() * 80, 1);
      this.clouds.add(sp);
    }
    this.scene.add(this.clouds);
  }

  // ─── Actualización por frame ───────────────────────────────────────────────
  update(delta) {
    this.time += delta;
    // Deriva lenta de las nubes alrededor del jinete
    if (this.clouds) this.clouds.rotation.y += delta * 0.0025;
  }
}
