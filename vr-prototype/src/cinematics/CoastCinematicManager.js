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
   * @param {THREE.Camera} camera
   * @param {import('three/addons/controls/OrbitControls.js').OrbitControls} controls
   */
  constructor(scene, cameraRig, raft, audioManager, camera = null, controls = null) {
    this.scene = scene;
    this.cameraRig = cameraRig;
    this.raft = raft;
    this.audioManager = audioManager;
    this.camera = camera;
    this.controls = controls;

    this.state = CinematicState.ON_SHORE;
    this.timer = 0;
    this.transitionDuration = 2.2; // Traslado ágil y suave (2.2s)

    // Posición inicial en la arena
    this.shorePosition = new THREE.Vector3(0, 1.8, 9.5);
    this.shoreLook = new THREE.Vector3(0, 1.2, -2.5); // mirando hacia el mar y la balsa

    if (this.camera) {
      this.camera.position.copy(this.shorePosition);
    }
    if (this.controls) {
      this.controls.target.copy(this.shoreLook);
      this.controls.update();
    }
    if (this.cameraRig) {
      this.cameraRig.position.set(0, 0, 9.5);
      this.cameraRig.rotation.set(0, 0, 0);
    }

    // Crear cartel de bienvenida en la orilla
    this._buildShoreBillboard();
  }

  _buildShoreBillboard() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(7, 24, 42, 0.9)';
    ctx.beginPath();
    ctx.roundRect(0, 0, 1024, 512, 32);
    ctx.fill();

    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(6, 6, 1012, 500, 28);
    ctx.stroke();

    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 44px system-ui, sans-serif';
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
    ctx.fillText('• La cinemática te traslada al asiento de la balsa.', 512, 230);
    ctx.fillText('• En el agua, pedalea para avanzar recogiendo las perlas.', 512, 275);
    ctx.fillText('• Llega hasta la boya con la baliza de luz para completar la meta.', 512, 320);

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 32px system-ui, sans-serif';
    ctx.fillText('⚡ Presiona los pedales, gatillo o Espacio/W para embarcar', 512, 420);

    const texture = new THREE.CanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(2.6, 1.3);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });

    this.billboard = new THREE.Mesh(geo, mat);
    this.billboard.position.set(0, 1.8, 6.0);
    this.scene.add(this.billboard);
  }

  /** Inicia manualmente o por input la cinemática de traslado */
  startTransition() {
    if (this.state !== CinematicState.ON_SHORE) return;
    this.state = CinematicState.TRANSITIONING;
    this.timer = 0;
    this.startRigPos = this.cameraRig ? this.cameraRig.position.clone() : new THREE.Vector3(0, 0, 9.5);
    this.startCamPos = this.camera ? this.camera.position.clone() : this.shorePosition.clone();
    this.startTargetPos = this.controls ? this.controls.target.clone() : this.shoreLook.clone();
  }

  /**
   * Actualiza la cinemática cada frame
   * @param {number} delta
   * @param {boolean} userWantsStart - Si el usuario presionó pedal o tecla
   */
  update(delta, userWantsStart = false) {
    if (this.state === CinematicState.ON_SHORE) {
      this.timer += delta;

      // Iniciar de inmediato al pedalear/pulsar tecla o tras 2.5s
      if (this.timer > 2.5 || userWantsStart) {
        this.startTransition();
      }
      return;
    }

    if (this.state === CinematicState.TRANSITIONING) {
      this.timer += delta;

      // Si el usuario vuelve a presionar para navegar mientras se traslada, completar de inmediato
      if (userWantsStart && this.timer > 0.4) {
        this.timer = this.transitionDuration;
      }

      const progress = Math.min(1.0, this.timer / this.transitionDuration);

      // Curva de interpolación Cúbica Suave (Smoothstep)
      const t = progress * progress * (3.0 - 2.0 * progress);

      // Destino: Asiento de la balsa
      const forward = new THREE.Vector3(0, 0, -1).applyEuler(this.raft.group.rotation);
      const raftPos = this.raft.group.position;
      const seatPos = raftPos.clone().add(new THREE.Vector3(0, 0.85, 0)).add(new THREE.Vector3(0, 0, 0.4).applyEuler(this.raft.group.rotation));

      const targetCamPos = raftPos.clone().addScaledVector(forward, -1.6).add(new THREE.Vector3(0, 1.45, 0));
      const targetLook = raftPos.clone().addScaledVector(forward, 6.0).add(new THREE.Vector3(0, 0.8, 0));

      // Actualizar rig VR
      if (this.cameraRig) {
        this.cameraRig.position.lerpVectors(this.startRigPos, seatPos, t);
        this.cameraRig.position.y += Math.sin(progress * Math.PI) * 0.35;
      }

      // Actualizar cámara en modo escritorio
      if (this.camera) {
        this.camera.position.lerpVectors(this.startCamPos, targetCamPos, t);
        this.camera.position.y += Math.sin(progress * Math.PI) * 0.35;
      }
      if (this.controls) {
        this.controls.target.lerpVectors(this.startTargetPos, targetLook, t);
        this.controls.update();
      }

      // Al completar el traslado:
      if (progress >= 1.0) {
        this.state = CinematicState.BOARDED;
        this.raft.isBoarded = true;
        this.raft.setStatusMessage('¡A bordo! Pedalea para navegar hacia la boya');

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
