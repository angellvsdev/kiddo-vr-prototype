/**
 * PearlManager.js
 * Gestiona los elementos coleccionables (perlas) que funcionan como monedas:
 * - Genera un sendero de perlas nacaradas flotantes a lo largo del trayecto costero
 * - Material físico iridiscente y resplandeciente con halo de partículas estelares
 * - Flotación dinámica sincronizada con el oleaje marino
 * - Detección de proximidad y colisión con la balsa
 * - Efecto de absorción y partículas al recoger
 * - Disparo del gancho/evento hacia el dispositivo externo (DeviceActionBridge)
 */
import * as THREE from 'three';

export class PearlManager {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../scene/CoastEnvironment.js').CoastEnvironment} environment
   * @param {import('../services/DeviceActionBridge.js').DeviceActionBridge} deviceBridge
   * @param {import('../audio/SpatialAudioManager.js').SpatialAudioManager} audioManager
   */
  constructor(scene, environment, deviceBridge, audioManager) {
    this.scene = scene;
    this.environment = environment;
    this.deviceBridge = deviceBridge;
    this.audioManager = audioManager;

    this.pearls = [];
    this.collectedCount = 0;
    this.time = 0;

    this.collectionRadius = 2.4; // Radio de recolección en metros

    this._buildPearlTrail();
    this._buildCollectionParticles();
  }

  // ─── Generación de Perlas en el Trayecto Marino ────────────────────────────
  _buildPearlTrail() {
    const pearlCount = 12;
    const startZ = -12;
    const endZ = -135;
    const stepZ = (endZ - startZ) / (pearlCount - 1);

    // Material nacarado de lujo con iridiscencia y resplandor
    const pearlGeo = new THREE.SphereGeometry(0.32, 24, 24);
    const pearlMat = new THREE.MeshPhysicalMaterial({
      color: 0xf0f9ff,
      emissive: 0x88e8ff,
      emissiveIntensity: 0.85,
      roughness: 0.05,
      metalness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      ior: 1.5,
    });

    // Anillo dorado orbital que rodea a cada perla
    const ringGeo = new THREE.TorusGeometry(0.55, 0.025, 8, 32);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xd97706,
      emissiveIntensity: 0.8,
      metalness: 0.9,
      roughness: 0.2,
    });

    for (let i = 0; i < pearlCount; i++) {
      const z = startZ + i * stepZ;
      // Curvatura suave en X (sendero sinuoso natural para incentivar timonear)
      const x = Math.sin(i * 0.75) * 8.5;

      const group = new THREE.Group();
      group.position.set(x, 0.6, z);

      // Esfera perla
      const mesh = new THREE.Mesh(pearlGeo, pearlMat.clone());
      mesh.castShadow = true;
      group.add(mesh);

      // Anillo dorado
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 3;
      group.add(ring);

      // Luz puntual local tenue
      const light = new THREE.PointLight(0x00f0ff, 1.2, 5.0);
      group.add(light);

      this.scene.add(group);

      this.pearls.push({
        id: `pearl_${i + 1}`,
        group,
        mesh,
        ring,
        light,
        baseX: x,
        baseZ: z,
        collected: false,
        collectAnim: 0,
      });
    }
  }

  // ─── Sistema de Partículas al Recoger ──────────────────────────────────────
  _buildCollectionParticles() {
    const burstCount = 60;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(burstCount * 3);
    const vel = new Float32Array(burstCount * 3);

    for (let i = 0; i < burstCount; i++) {
      pos[i * 3 + 0] = 0;
      pos[i * 3 + 1] = -100; // Ocultas bajo el mundo
      pos[i * 3 + 2] = 0;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const spd = 2.5 + Math.random() * 3.5;
      vel[i * 3 + 0] = Math.sin(phi) * Math.cos(theta) * spd;
      vel[i * 3 + 1] = Math.cos(phi) * spd;
      vel[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * spd;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.burstVelocities = vel;

    const mat = new THREE.PointsMaterial({
      color: 0x00ffff,
      size: 0.22,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });

    this.burstPoints = new THREE.Points(geo, mat);
    this.scene.add(this.burstPoints);
    this.burstLife = 0;
  }

  triggerBurst(atPosition) {
    this.burstLife = 1.0;
    this.burstPoints.material.opacity = 1.0;
    const pos = this.burstPoints.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, atPosition.x, atPosition.y, atPosition.z);
    }
    pos.needsUpdate = true;
  }

  /**
   * Actualiza la flotación de las perlas y detecta colisiones con la balsa
   * @param {number} delta
   * @param {THREE.Vector3} raftPosition
   * @param {Function} onHapticPulse - Callback para disparar vibración en mandos Quest
   * @returns {{ collected: boolean, total: number, target: number }}
   */
  update(delta, raftPosition, onHapticPulse = null) {
    this.time += delta;
    let newCollection = false;

    for (const p of this.pearls) {
      if (p.collected) {
        // Animación de absorción y desaparición
        if (p.collectAnim < 1.0) {
          p.collectAnim += delta * 3.0;
          const s = Math.max(0, 1.0 - p.collectAnim);
          p.group.scale.set(s, s, s);
          p.group.position.y += delta * 2.5; // sube hacia arriba
          if (p.collectAnim >= 1.0) {
            p.group.visible = false;
          }
        }
        continue;
      }

      // 1. Flotación rítmica sobre el agua
      const waveH = this.environment.getWaveHeight(p.baseX, p.baseZ, this.time);
      const bob = Math.sin(this.time * 2.8 + p.baseZ * 0.1) * 0.15;
      p.group.position.y = waveH + 0.65 + bob;

      // 2. Rotación continua
      p.mesh.rotation.y += delta * 1.5;
      p.ring.rotation.z += delta * 2.0;
      p.ring.rotation.x += delta * 0.8;

      // 3. Detección de Colisión / Recogida con la balsa
      if (raftPosition) {
        const dist = raftPosition.distanceTo(p.group.position);
        if (dist < this.collectionRadius) {
          p.collected = true;
          this.collectedCount++;
          newCollection = true;

          // Disparar explosión de partículas
          this.triggerBurst(p.group.position);

          // Disparar audio cristalino
          if (this.audioManager) {
            this.audioManager.playPearlChime(this.collectedCount);
          }

          // Disparar hápticos en Quest 3
          if (onHapticPulse) {
            onHapticPulse(0.85, 140);
          }

          // ⚡ DISPARO CRÍTICO: Ejecutar acción en el dispositivo externo
          this.deviceBridge.onPearlCollected({
            id: p.id,
            totalCollected: this.collectedCount,
            targetTotal: this.pearls.length,
            position: { x: p.baseX, z: p.baseZ },
          });
        }
      }
    }

    // Actualizar partículas de recolección en curso
    if (this.burstLife > 0) {
      this.burstLife -= delta * 1.6;
      this.burstPoints.material.opacity = Math.max(0, this.burstLife);

      const pos = this.burstPoints.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setX(i, pos.getX(i) + this.burstVelocities[i * 3 + 0] * delta);
        pos.setY(i, pos.getY(i) + this.burstVelocities[i * 3 + 1] * delta);
        pos.setZ(i, pos.getZ(i) + this.burstVelocities[i * 3 + 2] * delta);
        this.burstVelocities[i * 3 + 1] -= 4.0 * delta; // gravedad
      }
      pos.needsUpdate = true;
    }

    return {
      newCollection,
      total: this.collectedCount,
      target: this.pearls.length,
    };
  }

  getTotalCount() {
    return this.pearls.length;
  }
}
