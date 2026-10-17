/**
 * Horse.js
 * Montura del jinete llanero. Equivale a la balsa del nivel costero:
 * - Modelo 3D procedural (cuerpo, cuello, cabeza, crines, cola, 4 patas articuladas, silla)
 * - Marcha al paso/trote animada en función de la velocidad
 * - Avance ligado a la cadencia REAL de pedaleo (fisioterapia): velocidad objetivo = RPM × metros por vuelta.
 *   Sin pedaleo el caballo se detiene; mantener un pedal presionado sin girar NO lo hace avanzar.
 * - Se adapta al relieve (altura y cabeceo según la pendiente del terreno)
 * - Dirección: el caballo sigue el sendero por sí solo (el jinete puede mirar en 360° sin que gire);
 *   el stick / A-D lo desvía manualmente y pausa el guiado unos segundos
 *
 * Convención: el caballo mira hacia -Z cuando rotation.y = 0 (igual que el avance de la costa).
 */
import * as THREE from 'three';

/** Altura (m) a la que se ubica el rig de la cámara respecto del terreno al ir montado */
export const SADDLE_RIG_HEIGHT = 0.95;

export class Horse {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../scene/LlanoEnvironment.js').LlanoEnvironment} environment
   * @param {THREE.Vector3} startPosition
   */
  constructor(scene, environment, startPosition = new THREE.Vector3(0, 0, 0)) {
    this.scene = scene;
    this.environment = environment;

    this.velocity = 0; // m/s
    this.maxSpeed = 3.4; // m/s (~12 km/h: trote suave al pedalear fuerte)
    this.metersPerRevolution = 2.6; // metros que avanza el caballo por cada vuelta completa de pedales
    this.distanceTravelled = 0; // metros acumulados en esta sesión
    this.cadence = 0;
    this.isMounted = false;
    this.isHalted = false; // true al llegar a la meta (frena sin intervención del usuario)
    this.pathFollowing = true; // guiado automático por el sendero
    this._manualSteerTimer = 0; // segundos restantes de control manual tras mover el stick

    this._gaitPhase = 0;
    this._lastStepHalf = 0;
    this._idleTime = 0;
    this._pitch = 0;

    /** Callback invocado en cada pisada: (strength 0..1) */
    this.onStep = null;

    this.group = new THREE.Group();
    this.group.position.copy(startPosition);
    this.scene.add(this.group);

    this._build();
    this._snapToGround();
  }

