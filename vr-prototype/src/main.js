/**
 * main.js — Punto de entrada del prototipo VR
 * Orquesta: nivel activo (levels/registry.js), modos de juego (ModeManager / Descenso en bici),
 * XRSession, XRControllerManager y DebugOverlay.
 */
// Three.js r170+: usar Timer en lugar del deprecated Clock
import * as THREE from 'three';
import { Timer } from 'three';
import { resolveLevelId, loadLevel } from './levels/registry.js';
import { XRSessionManager } from './vr/XRSession.js';
import { XRControllerManager } from './vr/XRController.js';
import { DebugOverlay } from './utils/debug.js';
import { ModeManager } from './modes/ModeManager.js';
import { createDownhillMode } from './modes/downhill/index.js';

// ─── Renderer principal ───────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true; // Activar modo WebXR
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
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

  // ─── Modos de juego ─────────────────────────────────────────────────────────
  // Adaptador del nivel activo a la interfaz de modo (sin tocar SceneManager / LlanoSceneManager)
  const levelMode = {
    scene: sceneManager.scene,
    enter() {
      if (sceneManager.controls) {
        sceneManager.controls.enabled = !renderer.xr.isPresenting;
      }
    },
    exit() {
      if (sceneManager.controls) {
        sceneManager.controls.enabled = false;
      }
    },
    update(delta, { controls, frame }) {
      sceneManager.update(delta, controls, frame);
    },
  };

  const downhillMode = createDownhillMode({
    renderer,
    camera: sceneManager.camera,
    rig: sceneManager.cameraRig,
    pedal: sceneManager.pedalController,
    audio: sceneManager.audioManager,
    bridge: sceneManager.deviceBridge,
  });

  const modes = new ModeManager(sceneManager.cameraRig)
    .register('sea', levelMode)
    .register('downhill', downhillMode);

  // Pistas de control según el modo
  const modeHints = {
    sea: Level.meta?.modeHint ?? '🚴 <strong>Pedalea</strong> o pulsa <strong>Espacio/W</strong> para navegar | <strong>A/D</strong> para timonear',
    downhill: '🚵 <strong>Espacio/W</strong> o gatillo para salir | <strong>A/D</strong> giro | <strong>S</strong> frenos | <strong>R</strong> reiniciar',
  };

  // Ajustar etiqueta del botón del nivel en el selector HTML si existe
  const levelBtn = document.querySelector('[data-mode="sea"]');
  if (levelBtn && Level.meta) {
    const cleanTitle = Level.meta.title ?? 'Nivel Principal';
    levelBtn.innerHTML = `${cleanTitle} <kbd>1</kbd>`;
  }

  function setMode(id) {
    if (!modes.switchTo(id)) return;
    document.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === id);
    });

    const hintEl = document.getElementById('mode-hint');
    if (hintEl && modeHints[id]) {
      hintEl.innerHTML = modeHints[id];
    }

    const brandEl = document.getElementById('brand-title');
    if (brandEl) {
      if (id === 'downhill') {
        brandEl.innerHTML = '🚵 DESCENSO EN BICI • QUEST 3';
      } else if (Level.meta?.hudTitle) {
        brandEl.innerHTML = Level.meta.hudTitle;
      }
    }

    const statusEl = document.getElementById('status-bar');
    if (statusEl) {
      if (id === 'downhill') {
        statusEl.innerHTML = '🚵 Pista de descenso activa — Pulsa el botón para entrar a VR inmersivo';
      } else if (Level.meta?.statusText) {
        statusEl.innerHTML = Level.meta.statusText;
      }
    }
  }

  // Selector de modo (solo desde la página, antes de entrar a VR)
  document.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  window.addEventListener('keydown', (e) => {
    if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
    if (e.code === 'Digit1') setMode('sea');
    if (e.code === 'Digit2') setMode('downhill');
  });

  // Si se solicita ?mode=downhill o ?level=downhill por URL, iniciar en modo descenso
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mode') === 'downhill' || urlParams.get('level') === 'downhill') {
    setMode('downhill');
  }

  // Restaurar pose de cámara en modo escritorio al salir de WebXR si se está en downhill
  renderer.xr.addEventListener('sessionend', () => {
    if (modes.activeId === 'downhill') {
      sceneManager.camera.position.set(0, 1.35, 0);
      sceneManager.camera.rotation.set(-0.2, 0, 0);
    }
  });

  // Gancho de depuración solo en desarrollo (no se incluye en el build de producción)
  if (import.meta.env.DEV) {
    window.__kiddo = { renderer, sceneManager, modes, downhillMode, THREE, levelId };
  }

  // ─── Resize handler ─────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    sceneManager.camera.aspect = window.innerWidth / window.innerHeight;
    sceneManager.camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ─── Botón Enter VR ─────────────────────────────────────────────────────────
  document.getElementById('btn-enter-vr')?.addEventListener('click', () => {
    xrSession.enterVR();
  });

  // ─── Game loop ──────────────────────────────────────────────────────────────
  const timer = new Timer();

  renderer.setAnimationLoop((timestamp, frame) => {
    timer.update(timestamp);
    const delta = timer.getDelta();

    // Leer estado de los Touch Controllers
    const controllerState = controllers.update();

    // Actualizar el modo activo (el nivel actual o el modo descenso)
    modes.update(delta, { controls: controllerState, frame });

    // Actualizar debug overlay con telemetría unificada
    const telemetry = modes.activeId === 'downhill'
      ? {
          pedalState: sceneManager.pedalController?.state,
          effectiveRpm: Math.round(downhillMode.v * 3.6),
          pearlsCount: downhillMode.coinsTaken,
          targetPearls: downhillMode.track?.coins?.length ?? 0,
        }
      : sceneManager.getTelemetry();

    debug.update(controllerState, telemetry);

    // Renderizar la escena del modo activo con la cámara compartida
    renderer.render(modes.scene, sceneManager.camera);
  });
}

boot().catch((err) => {
  console.error('[Kiddo VR] No se pudo iniciar el nivel:', err);
  const status = document.getElementById('status-bar');
  if (status) status.textContent = `Error al cargar el nivel: ${err.message}`;
});
