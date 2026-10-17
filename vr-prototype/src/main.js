/**
 * main.js — Punto de entrada del prototipo VR
 * Orquesta: SceneManager, XRSession, XRControllerManager, DebugOverlay
 */
// Three.js r170+: usar Timer en lugar del deprecated Clock
import * as THREE from 'three';
import { Timer } from 'three';
import { SceneManager } from './scene/SceneManager.js';
import { XRSessionManager } from './vr/XRSession.js';
import { XRControllerManager } from './vr/XRController.js';
import { DebugOverlay } from './utils/debug.js';

// ─── Renderer principal ───────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true; // Activar modo WebXR
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

// ─── Módulos ──────────────────────────────────────────────────────────────────
const controllers = new XRControllerManager(renderer);
const sceneManager = new SceneManager(renderer, controllers);
const xrSession = new XRSessionManager(renderer, sceneManager);
const debug = new DebugOverlay();

// ─── Resize handler ───────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  sceneManager.camera.aspect = window.innerWidth / window.innerHeight;
  sceneManager.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Botón Enter VR ───────────────────────────────────────────────────────────
document.getElementById('btn-enter-vr').addEventListener('click', () => {
  xrSession.enterVR();
});

// ─── Game loop ────────────────────────────────────────────────────────────────
const timer = new Timer();

renderer.setAnimationLoop((timestamp, frame) => {
  timer.update(timestamp);
  const delta = timer.getDelta();

  // Leer estado de los Touch Controllers
  const controllerState = controllers.update();

  // Actualizar escena con input de controllers
  sceneManager.update(delta, controllerState, frame);

  // Actualizar debug overlay con telemetría de juego y pedales
  debug.update(controllerState, {
    pedalState: sceneManager.pedalController.state,
    effectiveRpm: sceneManager.raft.cadence,
    pearlsCount: sceneManager.pearlManager.collectedCount,
    targetPearls: sceneManager.pearlManager.getTotalCount(),
  });

  // Renderizar
  renderer.render(sceneManager.scene, sceneManager.camera);
});
