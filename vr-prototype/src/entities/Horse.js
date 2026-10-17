/**
 * Horse.js
 * Montura del jinete llanero. Equivale a la balsa del nivel costero:
 * - Modelo 3D procedural de formas suaves (~6 mil triángulos, ~20 draw calls, sin texturas): pecho, barril y grupa,
 *   cuello curvo con crin, cabeza con ollares, ojos y orejas que se mueven, cola, 4 patas de 2 segmentos
 *   (cuartilla y casco), silla con manta, estribos, brida y riendas. Pelaje bayo con mancha blanca y calcetines.
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { taperedTube, ellipsoid, paint } from './horseGeometry.js';

/** Altura (m) a la que se ubica el rig de la cámara respecto del terreno al ir montado */
export const SADDLE_RIG_HEIGHT = 1.05;

/** Cuánto se eleva el tronco sobre el suelo respecto de las coordenadas del modelo (patas de 1.05 m) */
const BODY_LIFT = 0.1;

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
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const C = {
      coat: new THREE.Color(0x6f4226),   // bayo
      belly: new THREE.Color(0xa87a50),
      dark: new THREE.Color(0x24170f),   // crin, cola, puntos negros
      white: new THREE.Color(0xf3eee3),  // mancha y calcetines
      muzzle: new THREE.Color(0x4a2e20),
      hoof: new THREE.Color(0x2b2018),
      leather: new THREE.Color(0x5a3418),
      leatherDark: new THREE.Color(0x3a210f),
      blanket: new THREE.Color(0xc2412a),
      trim: new THREE.Color(0xf1d9a0),
      metal: new THREE.Color(0xb9bcc4),
    };
    const tmp = new THREE.Color();

    const coatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });
    const tackMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0b0706, roughness: 0.12, metalness: 0.2 });
    const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = (geo, mat = coatMat) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      return m;
    };

    // Cuerpo que se mece al caminar (todo lo que sigue al tronco cuelga de aquí)
    this.body = new THREE.Group();
    this.body.position.y = BODY_LIFT;
    this.group.add(this.body);

    // ── Tronco: pecho, barril, grupa, cruz, hombros y cuartos traseros (una sola malla) ──
    const bodyColor = (v) => tmp.copy(C.coat).lerp(C.belly, THREE.MathUtils.smoothstep(-v.y, 0.2, 0.95));
    const bodyGeo = mergeGeometries([
      ellipsoid(V(0.31, 0.35, 0.82), V(0, 1.1, 0.04), bodyColor, [22, 14]),
      ellipsoid(V(0.27, 0.37, 0.36), V(0, 1.12, -0.52), bodyColor, [18, 12]),
      ellipsoid(V(0.31, 0.35, 0.44), V(0, 1.15, 0.66), bodyColor, [18, 12]),
      ellipsoid(V(0.12, 0.09, 0.2), V(0, 1.44, -0.46), bodyColor, [10, 8]),
      ellipsoid(V(0.09, 0.22, 0.24), V(0.2, 1.0, -0.5), bodyColor, [10, 8]),
      ellipsoid(V(0.09, 0.22, 0.24), V(-0.2, 1.0, -0.5), bodyColor, [10, 8]),
      ellipsoid(V(0.1, 0.22, 0.26), V(0.22, 1.05, 0.7), bodyColor, [10, 8]),
      ellipsoid(V(0.1, 0.22, 0.26), V(-0.22, 1.05, 0.7), bodyColor, [10, 8]),
    ]);
    this.body.add(mesh(bodyGeo));

    // ── Cuello (pivote en la base) ──
    const NECK_PIVOT = V(0, 1.34, -0.62);
    const neckPts = [V(0, 1.34, -0.62), V(0, 1.48, -0.92), V(0, 1.58, -1.2), V(0, 1.63, -1.44)];
    const neckGeo = taperedTube(neckPts, [0.2, 0.16, 0.125, 0.105], [0.25, 0.2, 0.155, 0.13], {
      rings: 12,
      radial: 10,
      color: (t, cx, cy) => tmp.copy(C.coat).lerp(C.belly, THREE.MathUtils.smoothstep(-cy, 0.2, 1) * 0.5),
    });
    neckGeo.translate(-NECK_PIVOT.x, -NECK_PIVOT.y, -NECK_PIVOT.z);
    this.neck = new THREE.Group();
    this.neck.position.copy(NECK_PIVOT);
    this.neck.add(mesh(neckGeo));
    this.body.add(this.neck);

    // Crin: mechones oscuros sobre la cresta del cuello, caídos hacia un lado
    const neckCurve = new THREE.CatmullRomCurve3(neckPts, false, 'catmullrom', 0.5);
    const maneParts = [];
    for (let i = 0; i < 10; i++) {
      const t = 0.04 + (i / 9) * 0.94;
      const p = neckCurve.getPointAt(t);
      const tan = neckCurve.getTangentAt(t);
      const up = new THREE.Vector3().crossVectors(V(1, 0, 0), tan).normalize();
      const ry = 0.25 + (0.13 - 0.25) * t;
      const crest = p.clone().addScaledVector(up, ry * 0.92);
      // Mechones de tamaño y caída variables, para que no parezca una soga uniforme
      const k = Math.sin(i * 2.3 + 0.7);
      maneParts.push(
        ellipsoid(
          V(0.032, 0.08 + 0.035 * k * k, 0.07),
          V(crest.x + (i % 2 ? 0.055 : 0.03), crest.y - 0.035 - 0.02 * (i % 3), crest.z),
          () => (i % 4 === 1 ? C.coat.clone().lerp(C.dark, 0.6) : C.dark),
          [8, 6]
        )
      );
    }
    const maneGeo = mergeGeometries(maneParts);
    maneGeo.translate(-NECK_PIVOT.x, -NECK_PIVOT.y, -NECK_PIVOT.z);
    this.neck.add(mesh(maneGeo));

    // ── Cabeza (pivote en la nuca) ──
    const POLL = V(0, 1.7, -1.44);
    const headPts = [V(0, 1.7, -1.44), V(0, 1.61, -1.58), V(0, 1.48, -1.74), V(0, 1.38, -1.87)];
    const headGeo = taperedTube(headPts, [0.075, 0.095, 0.075, 0.058], [0.1, 0.125, 0.088, 0.066], {
      rings: 10,
      radial: 10,
      color: (t, cx, cy) => {
        if (t > 0.88) return tmp.copy(C.muzzle);                          // hocico oscuro
        if (t > 0.28 && Math.abs(cx) < 0.34 && cy > 0.45) return tmp.copy(C.white); // mancha en la frente
        return tmp.copy(C.coat);
      },
    });
    headGeo.translate(-POLL.x, -POLL.y, -POLL.z);
    this.head = new THREE.Group();
    this.head.position.copy(POLL.clone().sub(NECK_PIVOT));
    this.head.add(mesh(headGeo));
    this.neck.add(this.head);

    // Mejillas (dan volumen a la quijada) y ollares
    const cheeks = mergeGeometries([
      ellipsoid(V(0.04, 0.085, 0.1), V(0.062, 1.53, -1.66), () => C.coat, [8, 6]),
      ellipsoid(V(0.04, 0.085, 0.1), V(-0.062, 1.53, -1.66), () => C.coat, [8, 6]),
      ellipsoid(V(0.014, 0.02, 0.012), V(0.028, 1.4, -1.905), () => C.dark, [6, 5]),
      ellipsoid(V(0.014, 0.02, 0.012), V(-0.028, 1.4, -1.905), () => C.dark, [6, 5]),
      ellipsoid(V(0.034, 0.07, 0.06), V(0, 1.76, -1.52), () => C.dark, [8, 6]), // tupé
    ]);
    cheeks.translate(-POLL.x, -POLL.y, -POLL.z);
    this.head.add(mesh(cheeks));

    // Ojos con brillo
    for (const sx of [-1, 1]) {
      const eye = mesh(new THREE.SphereGeometry(0.024, 10, 8), eyeMat);
      eye.position.set(sx * 0.083 - POLL.x, 1.655 - POLL.y, -1.56 - POLL.z);
      eye.scale.set(0.8, 1, 1);
      eye.castShadow = false;
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 6, 5), shineMat);
      shine.position.set(sx * 0.012, 0.012, -0.016);
      eye.add(shine);
      this.head.add(eye);
    }

    // Orejas (se mueven): cono aplastado, con el interior oscuro
    this.ears = [];
    for (const sx of [-1, 1]) {
      const earGeo = new THREE.ConeGeometry(0.036, 0.15, 7);
      earGeo.translate(0, 0.075, 0);
      earGeo.scale(0.8, 1, 0.55);
      paint(earGeo, C.coat);
      const ear = mesh(earGeo);
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.055, 0.075, 0.0);
      pivot.rotation.set(-0.35, 0, -sx * 0.16);
      pivot.add(ear);
      this.head.add(pivot);
      this.ears.push({ pivot, baseZ: pivot.rotation.z, baseX: pivot.rotation.x, side: sx });
    }

    // Brida: nasal, carrilleras y riendas (cuero)
    const tack = [];
    const headDir = headPts[3].clone().sub(headPts[2]).normalize();
    const noseband = new THREE.TorusGeometry(0.066, 0.0075, 6, 14);
    noseband.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), headDir));
    noseband.translate(0, 1.435, -1.805);
    tack.push(paint(noseband, C.leatherDark));
    for (const sx of [-1, 1]) {
      const strap = taperedTube(
        [V(sx * 0.082, 1.71, -1.48), V(sx * 0.1, 1.58, -1.63), V(sx * 0.08, 1.44, -1.8)],
        [0.0065, 0.0065, 0.0065],
        [0.0065, 0.0065, 0.0065],
        { rings: 6, radial: 5, color: () => C.leatherDark }
      );
      tack.push(strap);
    }
    const bridleGeo = mergeGeometries(tack);
    bridleGeo.translate(-POLL.x, -POLL.y, -POLL.z);
    this.head.add(mesh(bridleGeo, tackMat));

    // Riendas: desde el bocado hasta las manos del jinete (siguen la silueta del cuello, sin atravesarlo)
    const reinParts = [];
    for (const sx of [-1, 1]) {
      const bezier = new THREE.QuadraticBezierCurve3(V(sx * 0.07, 1.42, -1.83), V(sx * 0.23, 1.42, -1.1), V(sx * 0.14, 1.64, -0.3));
      const tube = new THREE.TubeGeometry(bezier, 14, 0.006, 5, false);
      tube.deleteAttribute('uv');
      reinParts.push(paint(tube, C.leatherDark));
    }
    this.body.add(mesh(mergeGeometries(reinParts), tackMat));

    // ── Cola (pivote en la base) ──
    const TAIL_PIVOT = V(0, 1.43, 0.98);
    const tailGeo = taperedTube(
      [V(0, 0, 0), V(0, -0.12, 0.18), V(0, -0.42, 0.3), V(0, -0.78, 0.34)],
      [0.05, 0.085, 0.085, 0.03],
      [0.05, 0.085, 0.085, 0.03],
      { rings: 10, radial: 8, color: () => C.dark }
    );
    this.tail = new THREE.Group();
    this.tail.position.copy(TAIL_PIVOT);
    this.tail.add(mesh(tailGeo));
    this.body.add(this.tail);

    // ── Patas: cada una con muslo/antebrazo y caña+casco articulados en la rodilla/corvejón ──
    this.legs = [];
    const defs = [
      { x: -0.17, z: -0.5, front: true, sock: true },   // delantera izquierda (calcetín blanco)
      { x: 0.17, z: -0.5, front: true, sock: false },   // delantera derecha
      { x: -0.19, z: 0.7, front: false, sock: false },  // trasera izquierda
      { x: 0.19, z: 0.7, front: false, sock: true },    // trasera derecha (calcetín blanco)
    ];
    for (const d of defs) {
      const upperR = d.front ? [0.105, 0.078, 0.056] : [0.135, 0.092, 0.058];
      const upperGeo = mergeGeometries([
        taperedTube([V(0, 0, 0), V(0, -0.28, d.front ? 0.01 : 0.035), V(0, -0.55, 0)], upperR, upperR, {
          rings: 6,
          radial: 8,
          color: (t) => tmp.copy(C.coat).lerp(C.dark, THREE.MathUtils.smoothstep(t, 0.6, 1)),
        }),
        ellipsoid(V(0.06, 0.06, 0.064), V(0, -0.55, 0), () => C.dark, [8, 6]),
      ]);

      const lowerColor = d.sock ? C.white : C.dark;
      const lowerGeo = mergeGeometries([
        taperedTube([V(0, 0, 0), V(0, -0.35, 0), V(0, -0.41, 0.005)], [0.048, 0.04, 0.054], [0.048, 0.04, 0.054], {
          rings: 5,
          radial: 8,
          color: () => lowerColor,
        }),
        ellipsoid(V(0.054, 0.054, 0.064), V(0, -0.4, 0.005), () => lowerColor, [8, 6]),
        paint(new THREE.CylinderGeometry(0.055, 0.072, 0.1, 10).translate(0, -0.45, 0.006), C.hoof),
      ]);

      const pivot = new THREE.Group();
      pivot.position.set(d.x, 0.95, d.z);
      pivot.add(mesh(upperGeo));
      const lower = new THREE.Group();
      lower.position.set(0, -0.55, 0);
      lower.add(mesh(lowerGeo));
      pivot.add(lower);
      this.body.add(pivot);
      this.legs.push({ pivot, lower, front: d.front });
    }

    // ── Silla: manta con ribete, asiento, perilla, cantle, faldones, estribos ──
    const saddleParts = [
      ellipsoid(V(0.36, 0.03, 0.47), V(0, 1.488, 0.04), () => C.trim, [14, 6]),
      ellipsoid(V(0.335, 0.034, 0.44), V(0, 1.5, 0.04), () => C.blanket, [14, 6]),
      ellipsoid(V(0.22, 0.04, 0.3), V(0, 1.55, 0.07), () => C.leather, [14, 8]),
      ellipsoid(V(0.04, 0.045, 0.04), V(0, 1.585, -0.2), () => C.leatherDark, [8, 6]),
      ellipsoid(V(0.17, 0.05, 0.06), V(0, 1.58, 0.34), () => C.leather, [10, 6]),
      ellipsoid(V(0.035, 0.14, 0.24), V(0.285, 1.42, 0.04), () => C.leatherDark, [8, 6]),
      ellipsoid(V(0.035, 0.14, 0.24), V(-0.285, 1.42, 0.04), () => C.leatherDark, [8, 6]),
    ];
    for (const sx of [-1, 1]) {
      const strap = new THREE.BoxGeometry(0.016, 0.4, 0.034);
      strap.translate(sx * 0.33, 1.27, 0.07);
      saddleParts.push(paint(strap, C.leather));
      const iron = new THREE.TorusGeometry(0.06, 0.009, 6, 14);
      iron.rotateY(Math.PI / 2);
      iron.translate(sx * 0.33, 1.04, 0.07);
      saddleParts.push(paint(iron, C.metal));
    }
    this.body.add(mesh(mergeGeometries(saddleParts), tackMat));
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

  /** Animación de marcha: patas con flexión, cuerpo, cuello, orejas y cola */
  _animate(delta) {
    this._idleTime += delta;
    const t = this._idleTime;
    const speedFactor = Math.min(1, this.velocity / 2.2);

    // Frecuencia de zancada proporcional a la velocidad (≈1.75 ciclos/s a 2.6 m/s)
    this._gaitPhase += delta * (this.velocity * 4.2);
    const phase = this._gaitPhase;

    // Marcha diagonal: delantera izq + trasera der en fase, las otras opuestas
    const offsets = [0, Math.PI, Math.PI, 0];
    const amp = 0.46 * speedFactor;
    this.legs.forEach((leg, i) => {
      const a = phase + offsets[i];
      leg.pivot.rotation.x = Math.sin(a) * amp * (leg.front ? 1 : 0.9);
      // Al adelantar la pata (coseno > 0) se flexiona la rodilla/corvejón para que el casco no arrastre
      leg.lower.rotation.x = -Math.max(0, Math.cos(a)) * 0.95 * speedFactor * (leg.front ? 1 : 0.8);
    });

    // Pisadas: una por cada medio ciclo
    const half = Math.floor(phase / Math.PI);
    if (half !== this._lastStepHalf) {
      this._lastStepHalf = half;
      if (this.velocity > 0.3 && this.onStep) this.onStep(Math.min(1, this.velocity / this.maxSpeed));
    }

    // Tronco: rebote leve y balanceo (poco amplio: confort en VR)
    this.body.position.y = BODY_LIFT + Math.abs(Math.sin(phase)) * 0.012 * speedFactor;
    this.body.rotation.z = Math.sin(phase) * 0.014 * speedFactor;

    // Cuello y cabeza: cabeceo al caminar + respiración en reposo
    this.neck.rotation.x = Math.sin(phase * 2) * 0.035 * speedFactor + Math.sin(t * 1.3) * 0.012;
    this.head.rotation.x = Math.sin(phase * 2 + 0.6) * 0.05 * speedFactor + Math.sin(t * 0.5) * 0.015;

    // Orejas: giran un poco y de vez en cuando se mueven (cada una a su ritmo)
    this.ears.forEach((e, i) => {
      const flick = Math.pow(Math.max(0, Math.sin(t * (0.55 + i * 0.17) + i * 2.1)), 14);
      e.pivot.rotation.z = e.baseZ + e.side * flick * 0.28;
      e.pivot.rotation.x = e.baseX + flick * 0.2 + Math.sin(phase * 2) * 0.03 * speedFactor;
    });

    // Cola: vaivén lateral y un poco más levantada al andar
    this.tail.rotation.z = Math.sin(t * 1.6 + phase) * (0.1 + 0.08 * speedFactor);
    this.tail.rotation.x = 0.05 * speedFactor + Math.sin(t * 2.1) * 0.04;
  }
}
