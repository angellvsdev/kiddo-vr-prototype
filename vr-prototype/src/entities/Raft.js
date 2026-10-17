/**
 * Raft.js
 * Entidad de la balsa sobre la que navega el usuario:
 * - Modelo 3D detallado de troncos de madera, amarres de soga, banco y timón
 * - Rueda de palas / mecanismo mecánico que gira visiblemente al pedalear
 * - Dashboard holográfico flotante en la proa con telemetría en tiempo real:
 *     * Perlas recogidas
 *     * Cadencia (RPM) y Velocidad (km/h)
 *     * Distancia a la Boya
 *     * Estado del dispositivo externo
 * - Físicas hidrodinámicas: empuje por cadencia de pedales, resistencia del agua e inercia
 * - Flotabilidad reactiva en tiempo real (oleaje, cabeceo y balanceo con el océano)
 */
import * as THREE from 'three';

export class Raft {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../scene/CoastEnvironment.js').CoastEnvironment} environment
   * @param {THREE.Group} cameraRig
   */
  constructor(scene, environment, cameraRig) {
    this.scene = scene;
    this.environment = environment;
    this.cameraRig = cameraRig;

    // Posición inicial en la orilla del agua (x=0, z=-1.5)
    this.position = new THREE.Vector3(0, 0, -2.5);
    this.rotation = new THREE.Euler(0, Math.PI, 0); // mirando hacia el mar (z negativo)
    this.velocity = 0; // m/s
    this.maxSpeed = 5.5; // m/s (~20 km/h al pedalear rápido)
    this.dragCoefficient = 0.92; // fricción hidrodinámica

    this.cadence = 0; // RPM actuales
    this.pearlsCount = 0;
    this.targetPearls = 0;
    this.distanceToBuoy = 150;
    this.deviceStatus = 'Conectado (Ready)';
    this.statusMessage = '¡Pedalea para zarpar hacia la boya!';

    this.isBoarded = false; // Se activa cuando la cinemática traslada al jugador

    // Crear grupo visual principal
    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    this.group.rotation.copy(this.rotation);
    this.scene.add(this.group);

    this._buildRaftModel();
    this._buildDashboard();
  }

