/**
 * Buoy.js
 * Entidad de la Boya marina ("volla") que marca el punto de llegada en el mar:
 * - Modelo 3D de baliza náutica con franjas amarillo/rojo y jaula metálica
 * - Linterna marina intermitente con PointLight pulsante que guía al usuario desde la costa
 * - Físicas de flotabilidad y cabeceo marino sincronizadas con el oleaje
 * - Detección de proximidad de llegada y celebración con fuegos artificiales de partículas
 */
import * as THREE from 'three';

export class Buoy {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../scene/CoastEnvironment.js').CoastEnvironment} environment
   * @param {THREE.Vector3} targetPosition
   */
  constructor(scene, environment, targetPosition = new THREE.Vector3(0, 0, -145)) {
    this.scene = scene;
    this.environment = environment;
    this.position = targetPosition;

    this.arrivalRadius = 6.0; // Distancia en metros para considerar completada la travesía
    this.hasArrived = false;
    this.time = 0;

    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    this.scene.add(this.group);

    this._buildBuoyModel();
    this._buildParticleFountain();
  }

  _buildBuoyModel() {
    // 1. Flotador cilíndrico náutico principal
    const hullMatYellow = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5, metalness: 0.3 });
    const hullMatRed    = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5, metalness: 0.3 });

    // Franja inferior roja
    const baseHull = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.4, 1.2, 16), hullMatRed);
    baseHull.position.y = 0.6;
    baseHull.castShadow = true;
    this.group.add(baseHull);

    // Franja superior amarilla
    const topHull = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 1.2, 16), hullMatYellow);
    topHull.position.y = 1.8;
    topHull.castShadow = true;
    this.group.add(topHull);

    // Bumper perimetral de goma negra
    const bumperMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9 });
    const bumper = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 8, 24), bumperMat);
    bumper.rotation.x = Math.PI / 2;
    bumper.position.y = 1.2;
    this.group.add(bumper);

    // 2. Torreta / Jaula metálica superior
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.8, roughness: 0.3 });
    const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.5, 6);
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const leg = new THREE.Mesh(legGeo, towerMat);
      leg.position.set(Math.cos(angle) * 0.7, 3.4, Math.sin(angle) * 0.7);
      leg.rotation.z = Math.cos(angle) * 0.15;
      leg.rotation.x = -Math.sin(angle) * 0.15;
      this.group.add(leg);
    }

    // Plataforma de la linterna
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.1, 12), towerMat);
    platform.position.y = 4.6;
    this.group.add(platform);

    // 3. Linterna marina y Baliza de luz
    const lanternGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.5, 12);
    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0xff8800,
      emissiveIntensity: 1.5,
      roughness: 0.1,
    });
    this.lanternMesh = new THREE.Mesh(lanternGeo, lanternMat);
    this.lanternMesh.position.y = 4.9;
    this.group.add(this.lanternMesh);

    // Luz puntual intermitente visible a gran distancia
    this.beaconLight = new THREE.PointLight(0xffa500, 3.5, 60);
    this.beaconLight.position.set(0, 5.0, 0);
    this.group.add(this.beaconLight);

    // Halo luminoso (glow sprite)
    const haloCanvas = document.createElement('canvas');
    haloCanvas.width = 128;
    haloCanvas.height = 128;
    const hCtx = haloCanvas.getContext('2d');
    const grad = hCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255, 190, 40, 1)');
    grad.addColorStop(0.3, 'rgba(255, 140, 0, 0.6)');
    grad.addColorStop(1, 'rgba(255, 100, 0, 0)');
    hCtx.fillStyle = grad;
    hCtx.fillRect(0, 0, 128, 128);

    const haloTex = new THREE.CanvasTexture(haloCanvas);
    const haloMat = new THREE.SpriteMaterial({ map: haloTex, transparent: true, blending: THREE.AdditiveBlending });
    this.haloSprite = new THREE.Sprite(haloMat);
    this.haloSprite.scale.set(3.5, 3.5, 1);
    this.haloSprite.position.set(0, 5.0, 0);
    this.group.add(this.haloSprite);
  }

  // ─── Fuente de Partículas de Celebración de Victoria ────────────────────────
  _buildParticleFountain() {
    const count = 120;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const palette = [
      new THREE.Color(0x00f0ff),
      new THREE.Color(0xffd700),
      new THREE.Color(0xff007f),
      new THREE.Color(0x00ff88),
    ];

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = 0;
      positions[i * 3 + 1] = 5.0;
      positions[i * 3 + 2] = 0;

      const angle = Math.random() * Math.PI * 2;
      const speed = 2.0 + Math.random() * 4.5;
      velocities[i * 3 + 0] = Math.cos(angle) * speed;
      velocities[i * 3 + 1] = 4.0 + Math.random() * 6.0;
      velocities[i * 3 + 2] = Math.sin(angle) * speed;

      const c = palette[i % palette.length];
      colors[i * 3 + 0] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.particleVelocities = velocities;

    const mat = new THREE.PointsMaterial({
      size: 0.35,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });

    this.particles = new THREE.Points(geo, mat);
    this.group.add(this.particles);
  }

  /**
   * Actualiza el balanceo de la boya con las olas y la baliza luminosa
   * @param {number} delta
   * @param {THREE.Vector3} raftPosition
   * @returns {boolean} True si el usuario acaba de llegar a la boya
   */
  update(delta, raftPosition) {
    this.time += delta;

    // Físicas de olas marinas
    const waveH = this.environment.getWaveHeight(this.position.x, this.position.z, this.time);
    const { pitch, roll } = this.environment.getWaveAngles(this.position.x, this.position.z, this.time);

    this.group.position.y = waveH;
    this.group.rotation.x = pitch * 0.8;
    this.group.rotation.z = roll * 0.8;

    // Destello de la baliza marítima (pulso cada 1.4 segundos)
    const strobe = (Math.sin(this.time * 4.5) + 1) / 2;
    const pulseIntensity = Math.pow(strobe, 4) * 5.0 + 0.8;
    if (this.beaconLight) this.beaconLight.intensity = pulseIntensity;
    if (this.lanternMesh) this.lanternMesh.material.emissiveIntensity = pulseIntensity * 1.2;
    if (this.haloSprite) this.haloSprite.scale.setScalar(2.0 + pulseIntensity * 0.4);

    // Comprobar llegada de la balsa
    if (!this.hasArrived && raftPosition) {
      const dist = raftPosition.distanceTo(this.position);
      if (dist < this.arrivalRadius) {
        this.hasArrived = true;
        this._triggerVictoryCelebration();
        return true;
      }
    }

    // Animar fuegos artificiales de partículas si ya se llegó
    if (this.hasArrived && this.particles.material.opacity > 0) {
      const posAttr = this.particles.geometry.attributes.position;
      const count = posAttr.count;
      for (let i = 0; i < count; i++) {
        posAttr.setX(i, posAttr.getX(i) + this.particleVelocities[i * 3 + 0] * delta);
        posAttr.setY(i, posAttr.getY(i) + this.particleVelocities[i * 3 + 1] * delta);
        posAttr.setZ(i, posAttr.getZ(i) + this.particleVelocities[i * 3 + 2] * delta);
        this.particleVelocities[i * 3 + 1] -= 9.8 * delta; // gravedad
      }
      posAttr.needsUpdate = true;
      this.particles.material.opacity = Math.max(0, this.particles.material.opacity - delta * 0.25);
    }

    return false;
  }

  _triggerVictoryCelebration() {
    if (this.particles) {
      this.particles.material.opacity = 1.0;
    }
  }
}
