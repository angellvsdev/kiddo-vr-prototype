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
    this.state = {
      left: 0,
      right: 0,
      connected: false,
      name: '',
      power: 0,
      cadenceRpm: 0,
      strokeDetected: false,
    };

    this.lastStrokeTime = performance.now();
    this.lastPressedFoot = null;
    this.smoothedCadence = 0;
    this.lastHalfMs = 0; // duración de la última media vuelta (para el tiempo de inactividad adaptativo)

    // Detectar conexión/desconexión de gamepad
    window.addEventListener('gamepadconnected', (e) => {
      console.log('[Pedal] Gamepad conectado:', e.gamepad.id, 'index:', e.gamepad.index);
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
        this.state.power = 0;
        this.state.cadenceRpm = 0;
      }
    });
  }

  /**
   * Llamado cada frame — retorna el estado actual normalizado [0..1] y cadencia en RPM.
   * @param {number} delta
   * @returns {{ left: number, right: number, connected: boolean, name: string, power: number, cadenceRpm: number, strokeDetected: boolean }}
   */
  update(delta = 0.016) {
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

    // ── Cálculo de Cadencia (RPM) y Potencia de Propulsión ──────────────────
    const now = performance.now();
    let strokeDetected = false;

    let currentFoot = null;
    if (this.state.left > 0.35 && this.state.right < 0.25) {
      currentFoot = 'left';
    } else if (this.state.right > 0.35 && this.state.left < 0.25) {
      currentFoot = 'right';
    }

    if (currentFoot && currentFoot !== this.lastPressedFoot) {
      const elapsedMs = now - this.lastStrokeTime;
      if (elapsedMs > 120 && elapsedMs < 4500) {
        this.lastHalfMs = elapsedMs;
        // Medio giro = 1 stroke. Cadencia completa en RPM:
        const instantRpm = (60000 / elapsedMs) * 0.5;
        this.smoothedCadence = this.smoothedCadence * 0.4 + instantRpm * 0.6;
        strokeDetected = true;
      }
      this.lastPressedFoot = currentFoot;
      this.lastStrokeTime = now;
    }

    // Decaimiento cuando se deja de pedalear. El tiempo de inactividad se adapta a la cadencia:
    // con pedaleo lento (rehabilitación, ~10-20 RPM) una media vuelta dura >1.4 s y no debe contarse como parada.
    const idleLimitMs = Math.min(3500, Math.max(1400, this.lastHalfMs * 1.5));
    if (now - this.lastStrokeTime > idleLimitMs) {
      this.smoothedCadence = Math.max(0, this.smoothedCadence - delta * 45);
    }

    const analogIntensity = Math.max(this.state.left, this.state.right);
    const rpmFactor = Math.min(1.0, this.smoothedCadence / 75);
    this.state.power = Math.max(analogIntensity, rpmFactor);
    this.state.cadenceRpm = Math.min(130, this.smoothedCadence);
    this.state.strokeDetected = strokeDetected;

    return { ...this.state };
  }
}
