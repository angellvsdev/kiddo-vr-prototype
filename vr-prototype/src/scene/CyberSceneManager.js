/**
 * CyberSceneManager.js
 * Orquestador del nivel "Cyber-Arena Cósmica" (el espacio inicial generado en el proyecto):
 * - Entorno 360° cibernético con monolitos, orbes cinéticos y cúpula estelar (Environment.js)
 * - Portal de energía cósmica como punto final de llegada (meta)
 * - Desplazamiento por pedales físicos, Touch Controllers o teclado
 * - Al alcanzar la meta, despliega celebración y regresa automáticamente al Lobby
 * - Cumple el Contrato de Nivel de ./levels/registry.js
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Environment } from './Environment.js';
import { SpatialAudioManager } from '../audio/SpatialAudioManager.js';
import { PedalController } from '../input/PedalController.js';
import { DeviceActionBridge } from '../services/DeviceActionBridge.js';

export class CyberSceneManager {
  static meta = {
    id: 'cyber',
    title: 'Cyber-Arena Cósmica',
    hudTitle: '🌌 CYBER-ARENA CÓSMICA • QUEST 3',
    pageTitle: 'Cyber-Arena Cósmica VR — Meta Quest 3',
    modeHint: '🚴 <strong>Pedalea</strong> o pulsa <strong>Espacio/W</strong> para avanzar hacia el portal | <strong>A/D</strong> para timonear',
    statusText: '🌌 Cyber-Arena activa — Alcanza el portal de energía central',
  };

  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {import('../vr/XRController.js').XRControllerManager} controllerManager
   */
  constructor(renderer, controllerManager) {
    this.renderer = renderer;
    this.controllerManager = controllerManager;
    this._disposers = [];

    // ─── 1. Escena y Cámara ───────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1500
    );
    this.camera.position.set(0, 1.6, 9.5);

    this.cameraRig = new THREE.Group();
    this.cameraRig.position.set(0, 0, 9.5);
    this.scene.add(this.cameraRig);
    this.scene.add(this.camera);

    if (this.controllerManager) {
      this.controllerManager.getGrips().forEach((grip) => this.cameraRig.add(grip));
    }

    // Controles escritorio orientados hacia el portal de energía al fondo
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.set(0, 1.5, -4);
    this.controls.enableDamping = true;

    // Teclado
    this.keys = { w: false, a: false, s: false, d: false, space: false };
    const onKey = (e, isDown) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup')    this.keys.w = isDown;
      if (k === 's' || k === 'arrowdown')  this.keys.s = isDown;
      if (k === 'a' || k === 'arrowleft')  this.keys.a = isDown;
      if (k === 'd' || k === 'arrowright') this.keys.d = isDown;
      if (k === ' ' || k === 'spacebar')   this.keys.space = isDown;
      if (isDown) this.audioManager.init();
    };
    const onKeyDown = (e) => onKey(e, true);
    const onKeyUp = (e) => onKey(e, false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    this._disposers.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    });

    // ─── 2. Servicios Base ────────────────────────────────────────────────────
    this.audioManager = new SpatialAudioManager({ ambience: 'cyber' });
    this.pedalController = new PedalController();
    this.deviceBridge = new DeviceActionBridge();

    // ─── 3. Entorno Cibernético Original ──────────────────────────────────────
    this.environment = new Environment(this.scene);

    // ─── 4. Portal Cósmico / Meta de Llegada ──────────────────────────────────
    this.goalPosition = new THREE.Vector3(0, 1.8, -12);
    this.goalRadius = 3.2;
    this._goalDone = false;
    this._buildGoalPortal();

    // Variables de locomoción
    this.velocity = 0;
    this.heading = 0;
    this.totalTime = 0;

    // Callback de finalización para volver al Lobby
    this.onLevelComplete = null;

    // Inicializar audio
    const onInitAudio = () => this.audioManager.init();
    window.addEventListener('pointerdown', onInitAudio, { once: true });
    this._disposers.push(() => window.removeEventListener('pointerdown', onInitAudio));
  }

  _buildGoalPortal() {
    this.portalGroup = new THREE.Group();
    this.portalGroup.position.copy(this.goalPosition);

    // Anillos de energía concéntricos
    const ringGeo = new THREE.TorusGeometry(2.0, 0.08, 16, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    this.portalRing1 = new THREE.Mesh(ringGeo, ringMat);
    this.portalGroup.add(this.portalRing1);

    const innerGeo = new THREE.TorusGeometry(1.4, 0.06, 16, 36);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0xff007f });
    this.portalRing2 = new THREE.Mesh(innerGeo, innerMat);
    this.portalGroup.add(this.portalRing2);

    // Luz del portal
    this.portalLight = new THREE.PointLight(0x00f0ff, 2.5, 25);
    this.portalGroup.add(this.portalLight);

    // Letrero holográfico de meta
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(10, 10, 26, 0.85)';
    ctx.roundRect(0, 0, 512, 128, 20);
    ctx.fill();
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 4;
    ctx.roundRect(4, 4, 504, 120, 16);
    ctx.stroke();
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚡ PORTAL META ⚡', 256, 75);

    const tex = new THREE.CanvasTexture(canvas);
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.6),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    banner.position.y = 2.6;
    this.portalGroup.add(banner);

    this.scene.add(this.portalGroup);
  }

  onSessionStart() {
    this.controls.enabled = false;
    this.cameraRig.add(this.camera);
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
    this.audioManager.init();
  }

  onSessionEnd() {
    this.scene.add(this.camera);
    this.controls.enabled = true;
    this.controls.update();
  }

  update(delta, cs, frame) {
    this.totalTime += delta;
    const isPresenting = this.renderer.xr.isPresenting;

    // 1. Pedales físicos
    const pedalState = this.pedalController.update(delta);
    if (pedalState.strokeDetected) {
      this.audioManager.playCyberPulse(pedalState.power);
    }

    // 2. Determinar potencia efectiva
    let effectivePower = pedalState.power;
    let steerInput = 0;

    if (isPresenting) {
      const vrTrigger = Math.max(cs?.triggerR ?? 0, cs?.triggerL ?? 0);
      const vrStickY = -(cs?.move?.y ?? 0);
      const vrStickX = cs?.turn?.x ?? cs?.move?.x ?? 0;
      if (vrTrigger > 0.05 || vrStickY > 0.05) {
        effectivePower = Math.max(effectivePower, Math.max(vrTrigger, vrStickY > 0 ? vrStickY : 0));
      }
      steerInput = vrStickX;
    } else {
      if (this.keys.w || this.keys.space) effectivePower = Math.max(effectivePower, 0.9);
      if (this.keys.a) steerInput -= 1.0;
      if (this.keys.d) steerInput += 1.0;
    }

    // 3. Locomoción sobre la cuadrícula cibernética
    if (!this._goalDone) {
      this.heading -= steerInput * delta * 1.5;
      const targetVel = effectivePower * 6.5; // hasta ~6.5 m/s
      this.velocity = THREE.MathUtils.lerp(this.velocity, targetVel, delta * 3.0);

      const moveZ = -Math.cos(this.heading) * this.velocity * delta;
      const moveX = Math.sin(this.heading) * this.velocity * delta;

      this.cameraRig.position.x += moveX;
      this.cameraRig.position.z += moveZ;
      this.cameraRig.rotation.y = this.heading;

      if (!isPresenting) {
        this.camera.position.x += moveX;
        this.camera.position.z += moveZ;
        this.controls.target.set(
          this.cameraRig.position.x - Math.sin(this.heading) * 4.0,
          1.5,
          this.cameraRig.position.z - Math.cos(this.heading) * 4.0
        );
      }
    }

    // 4. Actualizar entorno y portal
    this.environment.update(delta);
    if (this.portalRing1) this.portalRing1.rotation.z += delta * 1.5;
    if (this.portalRing2) this.portalRing2.rotation.z -= delta * 2.0;

    // 5. Comprobar meta de llegada
    const distToGoal = this.cameraRig.position.distanceTo(this.goalPosition);
    if (!this._goalDone && distToGoal < this.goalRadius) {
      this._onGoalReached();
    }

    if (!isPresenting && this.controls.enabled) {
      this.controls.update();
    }
  }

  _onGoalReached() {
    this._goalDone = true;
    this.velocity = 0;
    this.audioManager.playVictoryFanfare();
    this.controllerManager?.triggerHaptic?.(1.0, 500);

    // Notificar al puente de hardware externo
    this.deviceBridge.onGoalReached({
      totalTimeSec: Math.round(this.totalTime),
      totalPearls: 8,
      distanceMeters: 24,
    });

    // Crear banner 3D flotante de victoria
    this._showVictoryBanner();

    // Retorno automático al Lobby tras 4.5 segundos
    setTimeout(() => {
      if (this.onLevelComplete) {
        this.onLevelComplete('cyber');
      }
    }, 4500);
  }

  _showVictoryBanner() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(7, 12, 28, 0.95)';
    ctx.roundRect(0, 0, 1024, 512, 32);
    ctx.fill();

    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 6;
    ctx.roundRect(6, 6, 1012, 500, 26);
    ctx.stroke();

    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏆 ¡META CÓSMICA ALCANZADA!', 512, 90);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '30px system-ui, sans-serif';
    ctx.fillText('Has completado el recorrido por la Cyber-Arena.', 512, 170);

    ctx.fillStyle = '#a855f7';
    ctx.font = '28px system-ui, sans-serif';
    ctx.fillText(`⏱️ Tiempo total: ${Math.round(this.totalTime)} segundos`, 512, 240);

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText('🏛️ Regresando al Lobby principal...', 512, 410);

    const texture = new THREE.CanvasTexture(canvas);
    const planeGeo = new THREE.PlaneGeometry(2.6, 1.3);
    const planeMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const banner = new THREE.Mesh(planeGeo, planeMat);

    // Posicionar a 2m frente al usuario
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(this.cameraRig.rotation);
    banner.position.copy(this.cameraRig.position).addScaledVector(forward, 2.0).add(new THREE.Vector3(0, 1.4, 0));
    banner.quaternion.copy(this.cameraRig.quaternion);
    this.scene.add(banner);
  }

  getTelemetry() {
    return {
      pedalState: this.pedalController.state,
      effectiveRpm: Math.round(this.velocity * 12),
      pearlsCount: this._goalDone ? 8 : 0,
      targetPearls: 8,
    };
  }

  dispose() {
    this._disposers.forEach((fn) => fn());
    this._disposers.length = 0;
    this.controls?.dispose();

    // Desacoplar objetos persistentes (cámara, rig, mandos) antes de limpiar la escena
    if (this.controllerManager) {
      this.controllerManager.getGrips().forEach((grip) => {
        if (grip.parent) grip.parent.remove(grip);
      });
    }
    if (this.camera && this.camera.parent) {
      this.camera.parent.remove(this.camera);
    }
    if (this.cameraRig && this.cameraRig.parent) {
      this.cameraRig.parent.remove(this.cameraRig);
    }

    this.environment?.dispose();
    this.scene.remove(this.portalGroup);
    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach((m) => {
        m.map?.dispose?.();
        m.dispose?.();
      });
    });
  }
}
