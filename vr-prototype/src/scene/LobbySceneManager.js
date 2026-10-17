/**
 * LobbySceneManager.js
 * Orquestador del nivel "Lobby Principal":
 * - Entorno 360° espacial zen y plataforma circular (LobbyEnvironment)
 * - Interfaz interactiva 3D con tarjetas holográficas de selección (LobbyUI)
 * - Cumple el Contrato de Nivel de ./levels/registry.js
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LobbyEnvironment } from './LobbyEnvironment.js';
import { LobbyUI } from './LobbyUI.js';
import { SpatialAudioManager } from '../audio/SpatialAudioManager.js';
import { PedalController } from '../input/PedalController.js';
import { DeviceActionBridge } from '../services/DeviceActionBridge.js';

export class LobbySceneManager {
  static meta = {
    id: 'lobby',
    title: 'Lobby Principal',
    hudTitle: '🏛️ LOBBY PRINCIPAL • QUEST 3',
    pageTitle: 'Lobby Principal VR — Meta Quest 3',
    modeHint: '🥽 <strong>Apunta y presiona el gatillo</strong> para elegir escenario | 🚴 <strong>Pedalea</strong> o pulsa <strong>[1]-[4]</strong>',
    statusText: '🏛️ Selecciona un nivel para comenzar tu sesión',
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
    this.camera.position.set(0, 1.55, 1.4);

    // Rig de cámara
    this.cameraRig = new THREE.Group();
    this.scene.add(this.cameraRig);
    this.scene.add(this.camera);

    if (this.controllerManager) {
      this.controllerManager.getGrips().forEach((grip) => this.cameraRig.add(grip));
    }

    // Controles de escritorio (OrbitControls)
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.set(0, 1.45, -2.6);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 6.0;

    // ─── 2. Servicios Base ────────────────────────────────────────────────────
    this.audioManager = new SpatialAudioManager({ ambience: 'lobby' });
    this.pedalController = new PedalController();
    this.deviceBridge = new DeviceActionBridge();

    // ─── 3. Entorno y UI del Lobby ────────────────────────────────────────────
    this.environment = new LobbyEnvironment(this.scene);
    this.ui = new LobbyUI(
      this.scene,
      this.camera,
      this.controllerManager,
      this.audioManager,
      (levelId) => {
        if (this.onSelectLevel) {
          this.onSelectLevel(levelId);
        }
      }
    );

    // Callback expuesto para que main.js escuche
    this.onSelectLevel = null;

    // Teclado para atajos directos
    this._setupKeys();

    // Inicializar audio al primer clic
    const onInitAudio = () => this.audioManager.init();
    window.addEventListener('pointerdown', onInitAudio, { once: true });
    this._disposers.push(() => window.removeEventListener('pointerdown', onInitAudio));
  }

  _setupKeys() {
    const onKey = (e) => {
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
      if (e.key === '1') this.onSelectLevel?.('coast');
      if (e.key === '2') this.onSelectLevel?.('llano');
      if (e.key === '3') this.onSelectLevel?.('cyber');
      if (e.key === '4') this.onSelectLevel?.('downhill');
    };
    window.addEventListener('keydown', onKey);
    this._disposers.push(() => window.removeEventListener('keydown', onKey));
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
    this.camera.position.set(0, 1.55, 1.4);
    this.controls.target.set(0, 1.45, -2.6);
    this.controls.enabled = true;
    this.controls.update();
  }

  update(delta, controllerState, frame) {
    const isPresenting = this.renderer.xr.isPresenting;

    // 1. Leer estado de pedales
    const pedalState = this.pedalController.update(delta);

    // 2. Si pedalea con fuerza y está sobre una tarjeta, seleccionarla
    if (pedalState.strokeDetected && pedalState.cadenceRpm > 45 && this.ui.hoveredCard) {
      this.ui._triggerSelection(this.ui.hoveredCard.userData.levelId);
    }

    // 3. Actualizar entorno visual
    this.environment.update(delta);

    // 4. Actualizar UI interactiva y raycast
    this.ui.update(delta, controllerState);

    // 5. Controles de escritorio
    if (!isPresenting && this.controls.enabled) {
      this.controls.update();
    }
  }

  getTelemetry() {
    return {
      pedalState: this.pedalController.state,
      effectiveRpm: this.pedalController.state?.cadenceRpm ?? 0,
      pearlsCount: 0,
      targetPearls: 0,
    };
  }

  dispose() {
    this._disposers.forEach((fn) => fn());
    this._disposers.length = 0;
    this.controls?.dispose();

    // Desacoplar objetos persistentes (cámara, rig, mandos)
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
    this.ui?.dispose();
  }
}
