/**
 * CoastCinematicManager.js
 * Orquesta la secuencia de inicio en la costa y el traslado cinemático hacia la balsa:
 * 1. SPAWN: El usuario aparece de pie en la arena de la playa mirando al mar y la balsa.
 * 2. TRIGGER: Se inicia por tiempo (3s) o al pulsar los pedales / gatillo del mando.
 * 3. CINEMÁTICA: Traslado suave con curva cúbica suave (Hermite/Bézier) libre de cinetosis (VR-Safe).
 * 4. EMBARQUE: El jugador queda sentado en la balsa listo para pedalear hacia la boya.
 */
import * as THREE from 'three';

export const CinematicState = {
  ON_SHORE: 'ON_SHORE',
  TRANSITIONING: 'TRANSITIONING',
  BOARDED: 'BOARDED',
};

export class CoastCinematicManager {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Group} cameraRig
   * @param {import('../entities/Raft.js').Raft} raft
   * @param {import('../audio/SpatialAudioManager.js').SpatialAudioManager} audioManager
   */
  constructor(scene, cameraRig, raft, audioManager) {
    this.scene = scene;
    this.cameraRig = cameraRig;
    this.raft = raft;
    this.audioManager = audioManager;

    this.state = CinematicState.ON_SHORE;
    this.timer = 0;
    this.transitionDuration = 3.6; // segundos de viaje suave

    // Posición inicial en la arena
    this.shorePosition = new THREE.Vector3(0, 0, 9.5);
    this.cameraRig.position.copy(this.shorePosition);
    this.cameraRig.rotation.set(0, 0, 0); // mirando hacia el mar (z negativo)

    // Crear cartel de bienvenida en la orilla
    this._buildShoreBillboard();
  }

  _buildShoreBillboard() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(7, 24, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(0, 0, 1024, 512, 32);
    ctx.fill();

    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(6, 6, 1012, 500, 28);
    ctx.stroke();

    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 42px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏝️ COSTA DE EMBARQUE', 512, 75);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('Tu balsa te espera meciéndose en la orilla del mar.', 512, 140);

    ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(80, 175);
    ctx.lineTo(944, 175);
    ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillText('• La cinemática te trasladará automáticamente a la balsa.', 512, 230);
    ctx.fillText('• En el agua, pedalea para avanzar recogiendo las perlas.', 512, 275);
    ctx.fillText('• Sigue la ruta hasta la boya con la baliza de luz.', 512, 320);

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText('⚡ Presiona los pedales o el gatillo para subir de inmediato', 512, 420);

    const texture = new THREE.CanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(2.4, 1.2);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });

    this.billboard = new THREE.Mesh(geo, mat);
    this.billboard.position.set(0, 1.8, 6.5);
    this.scene.add(this.billboard);
  }

  /** Inicia manualmente o por input la cinemática de traslado */
  startTransition() {
    if (this.state !== CinematicState.ON_SHORE) return;
    this.state = CinematicState.TRANSITIONING;
    this.timer = 0;
    this.startPos = this.cameraRig.position.clone();
  }

  /**
   * Actualiza la cinemática cada frame
   * @param {number} delta
   * @param {boolean} userWantsStart - Si el usuario presionó pedal o gatillo
   */
  update(delta, userWantsStart = false) {
    if (this.state === CinematicState.ON_SHORE) {
      this.timer += delta;

      // Iniciar automáticamente tras 3.5 segundos o si el usuario presiona pedal/gatillo
      if (this.timer > 3.5 || userWantsStart) {
        this.startTransition();
      }
      return;
    }

    if (this.state === CinematicState.TRANSITIONING) {
      this.timer += delta;
      const progress = Math.min(1.0, this.timer / this.transitionDuration);

      // Curva de interpolación Cúbica Suave (Smoothstep / Ease-In-Out)
      const t = progress * progress * (3.0 - 2.0 * progress);

      // Destino: Asiento de la balsa
      const targetPos = this.raft.group.position.clone();
      targetPos.y += 0.85;
      targetPos.z += 0.4;

      // Trayectoria arqueada suave
      this.cameraRig.position.lerpVectors(this.startPos, targetPos, t);
      // Suave elevación intermedia para sobrevolar las olas
      this.cameraRig.position.y += Math.sin(progress * Math.PI) * 0.45;

      // Al completar el traslado:
      if (progress >= 1.0) {
        this.state = CinematicState.BOARDED;
        this.raft.isBoarded = true;
        this.raft.setStatusMessage('¡A bordo! Empieza a pedalear hacia la boya');

        // Ocultar cartel de la orilla
        if (this.billboard) {
          this.billboard.visible = false;
        }

        // Sonido de confirmación al abordar madera
        if (this.audioManager) {
          this.audioManager.playPedalSplash(0.4);
        }
      }
    }
  }

  isBoarded() {
    return this.state === CinematicState.BOARDED;
  }
}
