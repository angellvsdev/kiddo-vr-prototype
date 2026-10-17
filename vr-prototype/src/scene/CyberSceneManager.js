/**
 * CyberSceneManager.js
 * Orquestador del nivel "Cyber-Arena Cósmica":
 * - Pista ascendente futurista ("hacia arriba") curvada en 3D que trepa hacia el cosmos
 * - Rieles de luz de neón (cian y magenta), pórticos cibernéticos luminosos y plataforma cumbre
 * - 10 estrellas cósmicas 3D coleccionables distribuidas a lo largo de la rampa
 * - Controles de pedaleo físico, mandos Touch (Quest 3) y teclado ultra suaves y responsivos
 * - Cámara de seguimiento en tercera persona fluida y sin tirones en modo escritorio
 * - Portal de energía cósmica en la cumbre que, al ser cruzado, celebra y salta al siguiente nivel (Descenso en Bici)
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Environment } from './Environment.js';
import { SpatialAudioManager } from '../audio/SpatialAudioManager.js';
import { PedalController } from '../input/PedalController.js';
import { DeviceActionBridge } from '../services/DeviceActionBridge.js';

/**
 * Función matemática de elevación de la pista cósmica:
 * - z >= 6.0: Plataforma de arranque plana (y = 0.0)
 * - 6.0 > z > -58.0: Rampa ascendente suave hacia arriba hasta y = 18.0m
 * - z <= -58.0: Meseta cumbre del portal (y = 18.0m)
 */
export function getCyberTrackElevation(z) {
  if (z >= 6.0) return 0.0;
  if (z > -58.0) {
    const t = (6.0 - z) / 64.0; // Progreso normalizado [0..1]
    const smoothT = (1.0 - Math.cos(t * Math.PI)) / 2.0;
    return smoothT * 18.0;
  }
  return 18.0;
}

/**
 * Pendiente / inclinación angular de la pista en radianes para pitch del rig/cámara
 */
export function getCyberTrackSlope(z) {
  if (z >= 6.0 || z <= -58.0) return 0.0;
  const dz = 0.5;
  const dy = getCyberTrackElevation(z - dz) - getCyberTrackElevation(z + dz);
  return Math.atan2(dy, dz * 2);
}

export class CyberSceneManager {
  static meta = {
    id: 'cyber',
    title: 'Cyber-Arena Cósmica',
    hudTitle: '🌌 CYBER-ARENA CÓSMICA • QUEST 3',
    pageTitle: 'Cyber-Arena Cósmica VR — Meta Quest 3',
    modeHint: '🚴 <strong>Pedalea</strong> hacia arriba para recolectar estrellas y cruzar el portal | <strong>A/D</strong> para timonear',
    statusText: '🌌 Pista ascendente activa — Recolecta las 10 estrellas cósmicas y cruza el portal en la cima',
  };

  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {import('../vr/XRController.js').XRControllerManager} controllerManager
   */
  constructor(renderer, controllerManager) {
    this.renderer = renderer;
    this.controllerManager = controllerManager;
    this._disposers = [];

    // ─── 1. Escena y Cámara ───────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1500
    );
    this.camera.position.set(0, 1.6, 12.0);

    this.cameraRig = new THREE.Group();
    this.cameraRig.position.set(0, 0, 9.0);
    this.scene.add(this.cameraRig);
    this.scene.add(this.camera);

    if (this.controllerManager) {
      this.controllerManager.getGrips().forEach((grip) => this.cameraRig.add(grip));
    }

    // Controles de escritorio
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.set(0, 1.4, 3.0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;

    // Teclado
    this.keys = { w: false, a: false, s: false, d: false, space: false };
    const onKey = (e, isDown) => {
      const k = (e.key || '').toLowerCase();
      const code = (e.code || '').toLowerCase();
      if (k === 'w' || k === 'arrowup' || code === 'keyw' || code === 'arrowup')    this.keys.w = isDown;
      if (k === 's' || k === 'arrowdown' || code === 'keys' || code === 'arrowdown')  this.keys.s = isDown;
      if (k === 'a' || k === 'arrowleft' || code === 'keya' || code === 'arrowleft')  this.keys.a = isDown;
      if (k === 'd' || k === 'arrowright' || code === 'keyd' || code === 'arrowright') this.keys.d = isDown;
      if (k === ' ' || k === 'spacebar' || code === 'space')   this.keys.space = isDown;
      if (isDown) this.audioManager.init();
    };
    const onKeyDown = (e) => onKey(e, true);
    const onKeyUp = (e) => onKey(e, false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    this._disposers.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    });

