/**
 * DownhillHUD.js
 * Panel de telemetría de la carrera, flotando delante del usuario.
 * Se mira de frente desde el cameraRig (sin girar en Y), así que no sufre el
 * espejado que tenía el dashboard de la balsa.
 *
 * Rendimiento: el canvas solo se repinta ~5 veces por segundo, no en cada frame.
 */
import * as THREE from 'three';

const W = 1024;
const H = 512;
const REFRESH_SEC = 0.2;

export class DownhillHUD {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), mat);
    this.mesh.position.set(0, 1.2, -1.5);
    this.mesh.rotation.x = -0.15; // ligera inclinación hacia el usuario

    this._sinceRefresh = Infinity;
    this._last = null;
  }

  /**
   * @param {number} delta
   * @param {object} data
   * @param {string} data.phase
   * @param {number} data.time        - tiempo de carrera (s)
   * @param {number} data.penalty     - penalización acumulada (s)
   * @param {number} data.bonusSec    - bonus acumulado por monedas (s)
   * @param {number} data.coinsTaken
   * @param {number} data.coinsTotal
   * @param {number} data.streak      - monedas seguidas sin fallar
   * @param {number} data.speedKmh
   * @param {number} data.progress    - [0, 1]
   * @param {Array<{index:number, timeSec:number}>} data.splits
   * @param {string} data.message
   */
  update(delta, data) {
    this._sinceRefresh += delta;
    if (this._sinceRefresh < REFRESH_SEC && this._last?.phase === data.phase) return;
    this._sinceRefresh = 0;
    this._last = data;
    this._draw(data);
  }

  _draw(d) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(12, 10, 30, 0.88)';
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 32);
    ctx.fill();

    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(6, 6, W - 12, H - 12, 28);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#fb923c';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText('🚵 DESCENSO CONTRA EL RELOJ', 40, 62);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(d.phase === 'running' ? 'EN CARRERA' : d.phase.toUpperCase(), W - 40, 60);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 96px monospace';
    ctx.fillText(formatTime(Math.max(0, d.time + d.penalty - d.bonusSec)), 40, 190);

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText(
      `PENALIZACIÓN +${d.penalty.toFixed(0)} s   BONUS −${d.bonusSec.toFixed(1)} s`,
      40,
      230,
    );
    ctx.textAlign = 'right';
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText(
      `🪙 ${d.coinsTaken}/${d.coinsTotal}   racha ×${d.streak}`,
      W - 40,
      230,
    );
    ctx.textAlign = 'left';

    ctx.textAlign = 'right';
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 72px monospace';
    ctx.fillText(`${Math.round(d.speedKmh)} km/h`, W - 40, 190);

    // Barra de progreso
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.roundRect(40, 262, W - 80, 24, 12);
    ctx.fill();
    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.roundRect(40, 262, (W - 80) * Math.min(1, d.progress), 24, 12);
    ctx.fill();

    // Parciales
    ctx.textAlign = 'left';
    ctx.font = 'bold 28px monospace';
    ctx.fillStyle = '#e2e8f0';
    const splitsText = d.splits.length
      ? d.splits.map((sp) => `CP${sp.index + 1}  ${formatTime(sp.timeSec)}`).join('     ')
      : 'Sin parciales todavía';
    ctx.fillText(splitsText, 40, 330);

    // Mensaje
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fef08a';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText(d.message, W / 2, 440);

    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}

/** Formatea segundos como m:ss.cc */
export function formatTime(sec) {
  const total = Math.max(0, sec);
  const m = Math.floor(total / 60);
  const s = (total - m * 60).toFixed(2).padStart(5, '0');
  return `${m}:${s}`;
}
