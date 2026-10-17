/**
 * RiderDashboard.js
 * Tablero holográfico flotante sobre la cruz del caballo (equivale al dashboard de la balsa):
 * cadencia (RPM), velocidad (km/h), orbes recogidos, puntos, distancia al hato y mensaje de estado.
 * Se redibuja a ~10 Hz y solo si cambió algún valor, para no saturar la GPU del Quest.
 */
import * as THREE from 'three';

export class RiderDashboard {
  /**
   * @param {THREE.Object3D} parent - Objeto al que se ancla (el grupo del caballo)
   * @param {number} routeLength - Longitud total de la ruta en metros
   */
  constructor(parent, routeLength) {
    this.routeLength = routeLength;
    this.values = { rpm: 0, kmh: 0, orbs: 0, orbsTotal: 0, score: 0, distance: routeLength, message: '¡Pedalea para avanzar por el llano!' };
    this._lastKey = '';
    this._accum = 0;

    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 448;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.27),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, side: THREE.DoubleSide, fog: false })
    );
    // Flota delante del jinete, inclinado hacia sus ojos; el caballo mira a -Z y el jinete está en +Z
    this.mesh.position.set(0, 1.75, -0.45);
    this.mesh.rotation.set(-0.9, 0, 0);
    parent.add(this.mesh);

    this._render();
  }

  set(values) {
    Object.assign(this.values, values);
  }

  update(delta) {
    this._accum += delta;
    if (this._accum < 0.1) return;
    this._accum = 0;
    this._render();
  }

  _render() {
    const v = this.values;
    const key = `${Math.round(v.rpm)}|${v.kmh.toFixed(1)}|${v.orbs}|${v.score}|${Math.round(v.distance)}|${v.message}`;
    if (key === this._lastKey) return;
    this._lastKey = key;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, 1024, 448);

    ctx.fillStyle = 'rgba(40, 18, 8, 0.82)';
    ctx.beginPath();
    ctx.roundRect(0, 0, 1024, 448, 32);
    ctx.fill();
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(6, 6, 1012, 436, 28);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffb347';
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.fillText('🐎 TRAVESÍA POR EL LLANO', 44, 62);

    ctx.strokeStyle = 'rgba(255, 179, 71, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(44, 86);
    ctx.lineTo(980, 86);
    ctx.stroke();

    const metric = (label, value, color, x) => {
      ctx.fillStyle = color;
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.fillText(label, x, 144);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 50px monospace';
      ctx.fillText(value, x, 210);
    };
    metric('🚴 CADENCIA', `${Math.round(v.rpm)} RPM`, '#7dd3fc', 44);
    metric('⚡ VELOCIDAD', `${v.kmh.toFixed(1)} km/h`, '#c4b5fd', 380);
    metric('🔆 ORBES', `${v.orbs} / ${v.orbsTotal}`, '#fbbf24', 740);

    ctx.fillStyle = '#e7d6c3';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(`🏡 AL HATO: ${Math.max(0, Math.round(v.distance))} m`, 44, 272);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`⭐ ${v.score} PUNTOS`, 980, 272);
    ctx.textAlign = 'left';

    const barX = 44, barY = 292, barW = 936, barH = 24;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 12);
    ctx.fill();
    const progress = THREE.MathUtils.clamp(1 - v.distance / this.routeLength, 0, 1);
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.roundRect(barX, barY, Math.max(24, barW * progress), barH, 12);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText(v.message, 512, 396);

    this.texture.needsUpdate = true;
  }
}