  // ─── Modelo 3D procedural ──────────────────────────────────────────────────
  _build() {
    const coat = new THREE.MeshStandardMaterial({ color: 0x6b3f22, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x24160d, roughness: 0.9 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x4a2a14, roughness: 0.7 });
    const blanket = new THREE.MeshStandardMaterial({ color: 0xb23a2a, roughness: 0.9 });

    // Cuerpo: cápsula horizontal
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.1, 6, 12), coat);
    body.rotation.x = Math.PI / 2;
    body.position.set(0, 1.1, 0);
    body.castShadow = true;
    this.group.add(body);

    // Cuello y cabeza (inclinados hacia adelante, hacia -Z)
    this.neck = new THREE.Group();
    this.neck.position.set(0, 1.3, -0.85);
    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.24, 0.95, 8), coat);
    neckMesh.position.y = 0.4;
    neckMesh.rotation.x = -0.55;
    neckMesh.castShadow = true;
    this.neck.add(neckMesh);

    const head = new THREE.Group();
    head.position.set(0, 0.85, -0.38);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.62), coat);
    skull.rotation.x = 0.75;
    skull.castShadow = true;
    head.add(skull);
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.22), dark);
    muzzle.position.set(0, -0.2, -0.3);
    muzzle.rotation.x = 0.75;
    head.add(muzzle);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), coat);
      ear.position.set(sx * 0.08, 0.2, 0.18);
      head.add(ear);
    }
    this.neck.add(head);
    this.head = head;

    // Crin a lo largo del cuello
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.14), dark);
    mane.position.set(0, 0.42, 0.14);
    mane.rotation.x = -0.55;
    this.neck.add(mane);
    this.group.add(this.neck);

    // Cola
    this.tail = new THREE.Group();
    this.tail.position.set(0, 1.3, 0.85);
    const tailMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.85, 6), dark);
    tailMesh.position.y = -0.4;
    tailMesh.rotation.x = -0.25;
    this.tail.add(tailMesh);
    this.group.add(this.tail);

    // Patas: pivote en la cadera/hombro. Orden: delantera izq, delantera der, trasera izq, trasera der
    this.legs = [];
    const legGeo = new THREE.CylinderGeometry(0.07, 0.05, 0.85, 6);
    legGeo.translate(0, -0.425, 0);
    const hoofGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.1, 6);
    const legDefs = [
      { x: -0.2, z: -0.55 },
      { x: 0.2, z: -0.55 },
      { x: -0.2, z: 0.55 },
      { x: 0.2, z: 0.55 },
    ];
    for (const d of legDefs) {
      const pivot = new THREE.Group();
      pivot.position.set(d.x, 0.9, d.z);
      const leg = new THREE.Mesh(legGeo, coat);
      leg.castShadow = true;
      pivot.add(leg);
      const hoof = new THREE.Mesh(hoofGeo, dark);
      hoof.position.y = -0.88;
      pivot.add(hoof);
      this.group.add(pivot);
      this.legs.push(pivot);
    }

    // Manta y silla de montar
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.05, 0.8), blanket);
    pad.position.set(0, 1.5, 0.05);
    this.group.add(pad);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.55), leather);
    seat.position.set(0, 1.55, 0.05);
    seat.castShadow = true;
    this.group.add(seat);
    const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.1), leather);
    pommel.position.set(0, 1.62, -0.25);
    this.group.add(pommel);
  }

  // ─── Utilidades de terreno ─────────────────────────────────────────────────
  _groundAt(x, z) {
    return this.environment.getGroundHeight(x, z);
  }

  _snapToGround() {
    const p = this.group.position;
    p.y = this._groundAt(p.x, p.z);
  }

  /** Posición mundial donde debe ir el rig de cámara al estar montado */
  getSaddlePosition(target = new THREE.Vector3()) {
    const bob = Math.sin(this._gaitPhase * 2) * 0.012 * Math.min(1, this.velocity / 2);
    target.set(0, SADDLE_RIG_HEIGHT + bob, 0.05).applyEuler(new THREE.Euler(0, this.group.rotation.y, 0));
    return target.add(this.group.position);
  }

  /** Posición mundial del suelo junto al caballo donde espera el jinete a pie */
  getDismountedSpot(target = new THREE.Vector3(), side = -1) {
    target.set(side * 2.1, 0, 1.4).applyEuler(new THREE.Euler(0, this.group.rotation.y, 0));
    target.add(this.group.position);
    target.y = this._groundAt(target.x, target.z);
    return target;
  }

  // ─── Actualización de estado y físicas ─────────────────────────────────────
  /**
   * @param {number} delta
   * @param {object} input
   * @param {number} input.rpm     - Cadencia de pedaleo en RPM (única fuente del avance)
   * @param {number} input.steer   - Giro manual [-1..1] (+ = derecha)
   */
  update(delta, { rpm = 0, steer = 0 } = {}) {
    this.cadence = rpm;
    const g = this.group;

    if (this.isMounted) {
      // 1. Velocidad objetivo proporcional a la cadencia (RPM/60 vueltas por segundo × m por vuelta).
      // La velocidad real la persigue con suavidad: sube en ~1 s y baja en ~0.7 s al dejar de pedalear.
      const target = this.isHalted ? 0 : Math.min(this.maxSpeed, (Math.max(0, rpm) / 60) * this.metersPerRevolution);
      const rate = target > this.velocity ? 1.4 : 2.2;
      this.velocity += (target - this.velocity) * (1 - Math.exp(-rate * delta));
      if (target === 0 && this.velocity < 0.03) this.velocity = 0;

      // 2. Dirección: giro manual (domina durante 2.5 s) o guiado suave por el sendero
      if (Math.abs(steer) > 0.05) {
        g.rotation.y -= steer * 0.9 * delta;
        this._manualSteerTimer = 2.5;
      } else if (this._manualSteerTimer > 0) {
        this._manualSteerTimer -= delta;
      } else if (this.pathFollowing && this.velocity > 0.2) {
        this._followTrail(delta);
      }

      // 3. Avance en la dirección del caballo, limitado a los bordes del mapa
      const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, g.rotation.y, 0));
      g.position.addScaledVector(forward, this.velocity * delta);
      this.distanceTravelled += this.velocity * delta;
      this._constrainToWorld();
    } else {
      this.velocity = 0;
    }

    // 4. Altura y cabeceo según el relieve (muestreo delante/detrás para la pendiente)
    const fwd = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, g.rotation.y, 0));
    const hFront = this._groundAt(g.position.x + fwd.x * 0.9, g.position.z + fwd.z * 0.9);
    const hBack = this._groundAt(g.position.x - fwd.x * 0.9, g.position.z - fwd.z * 0.9);
    const targetPitch = Math.atan2(hFront - hBack, 1.8);
    this._pitch += (targetPitch - this._pitch) * Math.min(1, delta * 6);
    g.position.y = this._groundAt(g.position.x, g.position.z);
    g.rotation.x = this._pitch;

    this._animate(delta);
  }

  /** Gira suavemente hacia un punto del sendero ~12 m más adelante */
  _followTrail(delta) {
    const p = this.group.position;
    const lookZ = p.z - 12;
    const targetX = this.environment.getTrailCenterX(lookZ);
    const targetYaw = Math.atan2(-(targetX - p.x), -(lookZ - p.z));
    let diff = targetYaw - this.group.rotation.y;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.group.rotation.y += diff * 0.6 * delta;
  }

  /** Mantiene al caballo dentro del área transitable */
  _constrainToWorld() {
    const p = this.group.position;
    const half = 55; // distancia máxima lateral al sendero
    const cx = this.environment.getTrailCenterX(p.z);
    if (Math.abs(p.x - cx) > half) {
      p.x = cx + Math.sign(p.x - cx) * half;
      this.velocity *= 0.6;
    }
    if (p.z > 30) {
      p.z = 30;
      this.velocity = 0;
    }
    if (p.z < -420) {
      p.z = -420;
      this.velocity = 0;
    }
  }

  /** Animación de marcha: patas, cabeceo del cuello y cola */
  _animate(delta) {
    this._idleTime += delta;
    const speedFactor = Math.min(1, this.velocity / 2.2);

    // Frecuencia de zancada proporcional a la velocidad (≈1 ciclo/seg a 1.5 m/s)
    this._gaitPhase += delta * (this.velocity * 4.2);
    const phase = this._gaitPhase;

    // Marcha diagonal: delantera izq + trasera der en fase, las otras opuestas
    const offsets = [0, Math.PI, Math.PI, 0];
    const amp = 0.55 * speedFactor;
    this.legs.forEach((leg, i) => {
      leg.rotation.x = Math.sin(phase + offsets[i]) * amp;
    });

    // Pisadas: una por cada medio ciclo
    const half = Math.floor(phase / Math.PI);
    if (half !== this._lastStepHalf) {
      this._lastStepHalf = half;
      if (this.velocity > 0.3 && this.onStep) this.onStep(Math.min(1, this.velocity / this.maxSpeed));
    }

    // Cabeceo del cuello al caminar + respiración en reposo
    this.neck.rotation.x = Math.sin(phase * 2) * 0.04 * speedFactor + Math.sin(this._idleTime * 1.3) * 0.015;
    this.head.rotation.x = Math.sin(phase * 2 + 0.6) * 0.05 * speedFactor;
    this.tail.rotation.x = Math.sin(this._idleTime * 2 + phase) * 0.12 + 0.05 * speedFactor;
  }
}
