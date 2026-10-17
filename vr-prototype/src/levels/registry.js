/**
 * registry.js
 * Registro de niveles de Kiddo VR. Punto de entrada para el futuro lobby de selección:
 * el lobby solo necesita listar LEVELS, llamar a loadLevel(id) y, al volver, a level.dispose().
 *
 * CONTRATO DE NIVEL (lo que debe exponer la clase de cada nivel):
 *   static meta   → { id, title, hudTitle, pageTitle, modeHint, statusText }
 *   constructor(renderer, controllerManager)
 *   scene, camera → lo que main.js renderiza cada frame
 *   update(delta, controllerState, frame)
 *   onSessionStart() / onSessionEnd()   → entrada y salida de WebXR
 *   getTelemetry() → { pedalState, effectiveRpm, pearlsCount?, targetPearls? } para el panel de depuración
 *   dispose()      → (opcional) libera listeners y recursos al salir del nivel
 *
 * Mientras no exista el lobby, el nivel se elige con el parámetro de URL ?level=<id>.
 */
export const LEVELS = {
  lobby: {
    id: 'lobby',
    title: 'Lobby Principal',
    load: () => import('../scene/LobbySceneManager.js').then((m) => m.LobbySceneManager),
  },
  coast: {
    id: 'coast',
    title: 'Travesía Costera',
    load: () => import('../scene/SceneManager.js').then((m) => m.SceneManager),
  },
  llano: {
    id: 'llano',
    title: 'Atardecer Llanero',
    load: () => import('../scene/LlanoSceneManager.js').then((m) => m.LlanoSceneManager),
  },
  cyber: {
    id: 'cyber',
    title: 'Cyber-Arena Cósmica',
    load: () => import('../scene/CyberSceneManager.js').then((m) => m.CyberSceneManager),
  },
};

export const DEFAULT_LEVEL_ID = 'lobby';

/** Lee el nivel pedido en la URL (?level=llano); cae al nivel por defecto si no existe */
export function resolveLevelId(search = window.location.search) {
  const id = new URLSearchParams(search).get('level');
  return id && LEVELS[id] ? id : DEFAULT_LEVEL_ID;
}

/** Carga la clase del nivel indicado */
export function loadLevel(id) {
  return LEVELS[id].load();
}
