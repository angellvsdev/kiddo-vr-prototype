/**
 * Pruebas de la física del descenso (sin navegador ni Three.js).
 * Ejecutar con:  node --test src/modes/downhill/__tests__/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  longitudinalAccel,
  integrateSpeed,
  integrateLateral,
  resolveBrake,
  applyCrash,
  collidesWith,
  collectsCoin,
  coinBonus,
  createRng,
} from '../downhillPhysics.js';
import { DOWNHILL_CONFIG as C } from '../downhillConfig.js';

const DT = 1 / 60;

function simulate(seconds, { slope, brake = 0, sprint = 0, inSprint = false, v0 = 0 }) {
  let v = v0;
  for (let t = 0; t < seconds; t += DT) {
    const a = longitudinalAccel({ speed: v, slope, brake, sprint, inSprint }, C);
    v = integrateSpeed(v, a, DT, C.maxSpeed);
  }
  return v;
}

test('en bajada sin frenos la velocidad crece hasta un límite terminal', () => {
  const v60 = simulate(60, { slope: 0.2 });
  const v120 = simulate(120, { slope: 0.2 });
  assert.ok(v60 > 5 && v60 < C.maxSpeed, `v60=${v60}`);
  assert.ok(Math.abs(v120 - v60) < 0.5, `no converge: ${v60} vs ${v120}`);
});

test('en llano y parado no hay aceleración sin pedaleo', () => {
  assert.equal(longitudinalAccel({ speed: 0, slope: 0, brake: 0, sprint: 0, inSprint: true }, C), 0);
});

test('los frenos reducen la velocidad y nunca la hacen negativa', () => {
  const v = simulate(3, { slope: 0, brake: 1, v0: 10 });
  assert.ok(v >= 0, `v=${v}`);
  assert.equal(v, 0);
});

test('el pedaleo solo acelera dentro del tramo de salida', () => {
  const fuera = longitudinalAccel({ speed: 0, slope: 0, brake: 0, sprint: 1, inSprint: false }, C);
  const dentro = longitudinalAccel({ speed: 0, slope: 0, brake: 0, sprint: 1, inSprint: true }, C);
  assert.equal(fuera, 0);
  assert.equal(dentro, C.sprintAccel);
});

test('la velocidad no retrocede ni supera maxSpeed', () => {
  assert.equal(integrateSpeed(0.5, -10, 1, C.maxSpeed), 0);
  assert.equal(integrateSpeed(23, 100, 1, C.maxSpeed), C.maxSpeed);
});

test('el giro lateral respeta el ancho jugable', () => {
  assert.equal(integrateLateral(3, 1, 1, C), C.maxLateral);
  assert.equal(integrateLateral(-3, -1, 1, C), -C.maxLateral);
  assert.ok(Math.abs(integrateLateral(0, -1, 0.5, C) + C.steerSpeed * 0.5) < 1e-9);
});

test('la resolución de frenos combina las fuentes de entrada', () => {
  assert.equal(resolveBrake({ triggerR: 0.7 }, C), 0.7);
  assert.equal(resolveBrake({ keyBrake: true }, C), 1);
  assert.equal(resolveBrake({ pedalLeft: 0.9, pedalRight: 0.1 }, C), 0, 'un solo pedal no frena');
  assert.ok(resolveBrake({ pedalLeft: 0.9, pedalRight: 0.9 }, C) > 0, 'pedales atrás frenan');
});

test('un choque multiplica la velocidad por el factor configurado', () => {
  assert.equal(applyCrash(10, C), 10 * C.crashSpeedFactor);
});

test('la colisión depende de la distancia en ambos ejes', () => {
  const obstacle = { s: 100, lateral: 1 };
  assert.equal(collidesWith(obstacle, 100.5, 1.5, C), true);
  assert.equal(collidesWith(obstacle, 110, 1, C), false);
  assert.equal(collidesWith(obstacle, 100, 3, C), false);
});

test('el generador aleatorio es determinista para la misma semilla', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 10; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

test('una moneda se recoge solo dentro de su ventana', () => {
  const coin = { s: 100, lateral: 1 };
  assert.equal(collectsCoin(coin, 100.5, 1.2, C), true);
  assert.equal(collectsCoin(coin, 103, 1, C), false);       // demasiado lejos en s
  assert.equal(collectsCoin(coin, 100, -1, C), false);      // al otro lado de la pista
});

test('el bonus de racha crece por moneda y se topa en maxStreakMultiplier', () => {
  assert.equal(coinBonus(1, C), C.coinBonusSec);
  assert.equal(coinBonus(2, C), 2 * C.coinBonusSec);
  assert.equal(coinBonus(C.maxStreakMultiplier, C), C.maxStreakMultiplier * C.coinBonusSec);
  assert.equal(coinBonus(C.maxStreakMultiplier + 5, C), C.maxStreakMultiplier * C.coinBonusSec);
});

