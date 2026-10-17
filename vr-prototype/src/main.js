/**
 * main.js — EJEMPLO de integración del modo descenso.
 * Basado en el main.js original. Las líneas marcadas con [DESCENSO] son las únicas
 * que cambian respecto al original. Ver INTEGRACION.md.
 */
// Three.js r170+: usar Timer en lugar del deprecated Clock
import * as THREE from 'three';
import { Timer } from 'three';
import { SceneManager } from './scene/SceneManager.js';
import { XRSessionManager } from './vr/XRSession.js';
import { XRControllerManager } from './vr/XRController.js';
import { DebugOverlay } from './utils/debug.js';
import { ModeManager } from './modes/ModeManager.js';                  // [DESCENSO]
import { createDownhillMode } from './modes/downhill/index.js';        // [DESCENSO]

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

// ─── [DESCENSO] Modos de juego ────────────────────────────────────────────────
// Adaptador de la travesía costera a la interfaz de modo (sin tocar SceneManager)
const seaMode = {
  scene: sceneManager.scene,
  enter() {
    sceneManager.controls.enabled = !renderer.xr.isPresenting;
  },
  exit() {
    sceneManager.controls.enabled = false;
  },
  update(delta, { controls, frame }) {
    sceneManager.update(delta, controls, frame);
  },
};

const modes = new ModeManager(sceneManager.cameraRig)
  .register('sea', seaMode)
  .register('downhill', createDownhillMode({
    renderer,
    camera: sceneManager.camera,
    rig: sceneManager.cameraRig,
    pedal: sceneManager.pedalController,
    audio: sceneManager.audioManager,
    bridge: sceneManager.deviceBridge,
  }));

const MODE_HINTS = {
  sea: '🚴 <strong>Pedalea</strong> o pulsa <strong>Espacio/W</strong> para navegar | <strong>A/D</strong> para timonear',
  downhill: '🚵 <strong>Espacio/W</strong> o gatillo para salir | <strong>A/D</strong> giro | <strong>S</strong> frenos | <strong>R</strong> reiniciar',
};

function setMode(id) {
  if (!modes.switchTo(id)) return;
  document.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === id);
  });
  document.getElementById('mode-hint').innerHTML = MODE_HINTS[id];
}

// Selector de modo (solo desde la página, antes de entrar a VR)
document.querySelectorAll('[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => setMode(btn.dataset.mode));
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Digit1') setMode('sea');
  if (e.code === 'Digit2') setMode('downhill');
});
// [FIN DESCENSO]

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

  // [DESCENSO] Antes: sceneManager.update(delta, controllerState, frame);
  // Actualizar el modo activo (la travesía o el descenso)
  modes.update(delta, { controls: controllerState, frame });

  // Actualizar debug overlay con telemetría de juego y pedales
  debug.update(controllerState, {
    pedalState: sceneManager.pedalController.state,
    effectiveRpm: sceneManager.raft.cadence,
    pearlsCount: sceneManager.pearlManager.collectedCount,
    targetPearls: sceneManager.pearlManager.getTotalCount(),
  });

  // [DESCENSO] Antes: renderer.render(sceneManager.scene, sceneManager.camera);
  renderer.render(modes.scene, sceneManager.camera);
});
