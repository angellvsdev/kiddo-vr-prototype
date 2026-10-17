/**
 * main.js — Punto de entrada del prototipo VR
 * Orquesta: nivel activo (levels/registry.js), XRSession, XRControllerManager, DebugOverlay
 */
// Three.js r170+: usar Timer en lugar del deprecated Clock
import * as THREE from 'three';
import { Timer } from 'three';
import { resolveLevelId, loadLevel } from './levels/registry.js';
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
const debug = new DebugOverlay();

/** Actualiza el HUD HTML con los textos del nivel activo */
function applyLevelMeta(meta) {
  if (!meta) return;
  document.title = meta.pageTitle ?? document.title;
  const set = (id, html) => {
    const el = document.getElementById(id);
    if (el && html) el.innerHTML = html;
  };
  set('brand-title', meta.hudTitle);
  set('mode-hint', meta.modeHint);
  set('status-bar', meta.statusText);
}

async function boot() {
  // Nivel elegido por ?level=<id> (hasta que exista el lobby). Ver levels/registry.js
  const levelId = resolveLevelId();
  const Level = await loadLevel(levelId);
  const sceneManager = new Level(renderer, controllers);
  const xrSession = new XRSessionManager(renderer, sceneManager);
  applyLevelMeta(Level.meta);

  // Gancho de depuración solo en desarrollo (no se incluye en el build de producción)
  if (import.meta.env.DEV) {
    window.__kiddo = { renderer, sceneManager, THREE, levelId };
  }

  // ─── Resize handler ─────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    sceneManager.camera.aspect = window.innerWidth / window.innerHeight;
    sceneManager.camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ─── Botón Enter VR ─────────────────────────────────────────────────────────
  document.getElementById('btn-enter-vr').addEventListener('click', () => {
    xrSession.enterVR();
  });

  // ─── Game loop ──────────────────────────────────────────────────────────────
  const timer = new Timer();

  renderer.setAnimationLoop((timestamp, frame) => {
    timer.update(timestamp);
    const delta = timer.getDelta();

    // Leer estado de los Touch Controllers
    const controllerState = controllers.update();

    // Actualizar escena con input de controllers
    sceneManager.update(delta, controllerState, frame);

    // Actualizar debug overlay con telemetría de juego y pedales
    debug.update(controllerState, sceneManager.getTelemetry());

    // Renderizar
    renderer.render(sceneManager.scene, sceneManager.camera);
  });
}

boot().catch((err) => {
  console.error('[Kiddo VR] No se pudo iniciar el nivel:', err);
  const status = document.getElementById('status-bar');
  if (status) status.textContent = `Error al cargar el nivel: ${err.message}`;
});
