/**
 * LobbyEnvironment.js
 * Genera el entorno espacial y arquitectónico del Lobby central en 360°:
 * - Plataforma circular flotante con reborde luminoso y textura antideslizante
 * - Domo cósmico profundo y elegante con niebla volumétrica baja
 * - Anillo de luz ambiental cenital y columnas de partículas ascendentes
 * - Iluminación cinemática suave para relajación visual del usuario
 */
import * as THREE from 'three';

export class LobbyEnvironment {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'LobbyEnvironmentGroup';
    this.scene.add(this.group);

    this.animatedObjects = [];

    this._buildLighting();
    this._buildPlatform();
    this._buildAtmosphere();
    this._buildSurroundingRing();
  }

  _buildLighting() {
    // 1. Luz ambiental diurna/espacial vibrante (evita que cualquier objeto quede negro)
    const ambient = new THREE.AmbientLight(0x384268, 1.4);
    this.group.add(ambient);

    // 2. Luz direccional cenital principal
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.6);
    sunLight.position.set(5, 12, 6);
    this.group.add(sunLight);

    // 3. Luz frontal de relleno para iluminar perfectamente las tarjetas de selección
    const frontFill = new THREE.DirectionalLight(0xa5b4fc, 1.2);
    frontFill.position.set(0, 3, 5);
    this.group.add(frontFill);

    // 4. Luces de acento radiales en 4 cuadrantes (Cian, Magenta, Azul, Ámbar)
    const accents = [
      { color: 0x00f0ff, pos: [0, 2.5, -6], intensity: 1.8 }, // Norte (hacia las tarjetas)
      { color: 0x6366f1, pos: [0, 2.5, 6], intensity: 1.2 },  // Sur (atrás)
      { color: 0xa855f7, pos: [-6, 2.5, 0], intensity: 1.2 }, // Oeste (izquierda)
      { color: 0x38bdf8, pos: [6, 2.5, 0], intensity: 1.2 },  // Este (derecha)
    ];

    accents.forEach((acc) => {
      const pl = new THREE.PointLight(acc.color, acc.intensity, 20);
      pl.position.set(...acc.pos);
      this.group.add(pl);
    });
  }

  _buildPlatform() {
    // 1. Podio circular central donde está parado el usuario (Radio = 4.2m)
    const platformGeo = new THREE.CylinderGeometry(4.2, 4.4, 0.4, 48);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.25,
      metalness: 0.6,
    });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = -0.2;
    platform.receiveShadow = true;
    this.group.add(platform);

    // 2. Rejilla cibernética infinita en el suelo para referencia de horizonte y suelo 360°
    const floorGrid = new THREE.GridHelper(120, 60, 0x00f0ff, 0x1e1b4b);
    floorGrid.position.y = -0.41;
    floorGrid.material.opacity = 0.45;
    floorGrid.material.transparent = true;
    this.group.add(floorGrid);

    // 3. Anillos concéntricos de neón en el borde de la plataforma
    const ringRadii = [4.15, 3.2, 1.8];
    ringRadii.forEach((r, idx) => {
      const ringGeo = new THREE.RingGeometry(r - 0.05, r, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: idx === 0 ? 0x00f0ff : (idx === 1 ? 0x6366f1 : 0xa855f7),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75 - idx * 0.15,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.01;
      this.group.add(ring);
    });

    // 4. Glifo central de spawn (guía visual para los pies)
    const centerGlyphGeo = new THREE.RingGeometry(0.45, 0.55, 32);
    const centerGlyphMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
    });
    const glyph = new THREE.Mesh(centerGlyphGeo, centerGlyphMat);
    glyph.rotation.x = -Math.PI / 2;
    glyph.position.y = 0.015;
    this.group.add(glyph);
  }

  _buildAtmosphere() {
    // 1. Cúpula cósmica 360° con gradiente celestial y horizonte iluminado
    const skyGeo = new THREE.SphereGeometry(95, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        skyColor:     { value: new THREE.Color(0x060618) }, // Zenit
        horizonColor: { value: new THREE.Color(0x1e1b4b) }, // Horizonte resplandeciente
        groundColor:  { value: new THREE.Color(0x080816) }, // Suelo
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 skyColor;
        uniform vec3 horizonColor;
        uniform vec3 groundColor;
        varying vec3 vWorldPosition;
        void main() {
          vec3 point = normalize(vWorldPosition);
          float y = point.y;
          vec3 finalColor;
          if (y > 0.0) {
            finalColor = mix(horizonColor, skyColor, pow(y, 0.45));
          } else {
            finalColor = mix(horizonColor, groundColor, pow(-y, 0.6));
          }
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.group.add(sky);

    // 2. Campo estelar 360° (1,200 estrellas nítidas envolventes)
    const starCount = 1200;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 70.0 + Math.random() * 20.0;
      starPos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = Math.max(-5.0, r * Math.cos(phi));
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.12,
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.85,
    });
    this.starfield = new THREE.Points(starGeo, starMat);
    this.group.add(this.starfield);

    // 3. Partículas ambientales flotantes tipo polvo de energía
    const count = 300;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 18;
      pos[i * 3 + 1] = Math.random() * 6 + 0.2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 18;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.07,
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });
    this.particles = new THREE.Points(geo, mat);
    this.group.add(this.particles);
  }

  _buildSurroundingRing() {
    // 1. Anillo exterior flotante que gira lentamente en el horizonte
    const torGeo = new THREE.TorusGeometry(8.5, 0.05, 12, 64);
    const torMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.45,
    });
    this.horizonRing = new THREE.Mesh(torGeo, torMat);
    this.horizonRing.rotation.x = Math.PI / 2.3;
    this.horizonRing.position.y = 1.0;
    this.group.add(this.horizonRing);

    // 2. Monolitos / Columnas perimetrales en 360° que aportan profundidad espacial y paralaje
    const count = 8;
    const radius = 9.0;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      const height = 3.5 + Math.sin(i * 1.5) * 1.2;

      const colGeo = new THREE.BoxGeometry(0.3, height, 0.3);
      const colMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.3,
        metalness: 0.7,
        emissive: i % 2 === 0 ? 0x00f0ff : 0x6366f1,
        emissiveIntensity: 0.25,
      });
      const col = new THREE.Mesh(colGeo, colMat);
      col.position.set(x, height / 2 - 0.2, z);
      this.group.add(col);
    }
  }

  update(delta) {
    if (this.horizonRing) {
      this.horizonRing.rotation.z += delta * 0.08;
    }
    if (this.starfield) {
      this.starfield.rotation.y += delta * 0.01;
    }
    if (this.particles) {
      const pos = this.particles.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + delta * 0.2;
        if (y > 6.5) y = 0.2;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((child) => {
      if (child.isMesh || child.isPoints) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
          else child.material.dispose();
        }
      }
    });
  }
}
