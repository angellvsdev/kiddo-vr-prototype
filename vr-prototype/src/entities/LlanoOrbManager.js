/**
 * LlanoOrbManager.js
 * Coleccionables del nivel llanero (equivalen a las perlas del nivel costero):
 * "Orbes del Atardecer", esferas ámbar luminosas con un anillo dorado, suspendidas a la altura
 * de la silla a lo largo del sendero. Cada orbe recogido suma puntos y dispara el evento
 * PEARL_COLLECTED hacia el dispositivo externo (mismo contrato que el nivel costero).
 *
 * Los orbes se reparten por distancia de ruta, así que el total de puntos refleja cuánto
 * avanzó el niño pedaleando.
 */
import * as THREE from 'three';
import { LLANO_ROUTE_LENGTH } from '../scene/LlanoEnvironment.js';

export const POINTS_PER_ORB = 100;

export class LlanoOrbManager {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../scene/LlanoEnvironment.js').LlanoEnvironment} environment
   * @param {import('../services/DeviceActionBridge.js').DeviceActionBridge} deviceBridge
   * @param {import('../audio/SpatialAudioManager.js').SpatialAudioManager} audioManager
   */
  constructor(scene, environment, deviceBridge, audioManager, count = 12) {
    this.scene = scene;
    this.environment = environment;
    this.deviceBridge = deviceBridge;
    this.audioManager = audioManager;

    this.orbs = [];
    this.collectedCount = 0;
    this.score = 0;
    this.time = 0;
    this.collectionRadius = 2.6; // metros (distancia 3D al jinete)

    this._buildGlowTexture();
    this._buildOrbs(count);
    this._buildBurst();
  }

  _buildGlowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,214,120,0.95)');
    g.addColorStop(0.3, 'rgba(255,160,60,0.45)');
    g.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    this.glowTexture = new THREE.CanvasTexture(c);
    this.glowTexture.colorSpace = THREE.SRGBColorSpace;
  }

  _buildOrbs(count) {
    const orbGeo = new THREE.SphereGeometry(0.3, 20, 20);
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0xffd27a,
      emissive: 0xff9a2e,
      emissiveIntensity: 1.1,
      roughness: 0.25,
      metalness: 0.1,
    });
    const ringGeo = new THREE.TorusGeometry(0.52, 0.025, 8, 32);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xffe08a,
      emissive: 0xd97706,
      emissiveIntensity: 0.9,
      metalness: 0.8,
      roughness: 0.25,
    });
    const glowMat = new THREE.SpriteMaterial({
      map: this.glowTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });

    const startZ = -30;
    const endZ = -(LLANO_ROUTE_LENGTH - 25);
    for (let i = 0; i < count; i++) {
      const z = startZ + ((endZ - startZ) * i) / (count - 1);
      // Ligero zigzag alrededor del centro del sendero (alcanzable sin salirse del camino)
      const x = this.environment.getTrailCenterX(z) + Math.sin(i * 1.3) * 2.0;
      const baseY = this.environment.getGroundHeight(x, z) + 1.5;

      const group = new THREE.Group();
      group.position.set(x, baseY, z);

      const mesh = new THREE.Mesh(orbGeo, orbMat);
      mesh.castShadow = false;
      group.add(mesh);

      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 3;
      group.add(ring);

      const glow = new THREE.Sprite(glowMat);
      glow.scale.setScalar(3.4);
      group.add(glow);

      this.scene.add(group);
      this.orbs.push({ id: `orb_${i + 1}`, group, mesh, ring, baseX: x, baseY, baseZ: z, collected: false, anim: 0 });
    }
  }

  _buildBurst() {
    const N = 50;
    const pos = new Float32Array(N * 3).fill(-1000);
    this.burstVel = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const spd = 2 + Math.random() * 3;
      this.burstVel[i * 3] = Math.sin(phi) * Math.cos(theta) * spd;
      this.burstVel[i * 3 + 1] = Math.cos(phi) * spd;
      this.burstVel[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * spd;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.burst = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffc04d,
        size: 0.3,
        map: this.glowTexture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      })
    );
    this.burst.frustumCulled = false;
    this.scene.add(this.burst);
    this.burstLife = 0;
  }

  _triggerBurst(at) {
    this.burstLife = 1;
    this.burst.material.opacity = 1;
    const p = this.burst.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, at.x, at.y, at.z);
    p.needsUpdate = true;
  }

  /**
   * @param {number} delta
   * @param {THREE.Vector3} riderPosition - Posición mundial de los ojos/silla del jinete
   * @param {Function|null} onHapticPulse
   * @returns {{ newCollection: boolean, total: number, target: number, score: number }}
   */
  update(delta, riderPosition, onHapticPulse = null) {
    this.time += delta;
    let newCollection = false;

    for (const o of this.orbs) {
      if (o.collected) {
        if (o.anim < 1) {
          o.anim += delta * 3;
          const s = Math.max(0, 1 - o.anim);
          o.group.scale.setScalar(s);
          o.group.position.y += delta * 2.5;
          if (o.anim >= 1) o.group.visible = false;
        }
        continue;
      }

      o.group.position.y = o.baseY + Math.sin(this.time * 2.2 + o.baseZ * 0.1) * 0.15;
      o.mesh.rotation.y += delta * 1.5;
      o.ring.rotation.z += delta * 2.0;
      o.ring.rotation.x += delta * 0.8;

      if (riderPosition && riderPosition.distanceTo(o.group.position) < this.collectionRadius) {
        o.collected = true;
        this.collectedCount++;
        this.score += POINTS_PER_ORB;
        newCollection = true;

        this._triggerBurst(o.group.position);
        this.audioManager?.playPearlChime(this.collectedCount);
        onHapticPulse?.(0.85, 140);

        this.deviceBridge.onPearlCollected({
          id: o.id,
          totalCollected: this.collectedCount,
          targetTotal: this.orbs.length,
          position: { x: o.baseX, z: o.baseZ },
        });
      }
    }

    if (this.burstLife > 0) {
      this.burstLife -= delta * 1.6;
      this.burst.material.opacity = Math.max(0, this.burstLife);
      const p = this.burst.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        p.setXYZ(
          i,
          p.getX(i) + this.burstVel[i * 3] * delta,
          p.getY(i) + this.burstVel[i * 3 + 1] * delta,
          p.getZ(i) + this.burstVel[i * 3 + 2] * delta
        );
        this.burstVel[i * 3 + 1] -= 4 * delta;
      }
      p.needsUpdate = true;
    }

    return { newCollection, total: this.collectedCount, target: this.orbs.length, score: this.score };
  }

  getTotalCount() {
    return this.orbs.length;
  }
}
