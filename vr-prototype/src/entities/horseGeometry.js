/**
 * horseGeometry.js
 * Utilidades para modelar el caballo con formas suaves y pocos triángulos (aptas para Quest 3):
 * - taperedTube: tubo de sección elíptica que sigue una curva (cuello, cabeza, patas, cola)
 * - ellipsoid:   esfera escalada (pecho, barril, grupa)
 * Todas devuelven BufferGeometry con atributos position / normal / color (indexada), de modo que
 * se pueden fusionar con mergeGeometries y pintar el pelaje por vértices, sin texturas.
 */
import * as THREE from 'three';

const LATERAL = new THREE.Vector3(1, 0, 0);

/** Interpola linealmente un arreglo de valores en t∈[0,1] */
function sampleArray(arr, t) {
  const f = t * (arr.length - 1);
  const i = Math.min(arr.length - 2, Math.floor(f));
  return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
}

/**
 * Tubo cónico de sección elíptica a lo largo de una curva contenida en un plano x=const
 * (el cuello, la cabeza, las patas y la cola de un animal de perfil cumplen esto).
 *
 * @param {THREE.Vector3[]} points - puntos de la curva (Catmull-Rom)
 * @param {number[]} rx - semieje lateral (X) en cada punto
 * @param {number[]} ry - semieje en el plano de la curva (dorsal-ventral) en cada punto
 * @param {object}  opts
 * @param {number}  [opts.rings=12]    anillos a lo largo de la curva
 * @param {number}  [opts.radial=10]   lados de cada anillo
 * @param {(t:number, cx:number, cy:number)=>THREE.Color} [opts.color]
 *        color por vértice; t = posición a lo largo (0..1), cx = lateral (-1..1), cy = dorsal(+1)/ventral(-1)
 */
export function taperedTube(points, rx, ry, opts = {}) {
  const { rings = 12, radial = 10, color = () => new THREE.Color(0xffffff) } = opts;
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  const pos = [];
  const col = [];
  const idx = [];

  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const p = curve.getPointAt(t);
    const T = curve.getTangentAt(t).normalize();
    // Normal en el plano de la curva (perpendicular a T y al eje lateral X)
    const N = new THREE.Vector3().crossVectors(LATERAL, T).normalize();
    const a = sampleArray(rx, t);
    const b = sampleArray(ry, t);
    for (let k = 0; k < radial; k++) {
      const th = (k / radial) * Math.PI * 2;
      const cx = Math.cos(th);
      const cy = Math.sin(th);
      pos.push(
        p.x + LATERAL.x * a * cx + N.x * b * cy,
        p.y + LATERAL.y * a * cx + N.y * b * cy,
        p.z + LATERAL.z * a * cx + N.z * b * cy
      );
      const c = color(t, cx, cy);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let k = 0; k < radial; k++) {
      const a0 = r * radial + k;
      const a1 = r * radial + ((k + 1) % radial);
      const b0 = (r + 1) * radial + k;
      const b1 = (r + 1) * radial + ((k + 1) % radial);
      idx.push(a0, b0, a1, a1, b0, b1);
    }
  }

  // Tapas en los dos extremos (abanico hacia el centro)
  const capStart = pos.length / 3;
  const addCap = (ringIndex, flip) => {
    const t = ringIndex / rings;
    const p = curve.getPointAt(t);
    const centerIdx = pos.length / 3;
    pos.push(p.x, p.y, p.z);
    const c = color(t, 0, 0);
    col.push(c.r, c.g, c.b);
    for (let k = 0; k < radial; k++) {
      const a = ringIndex * radial + k;
      const b = ringIndex * radial + ((k + 1) % radial);
      if (flip) idx.push(centerIdx, b, a);
      else idx.push(centerIdx, a, b);
    }
  };
  addCap(0, false);
  addCap(rings, true);
  void capStart;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Elipsoide (esfera escalada y trasladada) con color por vértice.
 * @param {THREE.Vector3} radii  semiejes (x, y, z)
 * @param {THREE.Vector3} center posición
 * @param {(p:THREE.Vector3)=>THREE.Color} colorFn color según la posición local normalizada (-1..1)
 */
export function ellipsoid(radii, center, colorFn = () => new THREE.Color(0xffffff), seg = [18, 12]) {
  const g = new THREE.SphereGeometry(1, seg[0], seg[1]);
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const c = colorFn(v);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.scale(radii.x, radii.y, radii.z);
  g.translate(center.x, center.y, center.z);
  return g;
}

/** Añade color uniforme a una geometría que no lo tiene (para poder fusionarla) */
export function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  return geo;
}
