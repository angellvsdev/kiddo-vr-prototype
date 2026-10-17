/**
 * debug.js
 * Panel de debug que muestra telemetría en tiempo real:
 * - Touch Controllers del Meta Quest 3
 * - Pedales físicos y cadencia RPM
 * - Perlas recogidas y distancia
 * - Disparos de acciones hacia dispositivos externos
 */
export class DebugOverlay {
  constructor() {
    this._panel = document.getElementById('ctrl-debug');
    this._moveX   = document.getElementById('dbg-move-x');
    this._turnX   = document.getElementById('dbg-turn-x');
    this._triggerL = document.getElementById('dbg-trigger-l');
    this._triggerR = document.getElementById('dbg-trigger-r');
    this._btns     = document.getElementById('dbg-btns');
    this._ctrlCount = document.getElementById('dbg-ctrl-count');

    this._pedalVal = document.getElementById('dbg-pedals');
    this._pearlsVal = document.getElementById('dbg-pearls');
    this._deviceVal = document.getElementById('dbg-device-action');

    // Escuchar eventos de acciones hacia el dispositivo externo
    window.addEventListener('external-device-action', (e) => {
      if (this._deviceVal && e.detail) {
        this._deviceVal.textContent = `${e.detail.type} (${e.detail.pearlId ?? 'OK'}) @ ${e.detail.at}`;
        this._deviceVal.style.color = '#00f0ff';
      }
    });
  }

  /**
   * @param {object} cs - controllerState del XRControllerManager
   * @param {object} extraData - { pedalState, pearlsCount, targetPearls }
   */
  update(cs, extraData = null) {
    if (!this._panel) return;

    if (this._moveX) {
      const mx = (cs.move?.x ?? 0).toFixed(2);
      const my = (cs.move?.y ?? 0).toFixed(2);
      this._moveX.textContent = `${mx}, ${my}`;
    }
    if (this._turnX) {
      this._turnX.textContent = (cs.turn?.x ?? 0).toFixed(2);
    }
    if (this._triggerL) {
      this._triggerL.textContent = Math.round((cs.triggerL ?? 0) * 100) + '%';
    }
    if (this._triggerR) {
      this._triggerR.textContent = Math.round((cs.triggerR ?? 0) * 100) + '%';
    }
    if (this._ctrlCount) {
      const n = cs.controllersConnected ?? 0;
      this._ctrlCount.textContent = n > 0 ? `✓ ${n} mando${n > 1 ? 's' : ''} conectado${n > 1 ? 's' : ''}` : 'Buscando mandos...';
      this._ctrlCount.style.color = n > 0 ? '#00f0ff' : 'rgba(255,255,255,0.4)';
    }
    if (this._btns) {
      const active = [];
      if (cs.btnX) active.push('X');
      if (cs.btnY) active.push('Y');
      if (cs.btnA) active.push('A');
      if (cs.btnB) active.push('B');
      this._btns.textContent = active.length ? active.join(' + ') : '—';
    }

    if (extraData) {
      if (this._pedalVal && extraData.pedalState) {
        const p = extraData.pedalState;
        this._pedalVal.textContent = p.connected
          ? `${Math.round(p.cadenceRpm)} RPM | ${(p.power * 100).toFixed(0)}%`
          : `Emulado (${Math.round(extraData.effectiveRpm ?? 0)} RPM)`;
      }
      if (this._pearlsVal && extraData.pearlsCount !== undefined) {
        this._pearlsVal.textContent = `${extraData.pearlsCount} / ${extraData.targetPearls}`;
      }
    }
  }
}
