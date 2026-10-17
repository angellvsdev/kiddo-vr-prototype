/**
 * SpatialAudioManager.js
 * Sistema de audio espacial y procedural con Web Audio API.
 * Genera efectos sonoros inmersivos de alta calidad sin depender de archivos de audio externos:
 * - Sonido ambiental de oleaje costero (surf / olas continuas)
 * - Sonido de chapoteo y remo al pedalear
 * - Tintineo cristalino armónico al recoger perlas
 * - Fanfarria triunfal al llegar a la boya
 */
export class SpatialAudioManager {
  /**
   * @param {{ ambience?: 'ocean'|'llano' }} options - Paisaje sonoro de fondo del nivel
   */
  constructor({ ambience = 'ocean' } = {}) {
    this.ambience = ambience;
    this.ctx = null;
    this.masterGain = null;
    this.surfGain = null;
    this.isMuted = false;
    this._initialized = false;
  }

  /** Inicializa el AudioContext tras la primera interacción del usuario */
  init() {
    if (this._initialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      if (this.ambience === 'llano') this._startLlanoAmbience();
      else if (this.ambience === 'cyber' || this.ambience === 'lobby') this._startCyberAmbience(this.ambience === 'lobby' ? 0.06 : 0.12);
      else this._startOceanSurf();
      this._initialized = true;
    } catch (e) {
      console.warn('[Audio] Error inicializando Web Audio:', e);
    }
  }

  _ensureContext() {
    if (!this._initialized) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Genera ruido rosa/marino filtrado continuo simulando las olas del mar
   */
  _startOceanSurf() {
    if (!this.ctx) return;

    const bufferSize = this.ctx.sampleRate * 4;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
      b6 = white * 0.115926;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // Filtro pasa-bajos que se modula suavemente simulando el ir y venir de las olas
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, this.ctx.currentTime);
    filter.Q.setValueAtTime(1.5, this.ctx.currentTime);

    // LFO para modular la frecuencia del filtro (ciclo de oleaje cada 5 segundos)
    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.2, this.ctx.currentTime);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(220, this.ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    this.surfGain = this.ctx.createGain();
    this.surfGain.gain.setValueAtTime(0.4, this.ctx.currentTime);

    whiteNoise.connect(filter);
    filter.connect(this.surfGain);
    this.surfGain.connect(this.masterGain);

    whiteNoise.start();
    lfo.start();
  }

  /**
   * Ambiente del llano al atardecer: viento suave entre el pasto + grillos intermitentes
   */
  _startLlanoAmbience() {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // Viento: ruido blanco filtrado con una modulación lenta de la banda
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const out = buf.getChannelData(0);
    for (let i = 0; i < len; i++) out[i] = (Math.random() * 2 - 1) * 0.5;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(520, ctx.currentTime);
    band.Q.setValueAtTime(0.7, ctx.currentTime);
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.11, ctx.currentTime);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(240, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(band.frequency);

    this.windGain = ctx.createGain();
    this.windGain.gain.setValueAtTime(0.16, ctx.currentTime);
    noise.connect(band);
    band.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    noise.start();
    lfo.start();

    // Grillos: tono agudo con trémolo rápido, compuerta abierta/cerrada por un LFO lento
    const cricket = ctx.createOscillator();
    cricket.type = 'sine';
    cricket.frequency.setValueAtTime(4300, ctx.currentTime);
    const trem = ctx.createGain();
    trem.gain.setValueAtTime(0, ctx.currentTime);
    const chirp = ctx.createOscillator();
    chirp.type = 'square';
    chirp.frequency.setValueAtTime(28, ctx.currentTime);
    const chirpDepth = ctx.createGain();
    chirpDepth.gain.setValueAtTime(0.012, ctx.currentTime);
    chirp.connect(chirpDepth);
    chirpDepth.connect(trem.gain);
    const phrase = ctx.createOscillator();
    phrase.frequency.setValueAtTime(0.35, ctx.currentTime);
    const phraseDepth = ctx.createGain();
    phraseDepth.gain.setValueAtTime(0.012, ctx.currentTime);
    phrase.connect(phraseDepth);
    phraseDepth.connect(trem.gain);
    cricket.connect(trem);
    trem.connect(this.masterGain);
    cricket.start();
    chirp.start();
    phrase.start();
  }

  /**
   * Zumbido sintetizado espacial cyberpunk para Cyber-Arena y Lobby
   */
  _startCyberAmbience(gainLevel = 0.12) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(55, ctx.currentTime);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, ctx.currentTime);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainLevel, ctx.currentTime);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
  }

  /**
   * Pulso de energía cinética al pedalear en la Cyber-Arena
   * @param {number} strength - Intensidad [0..1]
   */
  playCyberPulse(strength = 0.5) {
    this._ensureContext();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.15);
    const volume = Math.min(0.25, Math.max(0.04, strength * 0.25));
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  /**
   * Pisada de casco sobre tierra seca
   * @param {number} strength - Intensidad [0..1] según velocidad del caballo
   */
  playHoofBeat(strength = 0.5) {
    this._ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.08);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, t);

    const volume = Math.min(0.3, Math.max(0.06, strength * 0.3));
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  /**
   * Sonido de chapoteo de agua al pedalear
   * @param {number} strength - Intensidad proporcional a la cadencia [0..1]
   */
  playPedalSplash(strength = 0.5) {
    this._ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.25);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, t);
    filter.Q.setValueAtTime(3.0, t);

    const volume = Math.min(0.35, Math.max(0.05, strength * 0.35));
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.32);
  }

  /**
   * Tintineo cristalino al recoger una perla (arpegio brillante con campana)
   * @param {number} comboIndex - Número de perla consecutiva para variar el tono
   */
  playPearlChime(comboIndex = 0) {
    this._ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const baseFreqs = [880, 1046.5, 1318.5, 1567.9, 1760]; // Escala pentatónica aguda
    const freq = baseFreqs[comboIndex % baseFreqs.length];

    [freq, freq * 1.5, freq * 2.0].forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t + idx * 0.04);

      const amp = 0.2 / (idx + 1);
      gain.gain.setValueAtTime(0.001, t + idx * 0.04);
      gain.gain.linearRampToValueAtTime(amp, t + idx * 0.04 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + idx * 0.04 + 0.75);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t + idx * 0.04);
      osc.stop(t + idx * 0.04 + 0.8);
    });
  }

  /**
   * Fanfarria triunfal al alcanzar la boya de llegada
   */
  playVictoryFanfare() {
    this._ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = [
      { f: 523.25, time: 0.00, dur: 0.25 }, // C5
      { f: 659.25, time: 0.20, dur: 0.25 }, // E5
      { f: 783.99, time: 0.40, dur: 0.35 }, // G5
      { f: 1046.5, time: 0.70, dur: 0.90 }, // C6
    ];

    notes.forEach(n => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, t + n.time);

      gain.gain.setValueAtTime(0.001, t + n.time);
      gain.gain.linearRampToValueAtTime(0.28, t + n.time + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + n.time + n.dur);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t + n.time);
      osc.stop(t + n.time + n.dur + 0.05);
    });
  }
}
