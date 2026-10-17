/**
 * LobbyUI.js
 * Genera el selector interactivo de niveles en Realidad Virtual y pantalla:
 * - Tarjetas holográficas flotantes 3D en arco ergonómico (120°) con títulos, iconos y badges.
 * - Puntero láser visual y reticle para Touch Controllers de Meta Quest 3.
 * - Soporte de Raycasting para mandos VR (gatillo / botón A/X).
 * - Soporte de Mouse y Hover para modo escritorio.
 * - Feedback táctil (háptico en Quest 3) y sonoro (Web Audio).
 */
import * as THREE from 'three';

export class LobbyUI {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {import('../vr/XRController.js').XRControllerManager} controllerManager
   * @param {import('../audio/SpatialAudioManager.js').SpatialAudioManager} audioManager
   * @param {Function} onSelectLevelCallback - (levelId) => void
   */
  constructor(scene, camera, controllerManager, audioManager, onSelectLevelCallback) {
    this.scene = scene;
    this.camera = camera;
    this.controllerManager = controllerManager;
    this.audioManager = audioManager;
    this.onSelectLevel = onSelectLevelCallback;

    this.group = new THREE.Group();
    this.group.name = 'LobbyUIGroup';
    this.scene.add(this.group);

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(-999, -999);
    this.interactiveCards = [];
    this.hoveredCard = null;
    this._triggerConsumed = false;

    // Crear rayo láser y retícula visual para VR
    this._buildLaserPointer();

    // Cartel superior de bienvenida en el Lobby
    this._buildHeaderTitle();

    // Crear las 4 tarjetas de nivel
    this._buildLevelCards();

    // Eventos de mouse para escritorio
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerdown', this._onPointerDown);
  }

