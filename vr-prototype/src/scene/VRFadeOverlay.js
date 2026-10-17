/**
 * VRFadeOverlay.js
 * Crea un domo esférico invertido acoplado a la cámara para transiciones
 * de fade-out / fade-in a negro en Realidad Virtual y pantalla, esencial para
 * evitar la cinetosis (mareo por movimiento) en Meta Quest 3 al cambiar de nivel.
 */
import * as THREE from 'three';

export class VRFadeOverlay {
  /**
   * @param {THREE.Camera} camera
   */
  constructor(camera) {
    this.camera = camera;
    this.opacity = 0.0;
    this.targetOpacity = 0.0;
    this.fadeSpeed = 2.0; // 0.5s para un fade completo
    this._resolve = null;

    // Esfera invertida con material negro transparente
    const geo = new THREE.SphereGeometry(0.2, 16, 16);
    this.material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.0,
      depthTest: false,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 99999; // Siempre encima de cualquier elemento
    // CRÍTICO: invisible por defecto para no tapar la pantalla ni generar artefactos de mezcla en Quest 3
    this.mesh.visible = false;

    if (this.camera) {
      this.camera.add(this.mesh);
    }
  }

  /**
   * Desacopla el overlay de la cámara activa de forma segura
   */
  detach() {
    if (this.mesh && this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
  }

  /**
   * Reancla el overlay si la cámara activa cambia entre niveles
   * @param {THREE.Camera} cam
   */
  attachToCamera(cam) {
    this.detach();
    this.camera = cam;
    if (this.camera && this.mesh) {
      this.camera.add(this.mesh);
    }
  }

  /**
   * Inicia un desvanecimiento a negro
   * @param {number} durationSeg
   * @returns {Promise<void>}
   */
  fadeOut(durationSeg = 0.5) {
    return new Promise((resolve) => {
      this.mesh.visible = true;
      this.fadeSpeed = 1.0 / Math.max(0.05, durationSeg);
      this.targetOpacity = 1.0;
      this._resolve = resolve;
    });
  }

  /**
   * Inicia un desvanecimiento desde negro hacia transparente
   * @param {number} durationSeg
   * @returns {Promise<void>}
   */
  fadeIn(durationSeg = 0.5) {
    return new Promise((resolve) => {
      this.fadeSpeed = 1.0 / Math.max(0.05, durationSeg);
      this.targetOpacity = 0.0;
      if (this.opacity <= 0.005) {
        this.opacity = 0.0;
        this.material.opacity = 0.0;
        this.mesh.visible = false;
        resolve();
        return;
      }
      this.mesh.visible = true;
      this._resolve = resolve;
    });
  }

  /**
   * Actualización por frame
   * @param {number} delta
   */
  update(delta) {
    if (this.opacity !== this.targetOpacity) {
      if (this.opacity < this.targetOpacity) {
        this.opacity = Math.min(this.targetOpacity, this.opacity + this.fadeSpeed * delta);
      } else {
        this.opacity = Math.max(this.targetOpacity, this.opacity - this.fadeSpeed * delta);
      }
      this.material.opacity = this.opacity;
      this.mesh.visible = this.opacity > 0.005;

      if (Math.abs(this.opacity - this.targetOpacity) < 0.005) {
        this.opacity = this.targetOpacity;
        this.material.opacity = this.opacity;
        this.mesh.visible = this.opacity > 0.005;
        if (this._resolve) {
          const cb = this._resolve;
          this._resolve = null;
          cb();
        }
      }
    } else {
      this.mesh.visible = this.opacity > 0.005;
    }
  }

  isOpaque() {
    return this.opacity >= 0.99;
  }

  dispose() {
    if (this.mesh && this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
    this.mesh?.geometry?.dispose();
    this.material?.dispose();
  }
}
