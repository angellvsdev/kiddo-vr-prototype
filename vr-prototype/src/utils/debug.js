/**
 * debug.js
 * Panel de debug que muestra el estado de los Touch Controllers del Quest 3.
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
  }

  /** @param {object} cs - controllerState del XRControllerManager */
  update(cs) {
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
  }
}
