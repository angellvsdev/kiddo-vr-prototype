/**
 * LlanoCinematicManager.js
 * Secuencia de apertura del nivel llanero (equivale a CoastCinematicManager):
 * 1. A PIE: el jinete aparece de pie junto a su caballo, en la sabana, con el sol bajo al frente.
 * 2. TRIGGER: por tiempo (3.5 s) o al pulsar pedal / gatillo / W.
 * 3. MONTAR: traslado suave en arco hacia la silla (curva smoothstep, libre de cinetosis).
 * 4. A CABALLO: el control pasa al jinete; el caballo queda montado y listo para andar.
 *
 * Las cinemáticas de cada nivel viven en esta carpeta.
 */
import * as THREE from 'three';

export const LlanoCinematicState = {
  ON_FOOT: 'ON_FOOT',
  MOUNTING: 'MOUNTING',
  RIDING: 'RIDING',
};

export class LlanoCinematicManager {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Group} cameraRig
   * @param {import('../entities/Horse.js').Horse} horse
   * @param {import('../audio/SpatialAudioManager.js').SpatialAudioManager} audioManager
   */
  constructor(scene, cameraRig, horse, audioManager) {
    this.scene = scene;
    this.cameraRig = cameraRig;
    this.horse = horse;
    this.audioManager = audioManager;

    this.state = LlanoCinematicState.ON_FOOT;
    this.timer = 0;
    this.transitionDuration = 3.6;
    this.autoStartAfter = 3.5;

    // El jinete espera a la izquierda del caballo, mirando hacia el atardecer (-Z)
    this.spawnPosition = this.horse.getDismountedSpot(new THREE.Vector3(), -1);
    this.cameraRig.position.copy(this.spawnPosition);
    this.cameraRig.rotation.set(0, 0, 0);

    this._buildBillboard();
  }

  _buildBillboard() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(45, 20, 8, 0.86)';
    ctx.beginPath();
    ctx.roundRect(0, 0, 1024, 512, 32);
    ctx.fill();
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(6, 6, 1012, 500, 28);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffb347';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.fillText('🌅 ATARDECER EN EL LLANO', 512, 78);

    ctx.fillStyle = '#fff1e0';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('Tu caballo te espera en la sabana.', 512, 140);

    ctx.strokeStyle = 'rgba(255, 179, 71, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(80, 175);
    ctx.lineTo(944, 175);
    ctx.stroke();

    ctx.fillStyle = '#e7d6c3';
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillText('• Mira a tu alrededor: el llano se extiende en 360°.', 512, 228);
    ctx.fillText('• Al montar, pedalea para avanzar poco a poco por el sendero.', 512, 273);
    ctx.fillText('• Sigue el camino hasta el portón del hato.', 512, 318);

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText('⚡ Presiona los pedales o el gatillo para montar ya', 512, 420);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.billboard = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.2),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, fog: false })
    );
    // Al frente-izquierda del jinete, a la altura de los ojos de un niño
    this.billboard.position.copy(this.spawnPosition).add(new THREE.Vector3(-0.5, 1.5, -3.2));
    this.scene.add(this.billboard);
  }

  startTransition() {
    if (this.state !== LlanoCinematicState.ON_FOOT) return;
    this.state = LlanoCinematicState.MOUNTING;
    this.timer = 0;
    this.startPos = this.cameraRig.position.clone();
    this.startYaw = this.cameraRig.rotation.y;
  }

  /**
   * @param {number} delta
   * @param {boolean} userWantsStart - Pedal, gatillo o tecla de avance presionados
   */
  update(delta, userWantsStart = false) {
    if (this.state === LlanoCinematicState.ON_FOOT) {
      this.timer += delta;
      // Seguir al caballo mientras espera (sigue respirando/moviendo la cola)
      this.cameraRig.position.y = this.horse.environment.getGroundHeight(
        this.cameraRig.position.x,
        this.cameraRig.position.z
      );
      if (this.timer > this.autoStartAfter || userWantsStart) this.startTransition();
      return;
    }

    if (this.state === LlanoCinematicState.MOUNTING) {
      this.timer += delta;
      const progress = Math.min(1, this.timer / this.transitionDuration);
      const t = progress * progress * (3 - 2 * progress); // smoothstep

      const target = this.horse.getSaddlePosition(new THREE.Vector3());
      this.cameraRig.position.lerpVectors(this.startPos, target, t);
      // Pequeño arco para "subir" al estribo
      this.cameraRig.position.y += Math.sin(progress * Math.PI) * 0.3;
      this.cameraRig.rotation.y = THREE.MathUtils.lerp(this.startYaw, this.horse.group.rotation.y, t);

      if (progress >= 1) {
        this.state = LlanoCinematicState.RIDING;
        this.horse.isMounted = true;
        this.billboard.visible = false;
        this.audioManager?.playHoofBeat?.(0.4);
      }
    }
  }

  isRiding() {
    return this.state === LlanoCinematicState.RIDING;
  }
}