  _buildLaserPointer() {
    // Línea de rayo láser para el mando
    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -4.5),
    ]);
    const laserMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.5,
    });
    this.laserLine = new THREE.Line(laserGeo, laserMat);
    this.laserLine.visible = false;
    this.group.add(this.laserLine);

    // Retícula (punto de impacto)
    const reticleGeo = new THREE.RingGeometry(0.015, 0.025, 16);
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    this.reticle = new THREE.Mesh(reticleGeo, reticleMat);
    this.reticle.visible = false;
    this.group.add(this.reticle);
  }

  _buildHeaderTitle() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.roundRect(0, 0, 1024, 256, 32);
    ctx.fill();

    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 5;
    ctx.roundRect(5, 5, 1014, 246, 28);
    ctx.stroke();

    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏛️ SELECCIÓN DE ESCENARIO VR', 512, 75);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '28px system-ui, sans-serif';
    ctx.fillText('Apunta con tu mando Touch y presiona el gatillo para iniciar', 512, 140);

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('🚴 O pedalea / presiona teclas [1] a [4] en el teclado', 512, 200);

    const texture = new THREE.CanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(3.2, 0.8);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const header = new THREE.Mesh(geo, mat);
    header.position.set(0, 2.7, -3.2);
    this.group.add(header);
  }

  _buildLevelCards() {
    const levels = [
      {
        id: 'coast',
        title: 'Travesía Costera',
        desc: 'Navega en balsa a pedales, recoge 12 perlas marinas y alcanza la boya.',
        tag: 'Playa & Mar • Nivel 1',
        color: '#00f0ff',
        icon: '🏝️',
        key: '1',
      },
      {
        id: 'llano',
        title: 'Atardecer Llanero',
        desc: 'Cabalga por el llano venezolano, recolecta orbes dorados y llega al hato.',
        tag: 'Pradera • Nivel 2',
        color: '#f59e0b',
        icon: '🌅',
        key: '2',
      },
      {
        id: 'cyber',
        title: 'Cyber-Arena',
        desc: 'Espacio cósmico original con cuadrícula de neón, orbes y portal de energía.',
        tag: 'Futurista • Nivel 3',
        color: '#a855f7',
        icon: '🌌',
        key: '3',
      },
      {
        id: 'downhill',
        title: 'Descenso en Bici',
        desc: 'Pista de descenso contra el reloj a alta velocidad, monedas y saltos.',
        tag: 'Velocidad & Cardio',
        color: '#22c55e',
        icon: '🚵',
        key: '4',
      },
    ];

    // Distribución ergonómica en arco circular a 2.8m de distancia
    const radius = 2.8;
    const arcTotal = Math.PI * 0.44; // ~80 grados ergonómico para visión humana en Quest 3
    const step = arcTotal / (levels.length - 1);
    const startAngle = -arcTotal / 2;

    levels.forEach((lvl, idx) => {
      const angle = startAngle + idx * step;
      const x = Math.sin(angle) * radius;
      const z = -Math.cos(angle) * radius;

      // Invertir ángulo para que la cara de la tarjeta gire hacia el centro (hacia el usuario)
      const card = this._createCardMesh(lvl, x, 1.45, z, -angle);
      this.group.add(card);
      this.interactiveCards.push(card);
    });
  }

  _createCardMesh(data, x, y, z, rotY) {
    const cardGroup = new THREE.Group();
    cardGroup.position.set(x, y, z);
    cardGroup.rotation.y = rotY;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');

    // Fondo tarjeta de cristal
    ctx.fillStyle = 'rgba(10, 15, 30, 0.94)';
    ctx.roundRect(0, 0, 512, 640, 32);
    ctx.fill();

    // Borde brillante
    ctx.strokeStyle = data.color;
    ctx.lineWidth = 6;
    ctx.roundRect(6, 6, 500, 628, 26);
    ctx.stroke();

    // Tag superior
    ctx.fillStyle = data.color;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(data.tag.toUpperCase(), 256, 55);

    // Ícono del nivel
    ctx.font = '80px system-ui';
    ctx.fillText(data.icon, 256, 160);

    // Título
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.fillText(data.title, 256, 235);

    // Atajo numérico
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`[ TECLA ${data.key} ]`, 256, 268);

    // Línea separadora
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 285);
    ctx.lineTo(472, 285);
    ctx.stroke();

    // Descripción multilínea
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '22px system-ui, sans-serif';
    this._wrapText(ctx, data.desc, 256, 335, 420, 32);

    // Botón JUGAR
    ctx.fillStyle = data.color;
    ctx.beginPath();
    ctx.roundRect(64, 520, 384, 80, 40);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText('▶ JUGAR', 256, 570);

    const texture = new THREE.CanvasTexture(canvas);
    const planeGeo = new THREE.PlaneGeometry(1.2, 1.5);
    // CRÍTICO: MeshBasicMaterial auto-iluminado para legibilidad total sin depender de sombras
    const planeMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
    });

    const mesh = new THREE.Mesh(planeGeo, planeMat);
    cardGroup.add(mesh);

    // Marco 3D de bisel
    const frameGeo = new THREE.BoxGeometry(1.24, 1.54, 0.04);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.8,
      roughness: 0.3,
      emissive: new THREE.Color(data.color),
      emissiveIntensity: 0.2,
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.z = -0.025;
    cardGroup.add(frame);

    cardGroup.userData = {
      levelId: data.id,
      title: data.title,
      baseScale: new THREE.Vector3(1, 1, 1),
      hoverScale: new THREE.Vector3(1.06, 1.06, 1.06),
      mesh: mesh,
    };

    return cardGroup;
  }

  _wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y);
  }

  // ─── Actualización y Raycasting ─────────────────────────────────────────────
  update(delta, cs) {
    const isPresenting = this.controllerManager?.renderer?.xr?.isPresenting;

    if (isPresenting) {
      this._updateVRRaycast(cs);
    } else {
      this._updateDesktopRaycast();
    }

    // Flotación sutil de las tarjetas
    const time = performance.now() * 0.002;
    this.interactiveCards.forEach((card, idx) => {
      card.position.y = 1.45 + Math.sin(time + idx * 1.5) * 0.025;
    });
  }

  _updateVRRaycast(cs) {
    const grips = this.controllerManager?.getGrips();
    if (!grips || grips.length === 0) return;

    // Usar preferentemente el mando derecho (índice 1) o izquierdo (índice 0)
    const activeGrip = grips[1] || grips[0];
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(activeGrip.matrixWorld);

    const rayOrigin = new THREE.Vector3().setFromMatrixPosition(activeGrip.matrixWorld);
    const rayDir = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix).normalize();

    this.raycaster.set(rayOrigin, rayDir);

    const meshes = this.interactiveCards.map((c) => c.userData.mesh);
    const intersects = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const hitMesh = hit.object;
      const hitCard = this.interactiveCards.find((c) => c.userData.mesh === hitMesh);

      // Posicionar rayo y retícula visual
      this.laserLine.visible = true;
      this.reticle.visible = true;

      const posAttr = this.laserLine.geometry.attributes.position;
      posAttr.setXYZ(0, rayOrigin.x, rayOrigin.y, rayOrigin.z);
      posAttr.setXYZ(1, hit.point.x, hit.point.y, hit.point.z);
      posAttr.needsUpdate = true;

      this.reticle.position.copy(hit.point);
      this.reticle.quaternion.copy(this.camera.quaternion);

      if (this.hoveredCard !== hitCard) {
        this.hoveredCard = hitCard;
        hitCard.scale.lerp(hitCard.userData.hoverScale, 0.25);
        this.controllerManager?.triggerHaptic?.(0.25, 40);
        this.audioManager?.playPearlChime?.(1);
      } else {
        hitCard.scale.lerp(hitCard.userData.hoverScale, 0.25);
      }

      // Detección de selección con gatillo o botón
      const isTriggerDown = (cs?.triggerR > 0.4 || cs?.triggerL > 0.4 || cs?.btnA || cs?.btnX);
      if (isTriggerDown && !this._triggerConsumed) {
        this._triggerConsumed = true;
        this._triggerSelection(hitCard.userData.levelId);
      }
    } else {
      // Rayo proyectado hacia adelante a 4 metros para orientación constante en VR
      this.laserLine.visible = true;
      this.reticle.visible = false;

      const endPoint = rayOrigin.clone().addScaledVector(rayDir, 4.0);
      const posAttr = this.laserLine.geometry.attributes.position;
      posAttr.setXYZ(0, rayOrigin.x, rayOrigin.y, rayOrigin.z);
      posAttr.setXYZ(1, endPoint.x, endPoint.y, endPoint.z);
      posAttr.needsUpdate = true;

      if (this.hoveredCard) {
        this.hoveredCard.scale.lerp(this.hoveredCard.userData.baseScale, 0.25);
        this.hoveredCard = null;
      }
    }

    if (!cs?.triggerR && !cs?.triggerL && !cs?.btnA && !cs?.btnX) {
      this._triggerConsumed = false;
    }
  }

  _updateDesktopRaycast() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const meshes = this.interactiveCards.map((c) => c.userData.mesh);
    const intersects = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hitMesh = intersects[0].object;
      const hitCard = this.interactiveCards.find((c) => c.userData.mesh === hitMesh);

      if (this.hoveredCard !== hitCard) {
        this.hoveredCard = hitCard;
        hitCard.scale.lerp(hitCard.userData.hoverScale, 0.25);
        this.audioManager?.playPearlChime?.(1);
      } else {
        hitCard.scale.lerp(hitCard.userData.hoverScale, 0.25);
      }
    } else {
      if (this.hoveredCard) {
        this.hoveredCard.scale.lerp(this.hoveredCard.userData.baseScale, 0.25);
        this.hoveredCard = null;
      }
    }
  }

  _onPointerMove(e) {
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  _onPointerDown() {
    if (this.hoveredCard) {
      this._triggerSelection(this.hoveredCard.userData.levelId);
    }
  }

  _triggerSelection(levelId) {
    this.audioManager?.playPearlChime?.(3);
    this.controllerManager?.triggerHaptic?.(1.0, 250);
    console.log(`[LobbyUI] Nivel seleccionado: ${levelId}`);
    if (this.onSelectLevel) {
      this.onSelectLevel(levelId);
    }
  }

  dispose() {
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerdown', this._onPointerDown);
    this.scene.remove(this.group);
    this.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
  }
}
