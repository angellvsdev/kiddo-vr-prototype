/**
 * DownhillMode.js
 * Modo "Descenso en bicicleta contra el reloj" (un corredor a la vez).
 *
 * Fases:  idle → countdown → running → finished  (R o A+B para reiniciar)
 *
 * Contrato con el programa anfitrión (todo opcional salvo renderer, camera y rig):
 *   renderer  THREE.WebGLRenderer          (para saber si hay sesión XR activa)
 *   camera    THREE.PerspectiveCamera      (hija del rig)
 *   rig       THREE.Group                  (cameraRig compartido; lo mueve ModeManager)
 *   pedal     PedalController              (opcional: pedaleo y frenos hacia atrás)
 *   audio     { setAmbienceEnabled, playPedalSplash, playPearlChime, playVictoryFanfare }
 *   bridge    { onRaceEvent } o { driver: { sendEvent } }   (opcional)
 *
 * Si el host no ofrece audio o bridge, el modo funciona igual: los eventos
 * caen en el evento DOM 'external-device-action' y el sonido se omite.
 */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { DOWNHILL_CONFIG as C } from './downhillConfig.js';
import { DownhillTrack } from './DownhillTrack.js';
import { DownhillBike } from './DownhillBike.js';
import { DownhillHUD, formatTime } from './DownhillHUD.js';
import { DownhillInput } from './DownhillInput.js';
import {
  longitudinalAccel,
  integrateSpeed,
  integrateLateral,
  applyCrash,
  collidesWith,
  collectsCoin,
  coinBonus,
  clamp,
} from './downhillPhysics.js';

const MAX_DT = 1 / 30;

export class DownhillMode {
  /**
   * @param {object} shared - servicios del host (ver cabecera)
   * @param {object} [cfg]  - DOWNHILL_CONFIG (sobrescribible)
   */
  constructor({ renderer, camera, rig, pedal = null, audio = null, bridge = null }, cfg = C) {
    this.renderer = renderer;
    this.camera = camera;
    this.rig = rig;
    this.pedal = pedal;
    this.audio = audio;
    this.bridge = bridge;
    this.cfg = cfg;

    this.scene = new THREE.Scene();
    this._buildAtmosphere();

    this.track = new DownhillTrack(this.scene, cfg);
    this.bike = new DownhillBike();
    this.hud = new DownhillHUD();
    this.input = new DownhillInput();

    this.rig.add(this.bike.group, this.hud.mesh);
    this.bike.setVisible(false);
    this.hud.mesh.visible = false;

    this._resetRace();
  }

  // ─── Ciclo de vida (interfaz común con ModeManager) ───────────────────────

  enter() {
    this._resetRace();
    this.bike.setVisible(true);
    this.hud.mesh.visible = true;
    this._sfx('setAmbienceEnabled', false); // sin oleaje marino en la montaña

    if (this.renderer && !this.renderer.xr.isPresenting) {
      // En escritorio la cámara no tiene altura propia: la fijamos a la de un ciclista
      // agachado. La inclinación baja la vista para que el manillar y la rueda se vean.
      this.camera.position.set(0, 1.35, 0);
      this.camera.rotation.set(-0.2, 0, 0);
    }
  }

  exit() {
    this.bike.setVisible(false);
    this.hud.mesh.visible = false;
    this._sfx('setAmbienceEnabled', true);
  }

  /**
   * @param {number} delta
   * @param {{controls?: object}} ctx - controls: estado de los mandos XR (puede faltar)
   */
  update(delta, { controls = null } = {}) {
    const dt = Math.min(delta, MAX_DT);
    // Solo el modo activo lee el pedal: así se lee una vez por frame
    const pedalState = this.pedal ? this.pedal.update(delta) : null;

    this.distanceDelta = 0;
    const i = this.input.read(controls, pedalState);
    this.steer = i.steer;

    if (i.reset) this._resetRace();

    switch (this.phase) {
      case 'idle':
        if (i.start) this._beginCountdown();
        break;
      case 'countdown':
        this._tickCountdown(dt);
        break;
      case 'running':
        this._step(dt, i, pedalState);
        break;
      default:
        break; // finished: solo espera reinicio
    }

    this.track.update(dt);
    this._syncRig();
    this.hud.update(dt, this._hudData());
  }

