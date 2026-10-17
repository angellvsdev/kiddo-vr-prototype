/**
 * downhillPhysics.js
 * Física del descenso en funciones puras (sin Three.js ni DOM).
 * Así se pueden probar con `node --test`.
 *
 * Modelo: la bicicleta avanza a lo largo de la pista. Sobre ella actúan:
 *  - Gravedad proyectada sobre la pendiente:  a_g = g · sinθ
 *  - Rodadura:                                a_r = -Crr · g   (solo si rueda)
 *  - Arrastre aerodinámico:                   a_d = -k · v²
 *  - Frenos:                                  a_b = -freno · a_max
 *  - Pedaleo (solo en el tramo de salida):    a_p = potencia · a_sprint
 */

/**
 * Aceleración a lo largo de la pista.
 * @param {object} p
 * @param {number} p.speed      - velocidad actual (m/s, ≥ 0)
 * @param {number} p.slope      - seno de la pendiente en la dirección de avance (> 0 = bajada)
 * @param {number} p.brake      - freno normalizado [0, 1]
 * @param {number} p.sprint     - potencia de pedaleo normalizada [0, 1]
 * @param {boolean} p.inSprint  - true mientras dure el tramo de salida
 * @param {object} cfg          - DOWNHILL_CONFIG
 * @returns {number} aceleración (m/s²)
 */
export function longitudinalAccel({ speed, slope, brake, sprint, inSprint }, cfg) {
  let a = cfg.gravity * slope;
  if (speed > 0) a -= cfg.rollingResistance * cfg.gravity;
  a -= cfg.aeroDrag * speed * speed;
  a -= clamp01(brake) * cfg.maxBrakeDecel;
  if (inSprint) a += clamp01(sprint) * cfg.sprintAccel;
  return a;
}

/**
 * Integra la velocidad un paso de tiempo. No permite marcha atrás ni supera maxSpeed.
 */
export function integrateSpeed(speed, accel, dt, maxSpeed) {
  const next = speed + accel * dt;
  return Math.min(Math.max(next, 0), maxSpeed);
}

/**
 * Desplazamiento lateral sobre la pista, limitado al ancho jugable.
 * @param {number} lateral - posición actual (m, + = derecha)
 * @param {number} steer   - giro normalizado [-1, 1]
 */
export function integrateLateral(lateral, steer, dt, cfg) {
  const next = lateral + clamp(steer, -1, 1) * cfg.steerSpeed * dt;
  return clamp(next, -cfg.maxLateral, cfg.maxLateral);
}

/**
 * Freno efectivo a partir de todas las fuentes de entrada.
 * Los pedales hacia atrás (ambos presionados) frenan, como en un BMX.
 * @returns {number} [0, 1]
 */
export function resolveBrake({ triggerL = 0, triggerR = 0, keyBrake = false, pedalLeft = 0, pedalRight = 0 }, cfg) {
  const backPedalMin = Math.min(pedalLeft, pedalRight);
  const threshold = cfg.backPedalThreshold;
  const backPedal = backPedalMin > threshold ? (backPedalMin - threshold) / (1 - threshold) : 0;
  return clamp01(Math.max(triggerL, triggerR, keyBrake ? 1 : 0, backPedal));
}

/** Velocidad tras un choque. */
export function applyCrash(speed, cfg) {
  return speed * cfg.crashSpeedFactor;
}

/**
 * Determina si la bicicleta colisiona con un obstáculo.
 * @returns {boolean}
 */
export function collidesWith(obstacle, s, lateral, cfg) {
  return Math.abs(obstacle.s - s) < cfg.obstacleLength && Math.abs(obstacle.lateral - lateral) < cfg.obstacleWidth;
}

/** Determina si la bicicleta recoge una moneda. */
export function collectsCoin(coin, s, lateral, cfg) {
  return Math.abs(coin.s - s) < cfg.coinLength && Math.abs(coin.lateral - lateral) < cfg.coinWidth;
}

/**
 * Segundos restados por una moneda según la racha (monedas seguidas sin fallar).
 * @param {number} streak - número de monedas consecutivas, contando esta (≥ 1)
 */
export function coinBonus(streak, cfg) {
  return cfg.coinBonusSec * Math.min(streak, cfg.maxStreakMultiplier);
}

/** Mulberry32: PRNG determinista (misma pista para la misma semilla). */
export function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function clamp01(v) {
  return clamp(v, 0, 1);
}
