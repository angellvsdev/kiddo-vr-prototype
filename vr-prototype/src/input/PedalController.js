/**
 * PedalController.js
 * Lee el estado de los pedales físicos usando la Gamepad API del navegador.
 *
 * COMPATIBILIDAD:
 * - Pedales USB genéricos → detectados como Gamepad estándar
 * - Pedales de juego (Logitech G, Thrustmaster, etc.) → mismo mecanismo
 * - Fallback: thumbstick del Quest 3 controller si no hay pedales
 *
 * MAPEO DE EJES (configurable según modelo de pedales):
 *   Eje 1 (axes[1]) → Pedal izquierdo (clutch / acelerador izquierdo)
 *   Eje 3 (axes[3]) → Pedal derecho (freno / acelerador derecho)
 *
 * Si el pedal es digital (botón), se usa buttons[0] y buttons[1].
 */
export class PedalController {
  constructor() {
    this.gamepadIndex = null;
    this.state = { left: 0, right: 0, connected: false, name: '' };

    // Detectar conexión/desconexión de gamepad
    window.addEventListener('gamepadconnected', (e) => {
      console.log('[Pedal] Gamepad conectado:', e.gamepad.id, 'index:', e.gamepad.index);
      // Tomar el primer gamepad conectado como pedales
      if (this.gamepadIndex === null) {
        this.gamepadIndex = e.gamepad.index;
        this.state.connected = true;
        this.state.name = e.gamepad.id;
      }
    });

    window.addEventListener('gamepaddisconnected', (e) => {
      console.log('[Pedal] Gamepad desconectado:', e.gamepad.id);
      if (e.gamepad.index === this.gamepadIndex) {
        this.gamepadIndex = null;
        this.state.connected = false;
        this.state.name = '';
      }
    });
  }

  /**
   * Llamado cada frame — retorna el estado actual normalizado [0..1].
   * @returns {{ left: number, right: number, connected: boolean, name: string }}
   */
  update() {
    if (this.gamepadIndex === null) {
      // Sin pedales: intentar detectar cualquier gamepad nuevo
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) {
          this.gamepadIndex = i;
          this.state.connected = true;
          this.state.name = gamepads[i].id;
          break;
        }
      }
      this.state.left = 0;
      this.state.right = 0;
      return { ...this.state };
    }

    const gamepads = navigator.getGamepads();
    const gp = gamepads[this.gamepadIndex];

    if (!gp) {
      this.state.left = 0;
      this.state.right = 0;
      return { ...this.state };
    }

    // ── Lectura de ejes (analógico) ─────────────────────────────────────────
    // Los pedales analógicos suelen reportar en rango [-1, 1]
    // Normalizamos a [0, 1] donde 1 = pedal totalmente presionado
    const readAxis = (axisValue) => {
      // Algunos pedales usan [-1 (reposo) → 1 (presionado)]
      // Otros usan [1 (reposo) → -1 (presionado)]
      // Esta función normaliza ambos casos
      const normalized = (axisValue + 1) / 2; // [-1,1] → [0,1]
      return Math.max(0, Math.min(1, normalized));
    };

    // Eje del pedal izquierdo (típicamente axes[1] o axes[2])
    let leftVal = 0;
    let rightVal = 0;

    if (gp.axes.length >= 2) {
      // Pedales analógicos: intentar ejes comunes
      leftVal  = readAxis(gp.axes[1] ?? 0);
      rightVal = readAxis(gp.axes[3] ?? gp.axes[2] ?? 0);
    }

    // ── Fallback a botones digitales ────────────────────────────────────────
    if (gp.buttons.length >= 1 && leftVal < 0.05) {
      leftVal = gp.buttons[0]?.pressed ? 1 : (gp.buttons[0]?.value ?? 0);
    }
    if (gp.buttons.length >= 2 && rightVal < 0.05) {
      rightVal = gp.buttons[1]?.pressed ? 1 : (gp.buttons[1]?.value ?? 0);
    }

    // Zona muerta (deadzone) para evitar drift
    const DEADZONE = 0.05;
    this.state.left  = leftVal  > DEADZONE ? leftVal  : 0;
    this.state.right = rightVal > DEADZONE ? rightVal : 0;

    return { ...this.state };
  }
}