    // ─── 2. Servicios Base ────────────────────────────────────────────────────
    this.audioManager = new SpatialAudioManager({ ambience: 'cyber' });
    this.pedalController = new PedalController();
    this.deviceBridge = new DeviceActionBridge();

    // ─── 3. Entorno Cibernético Original ──────────────────────────────────────
    this.environment = new Environment(this.scene);

    // ─── 4. Pista Cósmica Ascendente ("Hacia Arriba") ─────────────────────────
    this._buildAscendingTrack();

    // ─── 5. Estrellas Cósmicas Coleccionables ─────────────────────────────────
    this.starsCollected = 0;
    this.targetStars = 10;
    this.stars = [];
    this._buildCollectibleStars();

    // ─── 6. Portal Cósmico en la Cumbre (Meta) ────────────────────────────────
    this.goalPosition = new THREE.Vector3(0, 19.8, -68.0);
    this.goalRadius = 3.5;
    this._goalDone = false;
    this._buildGoalPortal();

    // ─── 7. HUD Holográfico en el Rig ─────────────────────────────────────────
    this._buildCyberHUD();

    // Variables de locomoción y progreso
    this.playerX = 0;
    this.playerZ = 9.0;
    this.velocity = 0;
    this.maxSpeed = 8.5; // m/s
    this.totalTime = 0;
    this._hudThrottle = 0;

    // Callback de finalización (salto al siguiente nivel: downhill)
    this.onLevelComplete = null;

