/**
 * Environment.js
 * Genera un entorno 3D completamente inmersivo y envolvente en 360 grados:
 * - Cúpula cósmica 360° con estrellas y nebulosa
 * - Plataforma central con anillos de energía y cuadrícula infinita
 * - Anillo perimetral de monolitos cibernéticos en 360° con balizas de luz
 * - Partículas flotantes que rodean al usuario en todas las dimensiones
 */
import * as THREE from 'three';

export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.animatedObjects = [];
    this._buildLighting();
    this._buildFloor();
    this._buildSkySphere();
    this._buildPerimeterMonoliths();
    this._buildFloatingOrbs();
    this._buildStarfield();
  }

  // ── Iluminación 360° envolvente ───────────────────────────────────────────
  _buildLighting() {
    // Luz ambiental cósmica diurna reforzada
    const ambientLight = new THREE.AmbientLight(0x352b75, 1.4);
    this.scene.add(ambientLight);

    // Sol cenital cósmico
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.6);
    sunLight.position.set(10, 20, 10);
    this.scene.add(sunLight);

    // Luces puntuales de 4 cuadrantes (Norte, Sur, Este, Oeste)
    const cardinalColors = [0x00f0ff, 0xff007f, 0x6c63ff, 0x00ff88];
    const cardinalPositions = [
      [0, 3, -12],   // Norte (Frente al portal)
      [0, 3, 12],    // Sur (Atrás del spawn)
      [12, 3, 0],    // Este (Derecha)
      [-12, 3, 0],   // Oeste (Izquierda)
    ];

    cardinalPositions.forEach((pos, idx) => {
      const light = new THREE.PointLight(cardinalColors[idx], 1.4, 28);
      light.position.set(...pos);
      this.scene.add(light);
    });
  }

  // ── Plataforma y Suelo 360° ───────────────────────────────────────────────
  _buildFloor() {
    // Suelo infinito
    const floorGeo = new THREE.PlaneGeometry(120, 120, 40, 40);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0d0d24,
      roughness: 0.35,
      metalness: 0.6,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // Rejilla cibernética primaria
    const grid = new THREE.GridHelper(120, 60, 0x00f0ff, 0x2e1e68);
    grid.position.y = 0.01;
    grid.material.opacity = 0.55;
    grid.material.transparent = true;
    this.scene.add(grid);

    // Anillos concéntricos de energía en el suelo bajo los pies del usuario
    const ringRadii = [2, 4, 6, 9, 14];
    ringRadii.forEach((r, idx) => {
      const ringGeo = new THREE.RingGeometry(r - 0.04, r, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: idx % 2 === 0 ? 0x00f0ff : 0x6c63ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75 - idx * 0.1,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      this.scene.add(ring);
    });
  }

  // ── Cúpula celeste 360° (Domo celestial con horizonte luminoso) ───────────
  _buildSkySphere() {
    const skyGeo = new THREE.SphereGeometry(90, 48, 48);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        skyColor:     { value: new THREE.Color(0x0a0624) },
        horizonColor: { value: new THREE.Color(0x2d1254) },
        groundColor:  { value: new THREE.Color(0x0e0926) },
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
            finalColor = mix(horizonColor, skyColor, pow(y, 0.4));
          } else {
            finalColor = mix(horizonColor, groundColor, pow(-y, 0.6));
          }
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);
  }

  // ── Círculo de monolitos alrededor en 360° ─────────────────────────────────
  _buildPerimeterMonoliths() {
    const count = 12; // 12 monolitos en círculo a 360°
    const radius = 10; // 10 metros del centro

    for (let i = 0; i < count; i++) {
      // Offset de medio paso para dejar libre el corredor central Z (despejando la vista frontal)
      const angle = ((i + 0.5) / count) * Math.PI * 2;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      const height = 4.5 + Math.sin(i * 1.5) * 1.5;

      // Columna
      const geo = new THREE.BoxGeometry(0.35, height, 0.35);
      const isCyan = i % 2 === 0;
      const mat = new THREE.MeshStandardMaterial({
        color: 0x141432,
        roughness: 0.25,
        metalness: 0.8,
        emissive: isCyan ? 0x00f0ff : 0xff007f,
        emissiveIntensity: 0.35,
      });
      const monolith = new THREE.Mesh(geo, mat);
      monolith.position.set(x, height / 2, z);
      monolith.rotation.y = angle;
      this.scene.add(monolith);

      // Baliza de luz en la cima de cada monolito (auto-iluminada sin point light redundante)
      const beaconGeo = new THREE.SphereGeometry(0.12, 16, 16);
      const beaconMat = new THREE.MeshBasicMaterial({
        color: isCyan ? 0x00f0ff : 0xff007f,
      });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(x, height + 0.1, z);
      this.scene.add(beacon);
    }
  }

  // ── Orbes flotantes cinéticos alrededor del usuario ───────────────────────
  _buildFloatingOrbs() {
    this.orbs = [];
    const orbCount = 8;
    const orbRadius = 5.5;

    for (let i = 0; i < orbCount; i++) {
      const angle = (i / orbCount) * Math.PI * 2;
      const geo = new THREE.DodecahedronGeometry(0.18, 0);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00a8ff,
        emissiveIntensity: 0.8,
        roughness: 0.1,
        metalness: 0.9,
      });
      const orb = new THREE.Mesh(geo, mat);
      orb.userData = {
        baseAngle: angle,
        speed: 0.25 + (i % 3) * 0.1,
        heightOffset: 1.2 + (i % 4) * 0.4,
        radius: orbRadius + (i % 2) * 1.2,
      };
      this.scene.add(orb);
      this.orbs.push(orb);
    }
  }

  // ── Campo de 600 estrellas en 360° ────────────────────────────────────────
  _buildStarfield() {
    const count = 600;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Distribución esférica 360°
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const dist = 35 + Math.random() * 45;

      positions[i * 3]     = dist * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.max(0.5, dist * Math.cos(phi)); // sobre el suelo
      positions[i * 3 + 2] = dist * Math.sin(phi) * Math.sin(theta);

      // Colores de estrellas (cian, azul, blanco, púrpura)
      const r = Math.random();
      if (r < 0.33) {
        colors[i * 3] = 0.0; colors[i * 3 + 1] = 0.94; colors[i * 3 + 2] = 1.0;
      } else if (r < 0.66) {
        colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.0;  colors[i * 3 + 2] = 0.5;
      } else {
        colors[i * 3] = 0.8; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 1.0;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.22,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
    });
    this.starfield = new THREE.Points(geo, mat);
    this.scene.add(this.starfield);
  }

  /** Actualización por frame */
  update(delta) {
    const time = Date.now() * 0.001;

    // Rotación suave del cielo estrellado
    if (this.starfield) {
      this.starfield.rotation.y += delta * 0.015;
    }

    // Órbita de los orbes alrededor del usuario
    if (this.orbs) {
      this.orbs.forEach((orb) => {
        const u = orb.userData;
        const currentAngle = u.baseAngle + time * u.speed;
        orb.position.x = Math.sin(currentAngle) * u.radius;
        orb.position.z = Math.cos(currentAngle) * u.radius;
        orb.position.y = u.heightOffset + Math.sin(time * 2 + u.baseAngle) * 0.25;
        orb.rotation.x += delta * 1.2;
        orb.rotation.y += delta * 1.5;
      });
    }
  }

  dispose() {
    if (this.starfield) {
      this.starfield.geometry?.dispose?.();
      this.starfield.material?.dispose?.();
    }
    if (this.orbs) {
      this.orbs.forEach((orb) => {
        orb.geometry?.dispose?.();
        orb.material?.dispose?.();
      });
    }
  }
}