  // ─── Modelo 3D de la Balsa ─────────────────────────────────────────────────
  _buildRaftModel() {
    // 1. Troncos flotantes principales (5 troncos alineados)
    const logMat = new THREE.MeshStandardMaterial({
      color: 0x825329,
      roughness: 0.85,
    });
    const logGeo = new THREE.CylinderGeometry(0.24, 0.26, 4.2, 12);
    logGeo.rotateX(Math.PI / 2);

    this.logs = [];
    const logOffsets = [-0.9, -0.45, 0, 0.45, 0.9];
    logOffsets.forEach((offsetX) => {
      const log = new THREE.Mesh(logGeo, logMat);
      log.position.set(offsetX, 0.12, 0);
      log.castShadow = true;
      log.receiveShadow = true;
      this.group.add(log);
      this.logs.push(log);
    });

    // 2. Travesaños superiores y entablado de cubierta
    const plankMat = new THREE.MeshStandardMaterial({
      color: 0xa06d3b,
      roughness: 0.75,
    });
    const plankGeo = new THREE.BoxGeometry(2.3, 0.08, 0.28);
    for (let z = -1.6; z <= 1.6; z += 0.35) {
      const plank = new THREE.Mesh(plankGeo, plankMat);
      plank.position.set(0, 0.38, z);
      plank.castShadow = true;
      plank.receiveShadow = true;
      this.group.add(plank);
    }

    // 3. Cuerdas de amarre de cáñamo
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xc8b27a, roughness: 0.9 });
    const ropeGeo = new THREE.TorusGeometry(0.27, 0.035, 8, 16);
    ropeGeo.rotateY(Math.PI / 2);
    [-1.2, 0, 1.2].forEach((rz) => {
      [-0.9, 0.9].forEach((rx) => {
        const rope = new THREE.Mesh(ropeGeo, ropeMat);
        rope.position.set(rx, 0.14, rz);
        this.group.add(rope);
      });
    });

    // 4. Asiento ergonómico de madera donde se ubica el jugador
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x5a3718, roughness: 0.8 });
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.6), seatMat);
    seatBase.position.set(0, 0.55, 0.4);
    this.group.add(seatBase);

    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.65, 0.08), seatMat);
    seatBack.position.set(0, 0.95, 0.72);
    seatBack.rotation.x = 0.15; // leve inclinación
    this.group.add(seatBack);

    // 5. Rueda de palas mecánica en la popa (gira visiblemente con el pedaleo)
    this.paddleGroup = new THREE.Group();
    this.paddleGroup.position.set(0, 0.1, 2.2);

    const axleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8);
    axleGeo.rotateZ(Math.PI / 2);
    const axleMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 });
    const axle = new THREE.Mesh(axleGeo, axleMat);
    this.paddleGroup.add(axle);

    // 6 palas
    const bladeGeo = new THREE.BoxGeometry(1.2, 0.04, 0.35);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xb57c48, roughness: 0.7 });
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI;
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.rotation.x = angle;
      this.paddleGroup.add(blade);
    }
    this.group.add(this.paddleGroup);
  }

  // ─── Dashboard Holográfico Flotante ────────────────────────────────────────
  _buildDashboard() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 512;
    this.ctx = this.canvas.getContext('2d');

    this.dashTexture = new THREE.CanvasTexture(this.canvas);
    const dashGeo = new THREE.PlaneGeometry(1.4, 0.7);
    const dashMat = new THREE.MeshBasicMaterial({
      map: this.dashTexture,
      transparent: true,
      side: THREE.DoubleSide,
    });

    this.dashboardMesh = new THREE.Mesh(dashGeo, dashMat);
    this.dashboardMesh.position.set(0, 1.15, -1.5); // montado en la proa
    this.dashboardMesh.rotation.x = -0.22; // inclinado hacia los ojos del usuario
    this.dashboardMesh.rotation.y = Math.PI; // Orientación legible hacia el usuario
    this.group.add(this.dashboardMesh);

    this._renderDashboardCanvas();
  }

  _renderDashboardCanvas() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 1024, 512);

    // Fondo translúcido con efecto cian/azul náutico
    ctx.fillStyle = 'rgba(6, 22, 38, 0.88)';
    ctx.beginPath();
    ctx.roundRect(0, 0, 1024, 512, 32);
    ctx.fill();

    // Borde brillante de neón
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(6, 6, 1012, 500, 28);
    ctx.stroke();

    // Título de navegación
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 38px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🧭 BALSA DE TRAVESÍA COSTERA', 50, 68);

    // Estado del dispositivo
    ctx.textAlign = 'right';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillStyle = '#10b981';
    ctx.fillText(`⚡ DISPOSITIVO: ${this.deviceStatus}`, 974, 66);

    // Línea divisoria
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(50, 95);
    ctx.lineTo(974, 95);
    ctx.stroke();

    // Métrica 1: Perlas Recogidas
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText('🦪 PERLAS', 60, 160);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px monospace';
    ctx.fillText(`${this.pearlsCount} / ${this.targetPearls}`, 60, 235);

    // Métrica 2: Cadencia de Pedales
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText('🚴 CADENCIA', 380, 160);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px monospace';
    ctx.fillText(`${Math.round(this.cadence)} RPM`, 380, 235);

    // Métrica 3: Velocidad
    const kmh = (this.velocity * 3.6).toFixed(1);
    ctx.fillStyle = '#a78bfa';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText('⚡ VELOCIDAD', 700, 160);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px monospace';
    ctx.fillText(`${kmh} km/h`, 700, 235);

    // Barra de progreso hacia la boya
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(`🎯 DISTANCIA A LA BOYA: ${Math.max(0, Math.round(this.distanceToBuoy))} m`, 60, 315);

    const barX = 60, barY = 340, barW = 904, barH = 26;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 13);
    ctx.fill();

    const totalTrack = 160; // metros estimados
    const progress = Math.max(0, Math.min(1, 1 - (this.distanceToBuoy / totalTrack)));
    ctx.fillStyle = '#00f0ff';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * progress, barH, 13);
    ctx.fill();

    // Mensaje de estado / Guía
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fef08a';
    ctx.font = 'bold 32px system-ui, sans-serif';
    ctx.fillText(this.statusMessage, 512, 440);

    this.dashTexture.needsUpdate = true;
  }

  // ─── Actualización de Estado y Físicas ──────────────────────────────────────
  /**
   * @param {number} delta
   * @param {number} pedalPower - Potencia normalizada de pedales [0..1]
   * @param {number} cadenceRpm - RPM de pedaleo
   * @param {THREE.Vector3} headDirection - Hacia dónde mira el usuario para sutil auto-timón
   * @param {number} steerInput - Input de giro manual (stick o A/D)
   */
  update(delta, pedalPower, cadenceRpm, headDirection, steerInput = 0) {
    this.cadence = cadenceRpm;

    if (this.isBoarded) {
      // 1. Aceleración por pedaleo
      const propulsiveForce = pedalPower * 3.8; // m/s^2
      this.velocity += propulsiveForce * delta;

      // 2. Fricción con el agua (resistencia hidrodinámica cuadrática suave)
      this.velocity *= Math.pow(this.dragCoefficient, delta * 2.0);
      this.velocity = Math.max(0, Math.min(this.maxSpeed, this.velocity));

      // 3. Dirección y Viraje:
      // - Si hay input de joystick/teclas: giro manual
      // - Si no: el timón sigue sutilmente hacia donde mira el usuario
      if (Math.abs(steerInput) > 0.05) {
        this.group.rotation.y -= steerInput * 1.2 * delta;
      } else if (headDirection && this.velocity > 0.2) {
        const targetAngle = Math.atan2(-headDirection.x, -headDirection.z);
        // Suave interpolación hacia la mirada
        let angleDiff = targetAngle - this.group.rotation.y;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        this.group.rotation.y += angleDiff * 0.45 * delta;
      }

      // 4. Desplazamiento en la dirección en que apunta la balsa
      const forward = new THREE.Vector3(0, 0, -1).applyEuler(this.group.rotation);
      this.group.position.addScaledVector(forward, this.velocity * delta);

      // Limitar para que no suba a la arena seca detrás de la orilla
      if (this.group.position.z > -1.0) {
        this.group.position.z = -1.0;
        this.velocity = 0;
      }

      // 5. Girar las ruedas de palas según la velocidad
      if (this.paddleGroup) {
        this.paddleGroup.rotation.x -= (this.velocity * 2.8 + cadenceRpm * 0.06) * delta;
      }

      // 6. Anclar el cameraRig al asiento de la balsa
      this.position.copy(this.group.position);
      this.rotation.copy(this.group.rotation);

      // El usuario se sienta a altura 0.9m sobre la base de la balsa
      this.cameraRig.position.copy(this.group.position);
      this.cameraRig.position.y += 0.85;
      this.cameraRig.position.add(new THREE.Vector3(0, 0, 0.4).applyEuler(this.group.rotation));
      this.cameraRig.rotation.y = this.group.rotation.y + Math.PI; // Orientación adecuada en VR
    }

    // ─── Flotabilidad y Oleaje en Tiempo Real ───────────────────────────────
    const waveH = this.environment.getWaveHeight(this.group.position.x, this.group.position.z);
    const { pitch, roll } = this.environment.getWaveAngles(this.group.position.x, this.group.position.z);

    this.group.position.y = waveH + 0.14;
    this.group.rotation.x = pitch * 0.6;
    this.group.rotation.z = roll * 0.6;

    // Actualizar pantalla del dashboard periódicamente
    this._renderDashboardCanvas();
  }

  setPearlsStatus(collected, total) {
    this.pearlsCount = collected;
    this.targetPearls = total;
  }

  setDistanceToBuoy(dist) {
    this.distanceToBuoy = dist;
  }

  setStatusMessage(msg) {
    this.statusMessage = msg;
  }
}
