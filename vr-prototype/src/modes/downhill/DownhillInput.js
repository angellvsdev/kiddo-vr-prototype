/**
 * DownhillInput.js
 * Traduce todas las fuentes de entrada a una intención única del modo:
 *   steer  → giro [-1, 1]        (stick derecho/izquierdo XR, A/D, flechas)
 *   brake  → freno [0, 1]        (gatillos XR, S, pedales hacia atrás)
 *   sprint → pedaleo [0, 1]      (pedales físicos, W, stick izquierdo arriba)
 *   start / reset → eventos de un solo disparo (Espacio/W, R, gatillo)
 *
 * Los eventos de teclado se capturan en keydown para no perder pulsaciones
 * cortas entre frames.
 */
import { clamp, resolveBrake, clamp01 } from './downhillPhysics.js';
import { DOWNHILL_CONFIG as C } from './downhillConfig.js';

const STICK_DEADZONE = 0.1;

export class DownhillInput {
  constructor() {
    this.held = new Set();
    this.justPressed = new Set();

    this._onDown = (e) => {
      if (e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.held.has(e.code)) this.justPressed.add(e.code);
      this.held.add(e.code);
    };
    this._onUp = (e) => this.held.delete(e.code);

    window.addEventListener('keydown', this._onDown);
    window.addEventListener('keyup', this._onUp);
  }

  /**
   * @param {object} controls - estado del XRControllerManager
   * @param {object} pedal    - estado del PedalController
   * @returns {{steer:number, brake:number, sprint:number, start:boolean, reset:boolean}}
   */
  read(controls, pedal) {
    const held = (...codes) => codes.some((c) => this.held.has(c));
    const pressed = (...codes) => codes.some((c) => this.justPressed.has(c));

    // Giro: prioriza el stick derecho (como en la travesía), luego el izquierdo
    const turnX = controls?.turn?.x ?? 0;
    const moveX = controls?.move?.x ?? 0;
    const stickX = Math.abs(turnX) > STICK_DEADZONE ? turnX : (Math.abs(moveX) > STICK_DEADZONE ? moveX : 0);
    const keyX = (held('KeyD', 'ArrowRight') ? 1 : 0) - (held('KeyA', 'ArrowLeft') ? 1 : 0);
    const steer = clamp(stickX + keyX, -1, 1);

    // Freno: gatillos, tecla S y pedales hacia atrás
    const brake = resolveBrake(
      {
        triggerL: controls?.triggerL ?? 0,
        triggerR: controls?.triggerR ?? 0,
        keyBrake: held('KeyS', 'ArrowDown'),
        pedalLeft: pedal?.left ?? 0,
        pedalRight: pedal?.right ?? 0,
      },
      C,
    );

    // Pedaleo: pedales físicos, W o stick izquierdo hacia delante. Se anula si frenas.
    const pedalPower = pedal?.connected ? pedal.power ?? 0 : 0;
    const keyPower = held('KeyW') ? 0.85 : 0;
    // En XR, empujar el stick izquierdo hacia delante da move.y negativo
    const stickPower = clamp01(-(controls?.move?.y ?? 0));
    let sprint = clamp01(Math.max(pedalPower, keyPower, stickPower));
    if (brake > 0.2) sprint = 0;

    const start = held('Space', 'KeyW') || pedalPower > 0.2 || (controls?.triggerR ?? 0) > 0.4 || (controls?.triggerL ?? 0) > 0.4;
    // Reinicio: tecla R o pulsar A+B a la vez (detectado por flanco, no por nivel)
    const combo = !!(controls?.btnA && controls?.btnB);
    const comboEdge = combo && !this._combo;
    this._combo = combo;
    const reset = pressed('KeyR') || comboEdge;

    this.justPressed.clear();
    return { steer, brake, sprint, start: pressed('Space') || start, reset };
  }

  dispose() {
    window.removeEventListener('keydown', this._onDown);
    window.removeEventListener('keyup', this._onUp);
  }
}
