/**
 * SceneManager.js
 * Orquestador principal de la experiencia VR y mapa costero:
 * - Entorno costero inmersivo 360° (CoastEnvironment)
 * - Cinemática inicial en la playa con traslado suave a la balsa (CoastCinematicManager)
 * - Balsa con propulsión por pedales y físicas de oleaje (Raft)
 * - Sendero de perlas coleccionables que disparan acciones externas (PearlManager)
 * - Boya marina de llegada con baliza luminosa y fuegos artificiales (Buoy)
 * - Puente de integración con hardware / dispositivos externos (DeviceActionBridge)
 * - Audio espacial y procedural (SpatialAudioManager)
 * - Control háptico y telemetría para Meta Quest 3
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CoastEnvironment } from './CoastEnvironment.js';
import { Raft } from '../entities/Raft.js';
import { Buoy } from '../entities/Buoy.js';
import { PearlManager } from '../entities/PearlManager.js';
import { CoastCinematicManager } from '../cinematics/CoastCinematicManager.js';
import { DeviceActionBridge } from '../services/DeviceActionBridge.js';
import { SpatialAudioManager } from '../audio/SpatialAudioManager.js';
import { PedalController } from '../input/PedalController.js';

export class SceneManager {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {import('../vr/XRController.js').XRControllerManager} controllerManager
   */
  constructor(renderer, controllerManager) {
    this.renderer = renderer;
    this.controllerManager = controllerManager;

    // ─── 1. Escena y Cámara ───────────────────────────────────────────────────
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1200
    );
    this.camera.position.set(0, 1.6, 0);

    // Rig de cámara (representación del cuerpo físico del usuario en el mundo)
    this.cameraRig = new THREE.Group();
    this.cameraRig.add(this.camera);
    this.scene.add(this.cameraRig);

    // Añadir mandos Touch del Quest 3 al rig
    if (this.controllerManager) {
      this.controllerManager.getGrips().forEach(grip => this.cameraRig.add(grip));
    }

    // Controles de navegador (modo 360° / escritorio)
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.set(0, 1.4, -4);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.05; // No atravesar el suelo
    this.controls.minDistance = 0.2;
    this.controls.maxDistance = 150;

    // Teclas para modo escritorio (WASD / Flechas / Espacio)
    this.keys = { w: false, a: false, s: false, d: false, space: false };
    window.addEventListener('keydown', (e) => this._onKey(e, true));
    window.addEventListener('keyup', (e) => this._onKey(e, false));

    // ─── 2. Servicios Base ────────────────────────────────────────────────────
    this.audioManager = new SpatialAudioManager();
    this.deviceBridge = new DeviceActionBridge();
    this.pedalController = new PedalController();

    // ─── 3. Entorno Costero y Océano ──────────────────────────────────────────
    this.environment = new CoastEnvironment(this.scene);

    // ─── 4. Entidades del Juego ───────────────────────────────────────────────
    // Balsa en la orilla del mar
    this.raft = new Raft(this.scene, this.environment, this.cameraRig);

    // Boya marina de llegada a 145m mar adentro
    this.buoy = new Buoy(this.scene, this.environment, new THREE.Vector3(0, 0, -145));

    // Sendero de perlas en el mar
    this.pearlManager = new PearlManager(this.scene, this.environment, this.deviceBridge, this.audioManager);
    this.raft.setPearlsStatus(0, this.pearlManager.getTotalCount());

    // Cinemática de inicio en la costa y traslado hacia la balsa
    this.cinematicManager = new CoastCinematicManager(this.scene, this.cameraRig, this.raft, this.audioManager);

    // Métricas de sesión
    this.sessionStartTime = performance.now();
    this.totalTime = 0;
    this._cadenceSyncTimer = 0;

    // Inicializar audio al primer clic o interacción
    window.addEventListener('pointerdown', () => this.audioManager.init(), { once: true });
  }

  // ─── Gestión de Sesión WebXR ────────────────────────────────────────────────
  onSessionStart() {
    this.controls.enabled = false;
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
    this.audioManager.init();
  }

  onSessionEnd() {
    this.controls.enabled = true;
    this.camera.position.set(0, 1.6, 0);
    this.controls.target.set(0, 1.4, -4);
    this.controls.update();
  }

  _onKey(e, isDown) {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup')    this.keys.w = isDown;
    if (k === 's' || k === 'arrowdown')  this.keys.s = isDown;
    if (k === 'a' || k === 'arrowleft')  this.keys.a = isDown;
    if (k === 'd' || k === 'arrowright') this.keys.d = isDown;
    if (k === ' ' || k === 'spacebar')   this.keys.space = isDown;

    if (isDown) {
      this.audioManager.init();
    }
  }

  // ─── Bucle Principal de Actualización (Game Loop) ───────────────────────────
  /**
   * @param {number} delta
   * @param {object} cs - controllerState del XRControllerManager
   * @param {XRFrame} frame
   */
  update(delta, cs, frame) {
    this.totalTime += delta;
    const isPresenting = this.renderer.xr.isPresenting;

    // 1. Leer estado de los pedales físicos
    const pedalState = this.pedalController.update(delta);

    // Sonido de chapoteo rítmico al registrar pedaleo
    if (pedalState.strokeDetected) {
      this.audioManager.playPedalSplash(pedalState.power);
    }

    // 2. Determinar potencia efectiva de propulsión y giro:
    // Soporta: Pedales físicos > Mandos Quest 3 (gatillo/stick) > Teclado (W/Flecha/Espacio)
    let effectivePower = pedalState.power;
    let effectiveRpm   = pedalState.cadenceRpm;
    let steerInput     = 0;

    // Fallback con mandos Touch del Quest 3
    if (isPresenting) {
      const vrTrigger = Math.max(cs.triggerR ?? 0, cs.triggerL ?? 0);
      const vrStickY  = -(cs.move?.y ?? 0);
      const vrStickX  = cs.turn?.x ?? cs.move?.x ?? 0;

      if (vrTrigger > 0.05 || vrStickY > 0.05) {
        const vrPower = Math.max(vrTrigger, vrStickY > 0 ? vrStickY : 0);
        if (vrPower > effectivePower) {
          effectivePower = vrPower;
          effectiveRpm = vrPower * 70; // Simulación de RPM proporcional al gatillo
        }
      }
      steerInput = vrStickX;
    }

    // Fallback con teclado en modo navegador / escritorio
    if (!isPresenting) {
      this.controls.update();

      if (this.keys.w || this.keys.space) {
        effectivePower = Math.max(effectivePower, 0.85);
        effectiveRpm = Math.max(effectiveRpm, 65);
      }
      if (this.keys.a) steerInput -= 1.0;
      if (this.keys.d) steerInput += 1.0;
    }

    // 3. Cinemática de inicio en la costa
    const wantsStart = (
      effectivePower > 0.1 ||
      (cs.triggerR ?? 0) > 0.4 ||
      (cs.triggerL ?? 0) > 0.4 ||
      this.keys.space ||
      this.keys.w
    );
    this.cinematicManager.update(delta, wantsStart);

    // 4. Dirección hacia donde mira el usuario (para auto-timón natural)
    const headDir = new THREE.Vector3();
    this.camera.getWorldDirection(headDir);
    headDir.y = 0;
    headDir.normalize();

    // 5. Actualizar la balsa
    this.raft.update(delta, effectivePower, effectiveRpm, headDir, steerInput);

    // 6. Actualizar entorno costero (océano dinámico y shaders)
    this.environment.update(delta);

    // 7. Actualizar perlas coleccionables y colisiones
    const hapticCallback = (intensity, durationMs) => {
      if (this.controllerManager && this.controllerManager.triggerHaptic) {
        this.controllerManager.triggerHaptic(intensity, durationMs);
      }
    };
    const pearlStats = this.pearlManager.update(delta, this.raft.group.position, hapticCallback);

    if (pearlStats.newCollection) {
      this.raft.setPearlsStatus(pearlStats.total, pearlStats.target);
      this.raft.setStatusMessage(`✨ ¡Perla recogida! (${pearlStats.total}/${pearlStats.target})`);
    }

    // 8. Distancia a la Boya y detección de llegada
    const distToBuoy = this.raft.group.position.distanceTo(this.buoy.position);
    this.raft.setDistanceToBuoy(distToBuoy);

    const goalReached = this.buoy.update(delta, this.raft.group.position);
    if (goalReached) {
      this.audioManager.playVictoryFanfare();
      if (this.controllerManager && this.controllerManager.triggerHaptic) {
        this.controllerManager.triggerHaptic(1.0, 450);
      }
      this.raft.setStatusMessage('🏆 ¡DESTINO ALCANZADO! Travesía costera completada');
      this.deviceBridge.onGoalReached({
        totalTimeSec: Math.round(this.totalTime),
        totalPearls: this.pearlManager.collectedCount,
        distanceMeters: Math.round(145),
      });
    }

    // 9. Reportar periódicamente cadencia al dispositivo externo (cada 1s)
    this._cadenceSyncTimer += delta;
    if (this._cadenceSyncTimer >= 1.0) {
      this._cadenceSyncTimer = 0;
      if (effectivePower > 0.05) {
        this.deviceBridge.onCadenceUpdate({
          rpm: Math.round(effectiveRpm),
          speedKmh: Number((this.raft.velocity * 3.6).toFixed(1)),
        });
      }
    }
  }
}
