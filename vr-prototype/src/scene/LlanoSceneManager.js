/**
 * LlanoSceneManager.js
 * Orquestador del nivel "Atardecer Llanero" (equivale a SceneManager del nivel costero):
 * - Entorno del llano venezolano en 360° (LlanoEnvironment)
 * - Cinemática de apertura: el jinete a pie monta su caballo (LlanoCinematicManager)
 * - Caballo que avanza poco a poco con los pedales (Horse)
 * - Orbes del Atardecer coleccionables que suman puntos (LlanoOrbManager)
 * - Portón del hato como meta (HatoGate) y puente a dispositivos externos (DeviceActionBridge)
 * - Audio procedural de ambiente llanero y tablero holográfico (RiderDashboard)
 *
 * Cumple el contrato de nivel de ./levels/registry.js, por lo que puede cargarse desde un lobby.
 */
import * as THREE from 'three';
import { LlanoEnvironment, LLANO_ROUTE_LENGTH } from './LlanoEnvironment.js';
import { Horse } from '../entities/Horse.js';
import { HatoGate } from '../entities/HatoGate.js';
import { LlanoOrbManager, POINTS_PER_ORB } from '../entities/LlanoOrbManager.js';
import { RiderDashboard } from '../entities/RiderDashboard.js';
import { LlanoCinematicManager } from '../cinematics/LlanoCinematicManager.js';
import { DeviceActionBridge } from '../services/DeviceActionBridge.js';
import { SpatialAudioManager } from '../audio/SpatialAudioManager.js';
import { PedalController } from '../input/PedalController.js';

/** Altura de ojos en modo pantalla (m); en VR la da el casco (local-floor) */
const DESKTOP_EYE_HEIGHT = 1.1;

export class LlanoSceneManager {
  static meta = {
    id: 'llano',
    title: 'Atardecer Llanero',
    hudTitle: '🌅 ATARDECER LLANERO • QUEST 3',
    pageTitle: 'Atardecer Llanero VR — Meta Quest 3',
    modeHint: '🚴 <strong>Pedalea</strong> o pulsa <strong>Espacio/W</strong> para avanzar | <strong>A/D</strong> para girar | <strong>Arrastra</strong> para mirar en 360°',
    statusText: '🌅 Llano venezolano activo — Pulsa el botón para entrar a VR inmersivo',
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
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, DESKTOP_EYE_HEIGHT, 0);

    // Rig de cámara: representa el cuerpo del jinete en el mundo
    this.cameraRig = new THREE.Group();
    this.cameraRig.add(this.camera);
    this.scene.add(this.cameraRig);
    this.controllerManager?.getGrips().forEach((grip) => this.cameraRig.add(grip));

    this._setupDesktopLook();
    this._setupKeys();

    // ─── 2. Servicios base ────────────────────────────────────────────────────
    this.audioManager = new SpatialAudioManager({ ambience: 'llano' });
    this.deviceBridge = new DeviceActionBridge();
    this.pedalController = new PedalController();
    this._listen(window, 'pointerdown', () => this.audioManager.init(), { once: true });

    // ─── 3. Entorno y entidades ───────────────────────────────────────────────
    this.environment = new LlanoEnvironment(this.scene);
    this.horse = new Horse(this.scene, this.environment, new THREE.Vector3(0, 0, 0));
    this.horse.onStep = (strength) => this.audioManager.playHoofBeat(strength);
    this.dashboard = new RiderDashboard(this.horse.group, LLANO_ROUTE_LENGTH);

    this.orbManager = new LlanoOrbManager(this.scene, this.environment, this.deviceBridge, this.audioManager);
    this.dashboard.set({ orbsTotal: this.orbManager.getTotalCount() });

    const gateZ = -LLANO_ROUTE_LENGTH;
    this.gate = new HatoGate(
      this.scene,
      this.environment,
      new THREE.Vector3(this.environment.getTrailCenterX(gateZ), 0, gateZ)
    );

    this.cinematicManager = new LlanoCinematicManager(this.scene, this.cameraRig, this.horse, this.audioManager);