  dispose() {
    this.input.dispose();
    this.track.dispose();
    this.hud.dispose();
    this.bike.group.removeFromParent();
  }

  // ─── Fases de la carrera ──────────────────────────────────────────────────

  _beginCountdown() {
    this.phase = 'countdown';
    this.countdown = this.cfg.countdownSec;
    this.message = 'Preparados…';
  }

  _tickCountdown(dt) {
    this.countdown -= dt;
    if (this.countdown > 0) {
      this.message = `${Math.ceil(this.countdown)}`;
      return;
    }
    this.phase = 'running';
    this.raceTime = 0;
    this.message = '¡YA!';
    this._emit('RACE_START', { lengthM: Math.round(this.track.length) });
  }

  _step(dt, i, pedalState) {
    const tangent = this.track.tangentAt(this.s);
    const slope = -tangent.y; // > 0 en bajada

    const accel = longitudinalAccel(
      { speed: this.v, slope, brake: i.brake, sprint: i.sprint, inSprint: this.s < this.cfg.sprintLength },
      this.cfg,
    );

    const prevS = this.s;
    this.v = integrateSpeed(this.v, accel, dt, this.cfg.maxSpeed);
    this.s = Math.min(this.s + this.v * dt, this.track.length);
    this.lateral = integrateLateral(this.lateral, i.steer, dt, this.cfg);
    this.raceTime += dt;
    this.distanceDelta = this.s - prevS;

    if (this.s < this.cfg.sprintLength && pedalState?.strokeDetected) {
      this._sfx('playPedalSplash', pedalState.power);
    }

    this._checkGates();
    this._checkObstacles();
    this._checkCoins();

    if (this.s >= this.track.length) this._finish();
  }

  _checkGates() {
    for (const g of this.track.gates) {
      if (g.passed || g.index < 0 || this.s < g.s) continue;

      g.passed = true;
      g.bar.color.setHex(0x22c55e);
      g.bar.emissive.setHex(0x22c55e);

      const timeSec = round2(this.raceTime);
      this.splits.push({ index: g.index, timeSec });
      this.message = `Checkpoint ${g.index + 1}`;
      this._emit('CHECKPOINT', { checkpoint: g.index + 1, timeSec });
      this._sfx('playPearlChime', this.splits.length);
    }
  }

  _checkObstacles() {
    this.track.obstacles.forEach((o, id) => {
      if (o.hit || !collidesWith(o, this.s, this.lateral, this.cfg)) return;

      o.hit = true;
      o.group.visible = false;
      this.v = applyCrash(this.v, this.cfg);
      this.streak = 0;
      this.penalty += this.cfg.crashPenaltySec;
      this.message = `¡Choque! +${this.cfg.crashPenaltySec} s`;
      this._sfx('playPedalSplash', 1);
      this._emit('CRASH', { obstacle: id + 1, penaltySec: this.cfg.crashPenaltySec });
    });
  }

  /**
   * Recoge monedas. Cada moneda seguida suma más bonus (racha, con tope).
   * Fallar una moneda (pasar de largo) corta la racha.
   */
  _checkCoins() {
    for (const c of this.track.coins) {
      if (c.taken || c.missed) continue;

      if (collectsCoin(c, this.s, this.lateral, this.cfg)) {
        c.taken = true;
        c.group.visible = false;
        this.streak += 1;
        this.coinsTaken += 1;
        const bonus = coinBonus(this.streak, this.cfg);
        this.coinBonusSec += bonus;
        this.message = `🪙 −${bonus.toFixed(1)} s · racha ×${Math.min(this.streak, this.cfg.maxStreakMultiplier)}`;
        this._sfx('playPearlChime', this.streak);
        this._emit('COIN', { coins: this.coinsTaken, streak: this.streak });
      } else if (this.s > c.s + this.cfg.coinLength) {
        c.missed = true;
        this.streak = 0;
      }
    }
  }

  _finish() {
    this.s = this.track.length;
    this.v = 0;
    this.phase = 'finished';

    const totalTimeSec = this._netTime();
    this.message = `META · ${formatTime(totalTimeSec)} · R o A+B para reiniciar`;
    this._sfx('playVictoryFanfare');
    this._emit('RACE_FINISH', {
      totalTimeSec,
      penaltySec: this.penalty,
      coinBonusSec: round2(this.coinBonusSec),
      coins: this.coinsTaken,
      splits: this.splits,
    });
  }

