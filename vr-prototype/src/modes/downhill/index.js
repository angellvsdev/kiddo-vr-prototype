/**
 * index.js — API pública del modo descenso.
 * El programa anfitrión solo debe importar desde este archivo.
 *
 *   import { createDownhillMode } from './modes/downhill/index.js';
 *   const mode = createDownhillMode({ renderer, camera, rig, pedal, audio, bridge });
 */
import { DownhillMode } from './DownhillMode.js';

export { DOWNHILL_CONFIG } from './downhillConfig.js';

/**
 * @param {object} shared - ver la cabecera de DownhillMode.js
 * @param {object} [cfg]  - parámetros opcionales (sobrescriben DOWNHILL_CONFIG)
 */
export function createDownhillMode(shared, cfg) {
  return new DownhillMode(shared, cfg);
}