    // ─── 4. Métricas de sesión ────────────────────────────────────────────────
    this.totalTime = 0;
    this._cadenceSyncTimer = 0;
    this._effectiveRpm = 0;
    this._goalDone = false;
    this._saddleVec = new THREE.Vector3();
  }

  // ─── Entrada de escritorio ──────────────────────────────────────────────────
  /** Mirada 360° con el ratón/dedo: arrastrar rota la cabeza sobre su eje (no orbita). */
  _setupDesktopLook() {
    this.look = { yaw: 0, pitch: 0, dragging: false, lastX: 0, lastY: 0 };
    const el = this.renderer.domElement;

    this._listen(el, 'pointerdown', (e) => {
      this.look.dragging = true;
      this.look.lastX = e.clientX;
      this.look.lastY = e.clientY;
      el.setPointerCapture?.(e.pointerId);
    });
    this._listen(el, 'pointermove', (e) => {
      if (!this.look.dragging) return;
      const k = 0.0045;
      this.look.yaw += (e.clientX - this.look.lastX) * k;
      this.look.pitch = THREE.MathUtils.clamp(this.look.pitch + (e.clientY - this.look.lastY) * k, -1.5, 1.5);
      this.look.lastX = e.clientX;
      this.look.lastY = e.clientY;
    });
    const end = (e) => {
      this.look.dragging = false;
      el.releasePointerCapture?.(e.pointerId);
    };
    this._listen(el, 'pointerup', end);
    this._listen(el, 'pointercancel', end);
  }

  _setupKeys() {
    this.keys = { w: false, a: false, s: false, d: false, space: false };
    const onKey = (isDown) => (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') this.keys.w = isDown;
      if (k === 's' || k === 'arrowdown') this.keys.s = isDown;
      if (k === 'a' || k === 'arrowleft') this.keys.a = isDown;
      if (k === 'd' || k === 'arrowright') this.keys.d = isDown;
      if (k === ' ' || k === 'spacebar') this.keys.space = isDown;
      if (isDown) this.audioManager.init();
    };
    this._listen(window, 'keydown', onKey(true));
    this._listen(window, 'keyup', onKey(false));
  }

  _listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this._disposers.push(() => target.removeEventListener(type, handler, options));
  }

  // ─── Gestión de sesión WebXR ────────────────────────────────────────────────
  onSessionStart() {
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
    this.audioManager.init();
  }

  onSessionEnd() {
    this.camera.position.set(0, DESKTOP_EYE_HEIGHT, 0);
  }

  // ─── Bucle principal ────────────────────────────────────────────────────────
  /**
   * @param {number} delta
   * @param {object} cs - controllerState del XRControllerManager
   * @param {XRFrame} frame
   */
  update(delta, cs, frame) {
    this.totalTime += delta;
    const isPresenting = this.renderer.xr.isPresenting;

    // 1. Pedales físicos
    const pedalState = this.pedalController.update(delta);
    let power = pedalState.power;
    let rpm = pedalState.cadenceRpm;
    let steer = 0;

    // 2. Fallbacks: mandos Touch en VR / teclado y ratón en pantalla
    if (isPresenting) {
      const trigger = Math.max(cs.triggerR ?? 0, cs.triggerL ?? 0);
      const stickY = -(cs.move?.y ?? 0);
      const vrPower = Math.max(trigger, stickY > 0 ? stickY : 0);
      if (vrPower > 0.05 && vrPower > power) {
        power = vrPower;
        rpm = vrPower * 70;
      }
      steer = cs.turn?.x ?? cs.move?.x ?? 0;
    } else {
      if (this.keys.w || this.keys.space) {
        power = Math.max(power, 0.85);
        rpm = Math.max(rpm, 65);
      }
      if (this.keys.a) steer -= 1;
      if (this.keys.d) steer += 1;
      this.camera.rotation.set(this.look.pitch, this.look.yaw, 0); // arrastrar = mover el panorama
    }
    this._effectiveRpm = rpm;

    // 3. Cinemática de apertura
    const wantsStart = power > 0.1 || (cs.triggerR ?? 0) > 0.4 || (cs.triggerL ?? 0) > 0.4 || this.keys.space || this.keys.w;
    this.cinematicManager.update(delta, wantsStart);

    // 4. Caballo (solo responde a los pedales una vez montado)
    this.horse.update(delta, { rpm, steer });
    this.environment.update(delta);
    this.environment.follow(this.horse.group.position);

    // 5. El rig sigue la silla mientras se cabalga
    if (this.cinematicManager.isRiding()) {
      this.horse.getSaddlePosition(this.cameraRig.position);
      this.cameraRig.rotation.y = this.horse.group.rotation.y;
    }

    // 6. Orbes coleccionables (se miden contra la silla, a la altura de los ojos del jinete)
    const saddle = this.horse.getSaddlePosition(this._saddleVec);
    const orbStats = this.orbManager.update(delta, saddle, (i, ms) => this.controllerManager?.triggerHaptic?.(i, ms));
    if (orbStats.newCollection) {
      this.dashboard.set({ message: `✨ ¡Orbe recogido! +${POINTS_PER_ORB} puntos` });
    }

    // 7. Meta y dashboard
    const distToGate = this.horse.group.position.distanceTo(this.gate.position);
    this.dashboard.set({
      rpm,
      kmh: this.horse.velocity * 3.6,
      orbs: orbStats.total,
      score: orbStats.score,
      distance: distToGate,
    });
    this.dashboard.update(delta);

    if (this.gate.update(delta, this.horse.group.position)) {
      this._onGoalReached();
    }

    // 8. Reporte periódico de cadencia al dispositivo externo (cada 1 s)
    this._cadenceSyncTimer += delta;
    if (this._cadenceSyncTimer >= 1.0) {
      this._cadenceSyncTimer = 0;
      if (power > 0.05 && !this._goalDone) {
        this.deviceBridge.onCadenceUpdate({
          rpm: Math.round(rpm),
          speedKmh: Number((this.horse.velocity * 3.6).toFixed(1)),
        });
      }
    }
  }

  _onGoalReached() {
    this._goalDone = true;
    this.horse.isHalted = true;
    this.audioManager.playVictoryFanfare();
    this.controllerManager?.triggerHaptic?.(1.0, 450);
    this.dashboard.set({ message: `🏆 ¡LLEGASTE AL HATO! ${this.orbManager.score} puntos` });
    this.deviceBridge.onGoalReached({
      totalTimeSec: Math.round(this.totalTime),
      totalPearls: this.orbManager.collectedCount,
      distanceMeters: LLANO_ROUTE_LENGTH,
    });
  }

  // ─── Telemetría para el panel de depuración ─────────────────────────────────
  getTelemetry() {
    return {
      pedalState: this.pedalController.state,
      effectiveRpm: this._effectiveRpm,
      pearlsCount: this.orbManager.collectedCount,
      targetPearls: this.orbManager.getTotalCount(),
    };
  }

  // ─── Liberación de recursos (para volver al lobby) ──────────────────────────
  dispose() {
    this._disposers.forEach((fn) => fn());
    this._disposers.length = 0;
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
