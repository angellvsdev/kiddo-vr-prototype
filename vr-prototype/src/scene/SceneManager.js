/**
 * SceneManager.js
 * Gestiona la escena 3D con experiencia 360° interactiva:
 * - Modo Navegador: OrbitControls (arrastrar para ver 360°) + WASD
 * - Modo VR Inmersivo: El espacio rodea completamente al usuario en 360° (6DOF cabeza + mandos Touch)
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Environment } from './Environment.js';

// Parámetros de locomoción en VR
const MOVE_SPEED    = 3.2;         // metros/segundo
const SNAP_ANGLE    = Math.PI / 4; // 45° por snap
const SNAP_COOLDOWN = 0.3;         // segundos entre snaps

export class SceneManager {
  constructor(renderer, controllerManager) {
    this.renderer = renderer;
    this.controllerManager = controllerManager;

    // ─── Escena ───────────────────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x02020a, 0.02);

    // ─── Cámara ───────────────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      150
    );
    this.camera.position.set(0, 1.6, 3);

    // ─── Rig de cámara ("cuerpo" del usuario en el mundo) ─────────────────────
    // En WebXR con 'local-floor', la posición de la cabeza se suma a este rig.
    this.cameraRig = new THREE.Group();
    this.cameraRig.add(this.camera);
    this.cameraRig.position.set(0, 0, 0);
    this.scene.add(this.cameraRig);

    // ─── Mandos del Quest 3 en el rig ─────────────────────────────────────────
    if (controllerManager) {
      controllerManager.getGrips().forEach(grip => this.cameraRig.add(grip));
    }

    // ─── Controles 360° de navegador (OrbitControls) ──────────────────────────
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.set(0, 1.4, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.9;
    this.controls.maxPolarAngle = Math.PI - 0.05;
    this.controls.minDistance = 0.2;
    this.controls.maxDistance = 30;

    // ─── Teclado en modo navegador (WASD / Flechas) ───────────────────────────
    this.keys = { w: false, a: false, s: false, d: false };
    window.addEventListener('keydown', (e) => this._onKey(e, true));
    window.addEventListener('keyup', (e) => this._onKey(e, false));

    // ─── Ambiente 360° Envolvente ─────────────────────────────────────────────
    this.environment = new Environment(this.scene);

    // ─── Objetos 3D Centrales ─────────────────────────────────────────────────
    this._buildInteractiveObjects();

    // ─── Estado de Snap-Turn ──────────────────────────────────────────────────
    this._snapCooldown = 0;
  }

  /**
   * Llamado cuando el usuario entra en modo VR inmersivo en Quest 3.
   * La ventana del navegador desaparece y el espacio queda alrededor de él.
   */
  onSessionStart() {
    this.controls.enabled = false;
    // Reseteamos posición local de la cámara para que los sensores 6DOF del Quest
    // controlen 1:1 la altura real de los ojos del usuario sobre el suelo
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
    this.cameraRig.position.set(0, 0, 0);
    this.cameraRig.rotation.set(0, 0, 0);
  }

  /**
   * Llamado cuando el usuario sale del modo VR inmersivo.
   */
  onSessionEnd() {
    this.controls.enabled = true;
    this.camera.position.set(0, 1.6, 3);
    this.controls.target.set(0, 1.4, 0);
    this.controls.update();
  }

  _onKey(e, isDown) {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup')    this.keys.w = isDown;
    if (k === 's' || k === 'arrowdown')  this.keys.s = isDown;
    if (k === 'a' || k === 'arrowleft')  this.keys.a = isDown;
    if (k === 'd' || k === 'arrowright') this.keys.d = isDown;
  }

  _buildInteractiveObjects() {
    // 1. Núcleo central holográfico que flota delante del usuario
    const coreGroup = new THREE.Group();
    coreGroup.position.set(0, 1.4, -2.5);

    // Icosaedro holográfico exterior
    const icoGeo = new THREE.IcosahedronGeometry(0.4, 1);
    const icoMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x0055ff,
      emissiveIntensity: 0.8,
      wireframe: true,
      roughness: 0.1,
      metalness: 0.9,
    });
    this.coreMesh = new THREE.Mesh(icoGeo, icoMat);
    coreGroup.add(this.coreMesh);

    // Esfera interior resplandeciente
    const innerGeo = new THREE.SphereGeometry(0.2, 24, 24);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0xff007f,
      emissive: 0xff0055,
      emissiveIntensity: 1.4,
      roughness: 0.2,
      metalness: 0.8,
    });
    this.innerCore = new THREE.Mesh(innerGeo, innerMat);
    coreGroup.add(this.innerCore);

    // Dos anillos orbitales cruzados
    const ringGeo = new THREE.TorusGeometry(0.7, 0.018, 16, 64);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      emissive: 0x00aa55,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.8,
    });
    this.orbitRing1 = new THREE.Mesh(ringGeo, ringMat);
    this.orbitRing1.rotation.x = Math.PI / 3;
    coreGroup.add(this.orbitRing1);

    this.orbitRing2 = new THREE.Mesh(ringGeo, ringMat.clone());
    this.orbitRing2.material.color.setHex(0x6c63ff);
    this.orbitRing2.material.emissive.setHex(0x4a3bcf);
    this.orbitRing2.rotation.y = Math.PI / 4;
    coreGroup.add(this.orbitRing2);

    // Luz reactiva del núcleo
    this.coreLight = new THREE.PointLight(0x00f0ff, 2.5, 10);
    coreGroup.add(this.coreLight);

    this.scene.add(coreGroup);
    this.coreGroup = coreGroup;

    // 2. Panel 3D in-world de bienvenida
    this._buildInWorldBillboard();
  }

  _buildInWorldBillboard() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Tarjeta translúcida con borde de neón
    ctx.fillStyle = 'rgba(6, 6, 22, 0.9)';
    ctx.beginPath();
    ctx.roundRect(0, 0, 512, 256, 24);
    ctx.fill();

    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(3, 3, 506, 250, 22);
    ctx.stroke();

    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🌐 ENTORNO 360° INMERSIVO', 256, 46);

    ctx.fillStyle = '#ffffff';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('Meta Quest 3 • WebXR 6DOF', 256, 80);

    ctx.strokeStyle = 'rgba(108, 99, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 98);
    ctx.lineTo(482, 98);
    ctx.stroke();

    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = '#c7d2fe';
    ctx.fillText('👀 Gira la cabeza: Todo el espacio te rodea', 256, 134);
    ctx.fillText('🕹️ Stick Izquierdo: Caminar por el espacio', 256, 168);
    ctx.fillText('🔄 Stick Derecho: Girar en pasos de 45°', 256, 202);
    ctx.fillText('⚡ Gatillos: Alterar el brillo del núcleo', 256, 236);

    const texture = new THREE.CanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(1.6, 0.8);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    this.billboard = new THREE.Mesh(geo, mat);
    this.billboard.position.set(0, 2.2, -2.5);
    this.scene.add(this.billboard);
  }

  /**
   * Llamado cada frame desde el game loop.
   */
  update(delta, cs, frame) {
    const isPresenting = this.renderer.xr.isPresenting;

    if (isPresenting) {
      // ── MODO VR INMERSIVO (QUEST 3) ─────────────────────────────────────────
      this.controls.enabled = false;

      // Movimiento con Stick Izquierdo en la dirección en que mira el usuario
      if (cs.move && (Math.abs(cs.move.x) > 0.01 || Math.abs(cs.move.y) > 0.01)) {
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0));

        this.cameraRig.position.addScaledVector(forward, -cs.move.y * MOVE_SPEED * delta);
        this.cameraRig.position.addScaledVector(right,    cs.move.x * MOVE_SPEED * delta);
      }

      // Snap-turn con Stick Derecho
      this._snapCooldown -= delta;
      if (cs.turn && Math.abs(cs.turn.x) > 0.7 && this._snapCooldown <= 0) {
        const direction = Math.sign(cs.turn.x);
        this.cameraRig.rotation.y -= direction * SNAP_ANGLE;
        this._snapCooldown = SNAP_COOLDOWN;
      }

      // Feedback visual con gatillos
      const triggerMax = Math.max(cs.triggerL ?? 0, cs.triggerR ?? 0);
      if (this.coreLight) this.coreLight.intensity = 2.5 + triggerMax * 6.0;
      if (this.coreMesh)  this.coreMesh.material.emissiveIntensity = 0.8 + triggerMax * 3.0;

    } else {
      // ── MODO NAVEGADOR ─────────────────────────────────────────────────────
      this.controls.enabled = true;
      this.controls.update();

      // Desplazamiento por teclado (WASD)
      const moveDir = new THREE.Vector3();
      const camDir = new THREE.Vector3();
      this.camera.getWorldDirection(camDir);
      camDir.y = 0;
      camDir.normalize();

      const camRight = new THREE.Vector3();
      camRight.crossVectors(camDir, new THREE.Vector3(0, 1, 0));

      if (this.keys.w) moveDir.add(camDir);
      if (this.keys.s) moveDir.sub(camDir);
      if (this.keys.d) moveDir.add(camRight);
      if (this.keys.a) moveDir.sub(camRight);

      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
        this.cameraRig.position.addScaledVector(moveDir, MOVE_SPEED * delta);
        this.controls.target.addScaledVector(moveDir, MOVE_SPEED * delta);
      }
    }

    // ── Animaciones cinéticas ────────────────────────────────────────────────
    if (this.coreMesh) {
      this.coreMesh.rotation.y += delta * 0.7;
      this.coreMesh.rotation.x += delta * 0.35;
    }
    if (this.orbitRing1) {
      this.orbitRing1.rotation.z += delta * 1.0;
    }
    if (this.orbitRing2) {
      this.orbitRing2.rotation.x += delta * 0.8;
      this.orbitRing2.rotation.y += delta * 0.6;
    }
    if (this.innerCore) {
      const pulse = Math.sin(Date.now() * 0.003) * 0.08 + 1.0;
      this.innerCore.scale.set(pulse, pulse, pulse);
    }

    // El panel de instrucciones siempre encara suavemente hacia donde esté la cámara
    if (this.billboard) {
      const camPos = this.camera.getWorldPosition(new THREE.Vector3());
      this.billboard.lookAt(camPos);
    }

    // Actualizar cielo, monolitos y orbes 360°
    this.environment.update(delta);
  }
}
