/**
 * DownhillBike.js
 * Bicicleta vista en primera persona. Vive como hijo del cameraRig compartido,
 * así el manillar y la parte delantera del cuadro quedan siempre en el campo
 * de visión del usuario, en la parte inferior de la vista.
 *
 * Orientación local: el avance es -Z, igual que el resto del proyecto.
 *   - El origen está sobre la carretera, en el centro de la pista.
 *   - group.rotation.x acompaña la pendiente (las ruedas siguen la ladera).
 *   - El cameraRig se mantiene nivelado (ver DownhillMode) para evitar mareo.
 *
 * Geometría (metros): ejes en y = 0.36 (radio de rueda), manillar a y ≈ 1.1.
 * Con la cámara de escritorio a 1.35 m, el manillar cae en el tercio inferior
 * de la vista y la rueda delantera asoma al mirar hacia abajo.
 */
import * as THREE from 'three';

const WHEEL_RADIUS = 0.36;
const REAR_AXLE = new THREE.Vector3(0, WHEEL_RADIUS, 0.55);
const FRONT_AXLE = new THREE.Vector3(0, WHEEL_RADIUS, -0.8);
const BOTTOM_BRACKET = new THREE.Vector3(0, 0.45, 0);
const SEAT_TOP = new THREE.Vector3(0, 0.95, 0.35);
const HEAD_BOTTOM = new THREE.Vector3(0, 0.85, -0.5);
const HEAD_TOP = new THREE.Vector3(0, 1.1, -0.5);
const UP_Z = new THREE.Vector3(0, 0, 1);

export class DownhillBike {
  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.4, roughness: 0.4 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.8, roughness: 0.3 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.6 });

    // Ruedas
    this.frontWheel = this._wheel(tireMat, rimMat);
    this.frontWheel.position.copy(FRONT_AXLE);
    this.rearWheel = this._wheel(tireMat, rimMat);
    this.rearWheel.position.copy(REAR_AXLE);
    this.group.add(this.frontWheel, this.rearWheel);

    // Cuadro: tubos entre puntos reales de la bicicleta
    const tube = (a, b, w) => this._beam(a, b, w, frameMat);
    this.group.add(
      tube(HEAD_TOP, SEAT_TOP, 0.06),              // tubo superior
      tube(HEAD_BOTTOM, BOTTOM_BRACKET, 0.07),     // tubo inferior
      tube(BOTTOM_BRACKET, SEAT_TOP, 0.05),        // tubo del sillín
      tube(BOTTOM_BRACKET, REAR_AXLE, 0.05),       // vaina de cadena
      tube(SEAT_TOP, REAR_AXLE, 0.04),             // vaina del sillín
      tube(HEAD_BOTTOM, FRONT_AXLE, 0.05),         // horquilla
      tube(HEAD_BOTTOM, HEAD_TOP, 0.07),           // pipa de dirección
    );

    // Sillín y bielas (visibles al mirar hacia abajo)
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.3), blackMat);
    saddle.position.set(0, SEAT_TOP.y + 0.05, SEAT_TOP.z);
    this.group.add(saddle);
    for (const side of [-1, 1]) {
      const crank = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), blackMat);
      crank.position.set(side * 0.12, BOTTOM_BRACKET.y, BOTTOM_BRACKET.z);
      this.group.add(crank);
    }

    // Manillar: pivote en la pipa de dirección, gira con el stick
    this.handlebars = new THREE.Group();
    this.handlebars.position.set(0, HEAD_TOP.y + 0.02, HEAD_TOP.z - 0.02);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 8), rimMat);
    bar.rotation.z = Math.PI / 2;
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.1), frameMat);
    for (const side of [-1, 1]) {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 10), gripMat);
      grip.rotation.z = Math.PI / 2;
      grip.position.set(side * 0.34, 0, 0.02);
      this.handlebars.add(grip);
    }
    this.handlebars.add(bar, stem);
    this.group.add(this.handlebars);
  }

  /** Viga entre dos puntos: caja orientada de a hacia b. */
  _beam(a, b, width, material) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, width, len), material);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(UP_Z, dir.normalize());
    mesh.castShadow = true;
    return mesh;
  }

  _wheel(tireMat, rimMat) {
    const pivot = new THREE.Group(); // acumula el giro de rodadura
    const holder = new THREE.Group(); // orienta el anillo perpendicular al avance
    holder.rotation.y = Math.PI / 2;
    const tire = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS, 0.05, 8, 24), tireMat);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS * 0.6, 0.012, 6, 16), rimMat);
    holder.add(tire, rim);
    pivot.add(holder);
    return pivot;
  }

  /**
   * @param {object} state
   * @param {number} state.distanceDelta - metros recorridos en este frame
   * @param {number} state.steer         - giro normalizado [-1, 1]
   * @param {number} state.slopeRad      - ángulo de la pendiente (rad, > 0 = bajada)
   */
  update({ distanceDelta, steer, slopeRad }) {
    const spin = distanceDelta / WHEEL_RADIUS;
    this.frontWheel.rotation.x += spin;
    this.rearWheel.rotation.x += spin;
    this.handlebars.rotation.y = steer * 0.35;
    this.group.rotation.x = -slopeRad;
  }

  setVisible(visible) {
    this.group.visible = visible;
  }
}