  _resetRace() {
    this.phase = 'idle';
    this.s = 0;
    this.v = 0;
    this.lateral = 0;
    this.steer = 0;
    this.raceTime = 0;
    this.penalty = 0;
    this.countdown = 0;
    this.distanceDelta = 0;
    this.splits = [];
    this.streak = 0;
    this.coinsTaken = 0;
    this.coinBonusSec = 0;
    this.message = 'Pulsa W, un gatillo o pedalea para salir';

    for (const g of this.track.gates) {
      g.passed = false;
      g.bar.color.setHex(g.baseColor);
      g.bar.emissive.setHex(g.baseColor);
    }
    for (const o of this.track.obstacles) {
      o.hit = false;
      o.group.visible = true;
    }
    for (const c of this.track.coins) {
      c.taken = false;
      c.missed = false;
      c.group.visible = true;
    }
  }

  /** Tiempo final: tiempo de carrera + penalizaciones − bonus de monedas (nunca < 0). */
  _netTime() {
    return round2(Math.max(0, this.raceTime + this.penalty - this.coinBonusSec));
  }

  // ─── Sincronización con la cámara y la bicicleta ───────────────────────────

  _syncRig() {
    const s = this.s;
    const center = this.track.roadPoint(s, this.lateral);
    this.rig.position.copy(center);
    // Solo yaw: el horizonte se mantiene nivelado para no marear al usuario
    this.rig.rotation.set(0, this.track.headingAt(s), 0);

    const tangent = this.track.tangentAt(s);
    this.bike.update({
      distanceDelta: this.distanceDelta,
      steer: this.steer,
      slopeRad: Math.asin(clamp(-tangent.y, -1, 1)),
    });
  }

  _hudData() {
    return {
      phase: this.phase,
      time: this.raceTime,
      penalty: this.penalty,
      speedKmh: this.v * 3.6,
      progress: this.s / this.track.length,
      splits: this.splits,
      message: this.message,
      coinsTaken: this.coinsTaken,
      coinsTotal: this.track.coins.length,
      streak: this.streak,
      bonusSec: this.coinBonusSec,
    };
  }

  // ─── Integración: audio, bridge y eventos ─────────────────────────────────

  /** Llama a un efecto de sonido si el host lo ofrece. */
  _sfx(name, ...args) {
    this.audio?.[name]?.(...args);
  }

  /**
   * Envía un evento de carrera. Prioridad:
   *  1. bridge.onRaceEvent (si el host lo implementa)
   *  2. bridge.driver.sendEvent (drivers con soporte de eventos)
   *  3. evento DOM 'external-device-action' (siempre disponible)
   */
  _emit(type, payload) {
    const data = { event: type, ...payload, timestamp: Date.now() };
    if (this.bridge?.onRaceEvent) {
      this.bridge.onRaceEvent(type, payload);
    } else if (this.bridge?.driver?.sendEvent) {
      this.bridge.driver.sendEvent(data);
    }
    window.dispatchEvent(new CustomEvent('external-device-action', {
      detail: { type: 'RACE_EVENT', ...data, at: new Date().toLocaleTimeString() },
    }));
  }

  // ─── Atmósfera ─────────────────────────────────────────────────────────────

  _buildAtmosphere() {
    this.scene.background = new THREE.Color(0x9ec5e8);
    this.scene.fog = new THREE.FogExp2(0xb8d4e8, 0.0024);

    const sun = new THREE.Vector3().setFromSphericalCoords(
      1,
      THREE.MathUtils.degToRad(55),
      THREE.MathUtils.degToRad(200),
    );

    // Radio < far plane de la cámara (1200 m). Si se supera, el cielo queda recortado.
    const sky = new Sky();
    sky.scale.setScalar(1000);
    const u = sky.material.uniforms;
    u.turbidity.value = 4;
    u.rayleigh.value = 1.5;
    u.mieCoefficient.value = 0.005;
    u.mieDirectionalG.value = 0.8;
    u.sunPosition.value.copy(sun);
    this.scene.add(sky);

    this.scene.add(new THREE.HemisphereLight(0xdbeafe, 0x3f6b35, 1.0));
    const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
    sunLight.position.copy(sun).multiplyScalar(200);
    this.scene.add(sunLight);
  }
}

function round2(v) {
  return Math.round(v * 100) / 100;
}