    // Inicializar audio al primer clic
    const onInitAudio = () => this.audioManager.init();
    window.addEventListener('pointerdown', onInitAudio, { once: true });
    this._disposers.push(() => window.removeEventListener('pointerdown', onInitAudio));
  }

  // ─── Pista Ascendente ───────────────────────────────────────────────────────
  _buildAscendingTrack() {
    this.trackGroup = new THREE.Group();

    // 1. Superficie de la autopista con gradiente de elevación suave
    const zStart = 11.0;
    const zEnd = -72.0;
    const steps = 90;
    const trackWidth = 5.0;
    const halfW = trackWidth / 2;

    const positions = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const z = zStart + t * (zEnd - zStart);
      const y = getCyberTrackElevation(z);

      // Vértice izquierdo
      positions.push(-halfW, y, z);
      uvs.push(0, t * 24);

      // Vértice derecho
      positions.push(halfW, y, z);
      uvs.push(1, t * 24);

      if (i < steps) {
        const row1 = i * 2;
        const row2 = (i + 1) * 2;
        indices.push(row1, row2, row1 + 1);
        indices.push(row1 + 1, row2, row2 + 1);
      }
    }

    const trackGeo = new THREE.BufferGeometry();
    trackGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    trackGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    trackGeo.setIndex(indices);
    trackGeo.computeVertexNormals();

    const trackMat = new THREE.MeshStandardMaterial({
      color: 0x090e26,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.16,
      roughness: 0.2,
      metalness: 0.85,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    const trackMesh = new THREE.Mesh(trackGeo, trackMat);
    this.trackGroup.add(trackMesh);

    // 2. Rieles de luz de neón laterales continuos (Cian a la izquierda, Magenta a la derecha)
    const curveLeftPoints = [];
    const curveRightPoints = [];
    for (let i = 0; i <= 45; i++) {
      const t = i / 45;
      const z = zStart + t * (zEnd - zStart);
      const y = getCyberTrackElevation(z) + 0.35;
      curveLeftPoints.push(new THREE.Vector3(-halfW, y, z));
      curveRightPoints.push(new THREE.Vector3(halfW, y, z));
    }

    const curveL = new THREE.CatmullRomCurve3(curveLeftPoints);
    const curveR = new THREE.CatmullRomCurve3(curveRightPoints);

    const railGeoL = new THREE.TubeGeometry(curveL, 64, 0.08, 8, false);
    const railMatL = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    this.trackGroup.add(new THREE.Mesh(railGeoL, railMatL));

    const railGeoR = new THREE.TubeGeometry(curveR, 64, 0.08, 8, false);
    const railMatR = new THREE.MeshBasicMaterial({ color: 0xff007f });
    this.trackGroup.add(new THREE.Mesh(railGeoR, railMatR));

    // 3. Estacas / Balizas verticales bajo los rieles cada 6 metros
    for (let z = 9.0; z >= -68.0; z -= 6.0) {
      const y = getCyberTrackElevation(z);
      const pylonGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8);
      const pylonMat = new THREE.MeshBasicMaterial({ color: 0x2e1e68 });

      const pylonL = new THREE.Mesh(pylonGeo, pylonMat);
      pylonL.position.set(-halfW, y - 0.1, z);
      this.trackGroup.add(pylonL);

      const pylonR = new THREE.Mesh(pylonGeo, pylonMat);
      pylonR.position.set(halfW, y - 0.1, z);
      this.trackGroup.add(pylonR);
    }

    // 4. Línea discontinua luminosa en el carril central
    for (let z = 9.0; z >= -66.0; z -= 3.0) {
      const y = getCyberTrackElevation(z) + 0.02;
      const dashGeo = new THREE.PlaneGeometry(0.18, 1.4);
      const dashMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide });
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, y, z);
      this.trackGroup.add(dash);
    }

    // 5. Pórticos / Arcos cibernéticos luminosos a lo largo del ascenso
    const archPositions = [4.0, -8.0, -20.0, -32.0, -44.0, -56.0];
    archPositions.forEach((zArch, idx) => {
      const yArch = getCyberTrackElevation(zArch);
      const isCyan = idx % 2 === 0;
      const archGroup = new THREE.Group();
      archGroup.position.set(0, yArch, zArch);

      // Marco del arco (poste izquierdo, poste derecho y dintel superior)
      const colGeo = new THREE.BoxGeometry(0.2, 3.6, 0.2);
      const colMat = new THREE.MeshStandardMaterial({
        color: 0x141432,
        emissive: isCyan ? 0x00f0ff : 0xff007f,
        emissiveIntensity: 0.6,
      });

      const colL = new THREE.Mesh(colGeo, colMat);
      colL.position.set(-halfW - 0.2, 1.8, 0);
      archGroup.add(colL);

      const colR = new THREE.Mesh(colGeo, colMat);
      colR.position.set(halfW + 0.2, 1.8, 0);
      archGroup.add(colR);

      const lintelGeo = new THREE.BoxGeometry(trackWidth + 0.6, 0.2, 0.2);
      const lintel = new THREE.Mesh(lintelGeo, colMat);
      lintel.position.set(0, 3.6, 0);
      archGroup.add(lintel);

      // Chevron indicador central
      const chevGeo = new THREE.ConeGeometry(0.25, 0.5, 3);
      const chevMat = new THREE.MeshBasicMaterial({ color: isCyan ? 0x00f0ff : 0xff007f });
      const chev = new THREE.Mesh(chevGeo, chevMat);
      chev.rotation.x = Math.PI / 2;
      chev.position.set(0, 3.2, 0);
      archGroup.add(chev);

      this.trackGroup.add(archGroup);
    });

    // 6. Plataforma de lanzamiento inicial (y = 0)
    const launchGeo = new THREE.RingGeometry(2.5, 3.2, 32);
    const launchMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
    });
    const launchPad = new THREE.Mesh(launchGeo, launchMat);
    launchPad.rotation.x = -Math.PI / 2;
    launchPad.position.set(0, 0.03, 9.0);
    this.trackGroup.add(launchPad);

    // 7. Plataforma cumbre del portal (y = 18.0m)
    const summitPlatformGeo = new THREE.CylinderGeometry(5.2, 5.2, 0.4, 32);
    const summitPlatformMat = new THREE.MeshStandardMaterial({
      color: 0x101538,
      emissive: 0x6c63ff,
      emissiveIntensity: 0.35,
      roughness: 0.3,
      metalness: 0.8,
    });
    const summitPlatform = new THREE.Mesh(summitPlatformGeo, summitPlatformMat);
    summitPlatform.position.set(0, 17.8, -67.0);
    this.trackGroup.add(summitPlatform);

    const summitRingGeo = new THREE.RingGeometry(3.8, 4.4, 32);
    const summitRingMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const summitRing = new THREE.Mesh(summitRingGeo, summitRingMat);
    summitRing.rotation.x = -Math.PI / 2;
    summitRing.position.set(0, 18.02, -67.0);
    this.trackGroup.add(summitRing);

    this.scene.add(this.trackGroup);
  }

  // ─── Estrellas Cósmicas Coleccionables ──────────────────────────────────────
  _buildCollectibleStars() {
    const starConfigs = [
      { x:  0.0, z:   3.0 },
      { x: -1.2, z:  -4.0 },
      { x:  1.3, z: -11.0 },
      { x: -0.8, z: -18.0 },
      { x:  0.9, z: -25.0 },
      { x: -1.4, z: -32.0 },
      { x:  0.0, z: -39.0 },
      { x:  1.2, z: -46.0 },
      { x: -0.9, z: -53.0 },
      { x:  0.0, z: -60.0 },
    ];

    // Geometría de estrella 3D extruida de 5 puntas
    const starShape = new THREE.Shape();
    const points = 5;
    const outerR = 0.42;
    const innerR = 0.20;
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const sx = Math.cos(a) * r;
      const sy = Math.sin(a) * r;
      if (i === 0) starShape.moveTo(sx, sy);
      else starShape.lineTo(sx, sy);
    }
    starShape.closePath();

    const starGeo = new THREE.ExtrudeGeometry(starShape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.04,
      bevelThickness: 0.04,
    });
    starGeo.center();

    const starMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xffa500,
      emissiveIntensity: 0.85,
      roughness: 0.25,
      metalness: 0.7,
    });

    const haloGeo = new THREE.SphereGeometry(0.52, 16, 16);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffea00,
      transparent: true,
      opacity: 0.25,
    });

    starConfigs.forEach((cfg, idx) => {
      const starGroup = new THREE.Group();
      const yElevation = getCyberTrackElevation(cfg.z) + 1.25;
      starGroup.position.set(cfg.x, yElevation, cfg.z);

      const starMesh = new THREE.Mesh(starGeo, starMat);
      starGroup.add(starMesh);

      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      starGroup.add(haloMesh);

      this.scene.add(starGroup);

      this.stars.push({
        id: idx + 1,
        group: starGroup,
        mesh: starMesh,
        halo: haloMesh,
        baseY: yElevation,
        collected: false,
        phase: Math.random() * Math.PI * 2,
        scale: 1.0,
      });
    });
  }

  // ─── Portal Cósmico en la Cumbre (Meta) ──────────────────────────────────────
  _buildGoalPortal() {
    this.portalGroup = new THREE.Group();
    this.portalGroup.position.copy(this.goalPosition);

    // 1. Anillos concéntricos de energía rotatorios
    const ringGeo = new THREE.TorusGeometry(2.3, 0.10, 16, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    this.portalRing1 = new THREE.Mesh(ringGeo, ringMat);
    this.portalGroup.add(this.portalRing1);

    const innerGeo = new THREE.TorusGeometry(1.6, 0.08, 16, 36);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0xff007f });
    this.portalRing2 = new THREE.Mesh(innerGeo, innerMat);
    this.portalGroup.add(this.portalRing2);

    // 2. Vórtice luminoso central
    const vortexGeo = new THREE.CircleGeometry(1.5, 32);
    const vortexMat = new THREE.MeshBasicMaterial({
      color: 0x8a2be2,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
    });
    this.portalVortex = new THREE.Mesh(vortexGeo, vortexMat);
    this.portalGroup.add(this.portalVortex);

    // 3. Luz del portal
    this.portalLight = new THREE.PointLight(0x00f0ff, 3.0, 30);
    this.portalGroup.add(this.portalLight);

    // 4. Letrero holográfico de salto de nivel
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 140;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(8, 12, 32, 0.9)';
    ctx.roundRect(0, 0, 512, 140, 20);
    ctx.fill();
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 4;
    ctx.roundRect(4, 4, 504, 132, 16);
    ctx.stroke();

    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 32px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚡ PORTAL CÓSMICO ⚡', 256, 55);

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('SALTO AL SIGUIENTE NIVEL 🚵', 256, 105);

    const tex = new THREE.CanvasTexture(canvas);
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 0.75),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    banner.position.y = 3.0;
    this.portalGroup.add(banner);

    this.scene.add(this.portalGroup);
  }

  // ─── HUD Holográfico en el Rig ──────────────────────────────────────────────
  _buildCyberHUD() {
    this.hudCanvas = document.createElement('canvas');
    this.hudCanvas.width = 512;
    this.hudCanvas.height = 256;
    this.hudCtx = this.hudCanvas.getContext('2d');
    this.hudTex = new THREE.CanvasTexture(this.hudCanvas);

    const hudGeo = new THREE.PlaneGeometry(0.72, 0.36);
    const hudMat = new THREE.MeshBasicMaterial({
      map: this.hudTex,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    this.hudMesh = new THREE.Mesh(hudGeo, hudMat);
    // Posición ergonómica sobre el timón virtual (sin obstruir la vista de las estrellas y el portal)
    this.hudMesh.position.set(0, 0.55, -1.15);
    this.hudMesh.rotation.x = -0.65;
    this.cameraRig.add(this.hudMesh);

    // Dibujar estado inicial inmediatamente
    this._updateCyberHUD(0, 0, 0);
  }

  _updateCyberHUD(speedKmh, rpm, elevation) {
    const ctx = this.hudCtx;
    if (!ctx) return;

    ctx.clearRect(0, 0, 512, 256);

    // Fondo translúcido cibernético
    ctx.fillStyle = 'rgba(6, 10, 26, 0.85)';
    ctx.roundRect(0, 0, 512, 256, 24);
    ctx.fill();

    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 4;
    ctx.roundRect(4, 4, 504, 248, 20);
    ctx.stroke();

    // Título
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🌌 CYBER-ARENA • ASCENSO', 256, 42);

    // Velocidad y Cadencia
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`⚡ ${speedKmh.toFixed(1)} km/h`, 32, 98);

    ctx.fillStyle = '#a855f7';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(rpm)} RPM`, 480, 98);

    // Estrellas recogidas y altura
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 32px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`⭐ ${this.starsCollected} / ${this.targetStars}`, 32, 155);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`▲ +${elevation.toFixed(1)} m`, 480, 155);

    // Barra de progreso hacia la cumbre
    const progress = THREE.MathUtils.clamp((9.0 - this.playerZ) / 75.0, 0, 1);
    const barW = 448;
    const barH = 16;
    const barX = 32;
    const barY = 178;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.roundRect(barX, barY, barW, barH, 8);
    ctx.fill();

    ctx.fillStyle = '#00f0ff';
    ctx.roundRect(barX, barY, barW * progress, barH, 8);
    ctx.fill();

    // Mensaje de estado inferior
    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    if (this._goalDone) {
      ctx.fillStyle = '#4ade80';
      ctx.fillText('🎉 ¡Portal cruzado! Conectando siguiente nivel...', 256, 230);
    } else {
      ctx.fillText('Pedalea hacia arriba • Timonea para las estrellas', 256, 230);
    }

    this.hudTex.needsUpdate = true;
  }

  // ─── Gestión de Sesión WebXR ────────────────────────────────────────────────
  onSessionStart() {
    this.controls.enabled = false;
    this.cameraRig.add(this.camera);
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
    this.audioManager.init();
  }

  onSessionEnd() {
    this.scene.add(this.camera);
    this.controls.enabled = true;
    this.controls.update();
  }

  // ─── Bucle Principal de Actualización ───────────────────────────────────────
  update(delta, cs, frame) {
    this.totalTime += delta;
    const isPresenting = this.renderer.xr.isPresenting;

    // 1. Pedales físicos
    const pedalState = this.pedalController.update(delta);
    if (pedalState.strokeDetected) {
      this.audioManager.playCyberPulse(pedalState.power);
    }

    // 2. Determinar potencia y dirección efectiva
    let effectivePower = pedalState.power;
    let steerInput = 0;

    if (isPresenting) {
      // Mandos Touch Meta Quest 3
      const vrTrigger = Math.max(cs?.triggerR ?? 0, cs?.triggerL ?? 0);
      const vrStickY = -(cs?.move?.y ?? 0);
      const vrStickX = cs?.turn?.x ?? cs?.move?.x ?? 0;

      if (vrTrigger > 0.05 || vrStickY > 0.05) {
        effectivePower = Math.max(effectivePower, vrTrigger, vrStickY > 0 ? vrStickY : 0);
      }
      steerInput = vrStickX;
    } else {
      // Teclado en pantalla / escritorio
      if (this.keys.w || this.keys.space) {
        effectivePower = Math.max(effectivePower, 0.92);
      }
      if (this.keys.s) {
        effectivePower = 0;
      }
      if (this.keys.a) steerInput -= 1.0;
      if (this.keys.d) steerInput += 1.0;
    }

    // 3. Locomoción fluida sobre la autopista cósmica
    if (!this._goalDone) {
      const targetSpeed = effectivePower * this.maxSpeed;
      this.velocity = THREE.MathUtils.lerp(this.velocity, targetSpeed, delta * 3.5);

      // Avance hacia adelante (-Z)
      this.playerZ -= this.velocity * delta;
      // No permitir retroceder detrás de la salida
      this.playerZ = Math.min(9.5, this.playerZ);

      // Timón lateral suave con límites de la pista
      const steerSpeed = this.velocity > 0.5 ? 3.8 : 2.0;
      this.playerX += steerInput * steerSpeed * delta;
      this.playerX = THREE.MathUtils.clamp(this.playerX, -2.1, 2.1);

      // Altura e inclinación matemática según el ascenso
      const playerY = getCyberTrackElevation(this.playerZ);
      const slope = getCyberTrackSlope(this.playerZ);

      this.cameraRig.position.set(this.playerX, playerY, this.playerZ);
      // Inclinación hacia arriba al ascender
      this.cameraRig.rotation.x = -slope;
      // Inclinación y giro de timón leve
      this.cameraRig.rotation.y = -steerInput * 0.08;
      this.cameraRig.rotation.z = -steerInput * 0.12;

      // 4. Cámara en modo escritorio: seguimiento suave en tercera persona
      if (!isPresenting) {
        const targetCamPos = this.cameraRig.position.clone().add(new THREE.Vector3(0, 1.55, 3.2));
        const lookTarget = this.cameraRig.position.clone().add(new THREE.Vector3(0, 1.35, -6.0));

        this.camera.position.lerp(targetCamPos, 0.18);
        this.controls.target.lerp(lookTarget, 0.18);
        this.controls.update();
      }
    }

    // 5. Animación y recolección de estrellas cósmicas
    const playerHeadPos = new THREE.Vector3(
      this.playerX,
      getCyberTrackElevation(this.playerZ) + 1.25,
      this.playerZ
    );

    this.stars.forEach((star) => {
      if (star.collected) {
        if (star.scale > 0.01) {
          star.scale = Math.max(0, star.scale - delta * 4.0);
          star.group.scale.setScalar(star.scale);
          if (star.scale <= 0.01) {
            this.scene.remove(star.group);
          }
        }
        return;
      }

      // Animación de giro y levitación
      star.mesh.rotation.y += delta * 2.4;
      star.mesh.rotation.z += delta * 0.9;
      star.group.position.y = star.baseY + Math.sin(this.totalTime * 3.2 + star.phase) * 0.12;

      // Comprobar colisión de recolección
      const dist = playerHeadPos.distanceTo(star.group.position);
      if (dist < 1.7) {
        star.collected = true;
        this.starsCollected++;

        // Sonido de tintineo pentatónico
        this.audioManager.playPearlChime(this.starsCollected);
        // Haptic feedback en mandos VR
        this.controllerManager?.triggerHaptic?.(0.75, 140);

        // Notificar al hardware externo
        this.deviceBridge.onPearlCollected({
          pearlId: `star-${this.starsCollected}`,
          total: this.starsCollected,
          at: 'cyber',
        });
      }
    });

    // 6. Actualizar portal cumbre
    if (this.portalRing1) this.portalRing1.rotation.z += delta * 1.6;
    if (this.portalRing2) this.portalRing2.rotation.z -= delta * 2.2;
    if (this.portalVortex) this.portalVortex.rotation.z += delta * 0.8;

    // 7. Comprobar llegada al portal cósmico en la cima
    const distToPortal = this.cameraRig.position.distanceTo(this.goalPosition);
    if (!this._goalDone && (this.playerZ <= -65.5 || distToPortal < this.goalRadius)) {
      this._onGoalReached();
    }

    // 8. Actualizar HUD cada 0.1s
    this._hudThrottle += delta;
    if (this._hudThrottle > 0.1) {
      this._hudThrottle = 0;
      const speedKmh = this.velocity * 3.6;
      const effectiveRpm = this.velocity > 0.2 ? Math.round(this.velocity * 11) : pedalState.cadenceRpm;
      this._updateCyberHUD(speedKmh, effectiveRpm, getCyberTrackElevation(this.playerZ));
    }

    // 9. Actualizar cielo estelar
    this.environment.update(delta);
  }

  // ─── Meta Alcanzada: Salto al Siguiente Nivel ───────────────────────────────
  _onGoalReached() {
    this._goalDone = true;
    this.velocity = 0;
    this.audioManager.playVictoryFanfare();
    this.controllerManager?.triggerHaptic?.(1.0, 600);

    // Notificar al puente de hardware externo
    this.deviceBridge.onGoalReached({
      totalTimeSec: Math.round(this.totalTime),
      totalStars: this.starsCollected,
      distanceMeters: 78,
    });

    // Crear banner 3D holográfico de salto de nivel
    this._showVictoryBanner();

    // Salto automático al siguiente nivel (Descenso en Bici) tras 3.8 segundos
    setTimeout(() => {
      if (this.onLevelComplete) {
        this.onLevelComplete('cyber', 'downhill');
      }
    }, 3800);
  }

  _showVictoryBanner() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(7, 12, 28, 0.95)';
    ctx.roundRect(0, 0, 1024, 512, 32);
    ctx.fill();

    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 6;
    ctx.roundRect(6, 6, 1012, 500, 26);
    ctx.stroke();

    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏆 ¡PORTAL CÓSMICO ATRAVESADO!', 512, 85);

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.fillText(`⭐ Has recolectado ${this.starsCollected} de ${this.targetStars} estrellas`, 512, 160);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '28px system-ui, sans-serif';
    ctx.fillText(`⏱️ Tiempo de ascenso: ${Math.round(this.totalTime)} segundos • Altura: +18.0 m`, 512, 235);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText('🚵 Pasando al siguiente nivel: Descenso en Bici...', 512, 380);

    const texture = new THREE.CanvasTexture(canvas);
    const planeGeo = new THREE.PlaneGeometry(2.8, 1.4);
    const planeMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const banner = new THREE.Mesh(planeGeo, planeMat);

    // Posicionar a 2m frente al usuario
    banner.position.copy(this.cameraRig.position).add(new THREE.Vector3(0, 1.4, -2.0));
    this.scene.add(banner);
  }

  getTelemetry() {
    return {
      pedalState: this.pedalController.state,
      effectiveRpm: Math.round(this.velocity * 12),
      pearlsCount: this.starsCollected,
      targetPearls: this.targetStars,
    };
  }

  dispose() {
    this._disposers.forEach((fn) => fn());
    this._disposers.length = 0;
    this.controls?.dispose();

    // Desacoplar objetos persistentes (cámara, rig, mandos) antes de limpiar la escena
    if (this.controllerManager) {
      this.controllerManager.getGrips().forEach((grip) => {
        if (grip.parent) grip.parent.remove(grip);
      });
    }
    if (this.camera && this.camera.parent) {
      this.camera.parent.remove(this.camera);
    }
    if (this.cameraRig && this.cameraRig.parent) {
      this.cameraRig.parent.remove(this.cameraRig);
    }

    this.environment?.dispose();
    this.scene.remove(this.portalGroup);
    this.scene.remove(this.trackGroup);
    this.stars.forEach((s) => this.scene.remove(s.group));

    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach((m) => {
        m.map?.dispose?.();
        m.dispose?.();
      });
    });
  }
}
