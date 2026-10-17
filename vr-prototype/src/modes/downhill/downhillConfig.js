/**
 * downhillConfig.js
 * Parámetros del modo "Descenso en bicicleta contra el reloj".
 * Todas las magnitudes en unidades SI: metros, segundos, m/s, m/s².
 * Ajusta aquí la sensación de juego sin tocar la lógica.
 */
export const DOWNHILL_CONFIG = {
  // ─── Pista ────────────────────────────────────────────────────────────────
  seed: 1337,                 // semilla determinista: misma pista en cada sesión
  controlPoints: 14,          // puntos de control de la curva (más = más sinuosa)
  segmentRun: 70,             // avance horizontal (m) entre puntos de control
  segmentDrop: 14,            // desnivel (m) entre puntos de control → pendiente ~20 %
  roadHalfWidth: 4,           // mitad del ancho de la pista (m)
  shoulderHalfWidth: 60,      // franja de ladera a cada lado (visual)
  maxLateral: 3.2,            // desplazamiento lateral máximo sobre la pista (m)
  sampleStep: 1.5,            // resolución de la malla de la pista (m)

  // ─── Física ───────────────────────────────────────────────────────────────
  gravity: 9.81,
  rollingResistance: 0.02,    // coeficiente de rodadura
  aeroDrag: 0.012,            // arrastre aerodinámico (a = -k·v²)
  maxSpeed: 24,               // m/s (~86 km/h)
  maxBrakeDecel: 14,          // deceleración máxima con frenos (m/s²)
  steerSpeed: 3.2,            // velocidad lateral con el giro completo (m/s)

  // ─── Salida con pedaleo ───────────────────────────────────────────────────
  sprintLength: 60,           // tramo inicial (m) donde el pedaleo acelera
  sprintAccel: 5.5,           // aceleración a potencia completa de pedal (m/s²)
  backPedalThreshold: 0.6,    // presión mínima en ambos pedales para frenar hacia atrás

  // ─── Reglas de carrera ────────────────────────────────────────────────────
  countdownSec: 3,
  checkpointFractions: [0.33, 0.66], // checkpoints en fracciones de la pista
  obstacleSpacing: 25,        // m entre huecos donde puede aparecer un obstáculo
  obstacleChance: 0.5,        // probabilidad de obstáculo por hueco
  obstacleLength: 1.2,        // m: ventana de colisión en el sentido de avance
  obstacleWidth: 1.1,         // m: ventana de colisión lateral
  crashSpeedFactor: 0.5,      // la velocidad se multiplica por este valor al chocar
  crashPenaltySec: 2,         // segundos añadidos al tiempo final por choque

  // ─── Monedas ──────────────────────────────────────────────────────────────
  coinTrails: 16,             // cadenas de monedas repartidas por la pista
  coinsPerTrail: 6,           // monedas por cadena
  coinSpacing: 8,             // m entre monedas de una misma cadena
  coinAmplitude: 1.6,         // m: la cadena zigzaguea a izquierda y derecha
  coinLength: 1.2,            // m: ventana de recogida en el sentido de avance
  coinWidth: 1.0,             // m: ventana de recogida lateral
  coinBonusSec: 0.5,          // segundos restados por moneda (× multiplicador de racha)
  maxStreakMultiplier: 4,     // tope del multiplicador de racha
};
