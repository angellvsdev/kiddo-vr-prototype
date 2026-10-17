/**
 * main.js — Punto de entrada del prototipo VR
 * Orquesta: nivel activo (Lobby, Costa, Llano, Camino Estelar), modos de juego (Descenso en bici),
 * XRSession, XRControllerManager, VRFadeOverlay y DebugOverlay.
 */
// Three.js r170+: usar Timer en lugar del deprecated Clock
import * as THREE from 'three';
import { Timer } from 'three';
import { resolveLevelId, loadLevel, LEVELS } from './levels/registry.js';
import { XRSessionManager } from './vr/XRSession.js';
import { XRControllerManager } from './vr/XRController.js';
import { DebugOverlay } from './utils/debug.js';
import { ModeManager } from './modes/ModeManager.js';
import { createDownhillMode } from './modes/downhill/index.js';
import { VRFadeOverlay } from './scene/VRFadeOverlay.js';

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

// ─── Módulos Principales ──────────────────────────────────────────────────────
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

  // Sincronizar botones de la barra de navegación superior
  document.querySelectorAll('[data-level]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.level === meta.id);
  });
}

async function boot() {
  let levelId = resolveLevelId();
  let Level = await loadLevel(levelId);
  let sceneManager = new Level(renderer, controllers);
  const xrSession = new XRSessionManager(renderer, sceneManager);

  // Overlay de fundido a negro (VR-Safe Fade) para evitar cinetosis en Quest 3
  const fadeOverlay = new VRFadeOverlay(sceneManager.camera);
  fadeOverlay.fadeIn(0.4);

  // ─── Modos de juego ─────────────────────────────────────────────────────────
  const levelMode = {
    get scene() {
      return sceneManager.scene;
    },
    enter() {
      if (!renderer.xr.isPresenting) {
        // En escritorio, devolver la cámara a la escena activa y reactivar OrbitControls
        sceneManager.scene.add(sceneManager.camera);
        if (sceneManager.controls) {
          sceneManager.controls.enabled = true;
          sceneManager.controls.update();
        }
      } else {
        sceneManager.cameraRig.add(sceneManager.camera);
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
    .register('level', levelMode)
    .register('downhill', downhillMode);

  applyLevelMeta(Level.meta);

  // Sincronizar referencias del modo downhill con el nivel activo
  function syncDownhillServices(sm) {
    if (!downhillMode || !sm) return;
    downhillMode.camera = sm.camera;
    downhillMode.rig = sm.cameraRig;
    downhillMode.pedal = sm.pedalController;
    downhillMode.audio = sm.audioManager;
    downhillMode.bridge = sm.deviceBridge;
    if (downhillMode.rig) {
      downhillMode.rig.add(downhillMode.bike.group, downhillMode.hud.mesh);
    }
  }

  // Al finalizar la carrera de descenso, regresar automáticamente al Lobby
  downhillMode.onFinish = () => {
    console.log('[Downhill] Carrera finalizada. Regresando al Lobby principal...');
    switchLevel('lobby');
  };

  // ─── Conmutador Suave de Niveles (VR-Safe Scene Switcher) ───────────────────
  let isSwitching = false;
  async function switchLevel(targetLevelId) {
    if (isSwitching || !LEVELS[targetLevelId]) return;
    isSwitching = true;

    console.log(`[LevelRouter] Conmutando a nivel: ${targetLevelId}...`);

    // 1. Fade out a negro
    await fadeOverlay.fadeOut(0.4);

    // 2. Si estábamos en downhill, volver al modo normal
    if (modes.activeId === 'downhill') {
      modes.switchTo('level');
    }

    // 3. Desmontar y liberar recursos del nivel anterior (desacoplando el overlay para no destruir su malla)
    fadeOverlay.detach();
    if (sceneManager) {
      sceneManager.dispose?.();
    }

    // 4. Cargar e instanciar nuevo nivel
    levelId = targetLevelId;
    Level = await loadLevel(levelId);
    sceneManager = new Level(renderer, controllers);

    // Reanclar fade overlay a la nueva cámara
    fadeOverlay.attachToCamera(sceneManager.camera);

    // Si el nivel llega a su meta final, avanzar al siguiente nivel o volver al Lobby
    sceneManager.onLevelComplete = (completedId, nextLevelId) => {
      console.log(`[GameFlow] Meta alcanzada en ${completedId}. Siguiente nivel: ${nextLevelId || 'lobby'}...`);
      if (nextLevelId === 'downhill') {
        setMode('downhill');
      } else if (nextLevelId && LEVELS[nextLevelId]) {
        switchLevel(nextLevelId);
      } else {
        switchLevel('lobby');
      }
    };

    // Si es el Lobby, conectar la selección de niveles interactiva
    if (levelId === 'lobby') {
      sceneManager.onSelectLevel = (selectedId) => {
        if (selectedId === 'downhill') {
          setMode('downhill');
        } else {
          switchLevel(selectedId);
        }
      };
    }

    // Actualizar referencia en XRSessionManager
    xrSession.sceneManager = sceneManager;

    // Si la sesión inmersiva WebXR ya está activa, inicializar el nuevo nivel en VR
    if (renderer.xr.isPresenting) {
      sceneManager.onSessionStart?.();
    }

    // Sincronizar cameraRig en el ModeManager
    modes.rig = sceneManager.cameraRig;
    syncDownhillServices(sceneManager);

    // Actualizar metadata del HUD y URL en el navegador
    applyLevelMeta(Level.meta);
    window.history.replaceState({}, '', '?level=' + levelId);

    // 5. Fade in suave
    await fadeOverlay.fadeIn(0.5);
    isSwitching = false;
  }

  // Vincular eventos iniciales del nivel de arranque
  sceneManager.onLevelComplete = (completedId, nextLevelId) => {
    console.log(`[GameFlow] Meta alcanzada en ${completedId}. Siguiente nivel: ${nextLevelId || 'lobby'}...`);
    if (nextLevelId === 'downhill') {
      setMode('downhill');
    } else if (nextLevelId && LEVELS[nextLevelId]) {
      switchLevel(nextLevelId);
    } else {
      switchLevel('lobby');
    }
  };

  if (levelId === 'lobby') {
    sceneManager.onSelectLevel = (selectedId) => {
      if (selectedId === 'downhill') {
        setMode('downhill');
      } else {
        switchLevel(selectedId);
      }
    };
  }

  // ─── Gestión del Modo Descenso vs Nivel Normal ─────────────────────────────
  function setMode(id) {
    if (id === 'downhill') {
      syncDownhillServices(sceneManager);
    }
    if (!modes.switchTo(id)) return;

    document.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === id);
    });

    const hintEl = document.getElementById('mode-hint');
    const brandEl = document.getElementById('brand-title');
    const statusEl = document.getElementById('status-bar');

    if (id === 'downhill') {
      if (hintEl) hintEl.innerHTML = '🚵 <strong>Espacio/W</strong> o gatillo para salir | <strong>A/D</strong> giro | <strong>S</strong> frenos | <strong>R</strong> reiniciar';
      if (brandEl) brandEl.innerHTML = '🚵 DESCENSO EN BICI • QUEST 3';
      if (statusEl) statusEl.innerHTML = '🚵 Pista de descenso activa — Pulsa el botón para entrar a VR inmersivo';
    } else {
      applyLevelMeta(Level.meta);
    }
  }

  // Eventos de botones HTML (barra de modos / niveles)
  document.querySelectorAll('[data-level]').forEach((btn) => {
    btn.addEventListener('click', () => switchLevel(btn.dataset.level));
  });

  document.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  // Atajos de teclado rápidos
  window.addEventListener('keydown', (e) => {
    if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;

    // Tecla 0 o Escape: Volver siempre al Lobby principal
    if (e.key === '0' || e.key === 'Escape') {
      switchLevel('lobby');
      return;
    }

    if (e.key === '1') switchLevel('coast');
    if (e.key === '2') switchLevel('llano');
    if (e.key === '3') switchLevel('cyber');
    if (e.key === '4') setMode('downhill');
  });

  // Si se solicita ?mode=downhill por URL
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mode') === 'downhill') {
    setMode('downhill');
  }

  // Restaurar pose de cámara en modo escritorio al salir de WebXR si se está en downhill
  renderer.xr.addEventListener('sessionend', () => {
    if (modes.activeId === 'downhill') {
      sceneManager.camera.position.set(0, 1.35, 0);
      sceneManager.camera.rotation.set(-0.2, 0, 0);
    }
  });

  // Gancho de depuración para consola de desarrollo
  if (import.meta.env.DEV) {
    window.__kiddo = { renderer, sceneManager, modes, downhillMode, switchLevel, THREE };
  }

  // ─── Resize handler ─────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    if (sceneManager?.camera) {
      sceneManager.camera.aspect = window.innerWidth / window.innerHeight;
      sceneManager.camera.updateProjectionMatrix();
    }
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

    // Actualizar fundido VR (Fade in/out)
    fadeOverlay.update(delta);

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
      : (sceneManager.getTelemetry ? sceneManager.getTelemetry() : {});

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
