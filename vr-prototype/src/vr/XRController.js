/**
 * XRController.js
 * Maneja los Touch Controllers nativos del Meta Quest 3 vía WebXR Input Sources.
 *
 * MAPEO DE CONTROLES (Quest 3 Touch Controllers):
 * ─────────────────────────────────────────────────────
 *  Mando izquierdo:
 *    Thumbstick (axes[2], axes[3]) → Movimiento (adelante/atrás/izquierda/derecha)
 *    Botón X (buttons[4])          → Acción 1 (reservado para personalizar)
 *    Botón Y (buttons[5])          → Acción 2 (reservado para personalizar)
 *    Gatillo (buttons[0])          → Seleccionar / Interactuar
 *    Grip    (buttons[1])          → Agarrar objeto
 *
 *  Mando derecho:
 *    Thumbstick (axes[2], axes[3]) → Girar cámara (snap turn)
 *    Botón A (buttons[4])          → Acción 3
 *    Botón B (buttons[5])          → Acción 4
 *    Gatillo (buttons[0])          → Seleccionar / Disparar
 *    Grip    (buttons[1])          → Agarrar objeto
 * ─────────────────────────────────────────────────────
 */
import * as THREE from 'three';

export class XRControllerManager {
  constructor(renderer) {
    this.renderer = renderer;

    // Estado de input normalizado listo para consumir en SceneManager
    this.state = {
      move:       new THREE.Vector2(), // thumbstick izquierdo XY [-1,1]
      turn:       new THREE.Vector2(), // thumbstick derecho XY [-1,1]
      triggerL:   0,                   // gatillo izquierdo [0,1]
      triggerR:   0,                   // gatillo derecho [0,1]
      gripL:      0,                   // grip izquierdo [0,1]
      gripR:      0,                   // grip derecho [0,1]
      btnX:       false,               // botón X (mando izquierdo)
      btnY:       false,               // botón Y (mando izquierdo)
      btnA:       false,               // botón A (mando derecho)
      btnB:       false,               // botón B (mando derecho)
      controllersConnected: 0,
    };

    // Grip groups (meshes de los controles visibles en la escena)
    this.controllerGrips = [];
    this._buildControllerMeshes();
  }

  /** Crea representaciones visuales de los controllers en la escena */
  _buildControllerMeshes() {
    for (let i = 0; i < 2; i++) {
      // Grip: posición/orientación de la mano
      const grip = this.renderer.xr.getControllerGrip(i);

      // Mesh simple para representar el controller (un cilindro redondeado)
      const geo = new THREE.CylinderGeometry(0.02, 0.025, 0.12, 12);
      const mat = new THREE.MeshStandardMaterial({
        color: i === 0 ? 0x6c63ff : 0x3b82f6,
        roughness: 0.3,
        metalness: 0.8,
        emissive: i === 0 ? 0x2a1a8f : 0x1d4ed8,
        emissiveIntensity: 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = Math.PI / 2; // orientar hacia adelante
      grip.add(mesh);

      // Punta del ray (línea de apuntado)
      const rayGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.5, 6);
      rayGeo.translate(0, -0.25, 0); // desplazar hacia adelante
      const rayMat = new THREE.MeshBasicMaterial({
        color: i === 0 ? 0x6c63ff : 0x3b82f6,
        transparent: true,
        opacity: 0.4,
      });
      const ray = new THREE.Mesh(rayGeo, rayMat);
      ray.rotation.x = Math.PI / 2;
      ray.position.z = -0.3;
      grip.add(ray);

      this.controllerGrips.push(grip);
    }
  }

  /** Devuelve los grip groups para añadirlos a la escena desde fuera */
  getGrips() {
    return this.controllerGrips;
  }

  /**
   * Llamado cada frame — lee los XRInputSources de la sesión activa.
   * @returns {object} Estado normalizado de todos los inputs
   */
  update() {
    const session = this.renderer.xr.getSession();

    // Resetear estado de movimiento cada frame
    this.state.move.set(0, 0);
    this.state.turn.set(0, 0);
    this.state.triggerL = 0;
    this.state.triggerR = 0;
    this.state.gripL = 0;
    this.state.gripR = 0;
    this.state.btnX = false;
    this.state.btnY = false;
    this.state.btnA = false;
    this.state.btnB = false;
    this.state.controllersConnected = 0;

    if (!session) return { ...this.state };

    const sources = Array.from(session.inputSources);
    this.state.controllersConnected = sources.filter(s => s.gamepad).length;

    for (const source of sources) {
      if (!source.gamepad) continue;

      const gp = source.gamepad;
      const isLeft = source.handedness === 'left';

      // ── Thumbsticks ───────────────────────────────────────────────────────
      // axes[2] = thumbstick X, axes[3] = thumbstick Y
      const stickX = gp.axes[2] ?? 0;
      const stickY = gp.axes[3] ?? 0;

      // Deadzone circular para evitar drift
      const DEADZONE = 0.15;
      const mag = Math.sqrt(stickX * stickX + stickY * stickY);
      const ax = mag > DEADZONE ? stickX : 0;
      const ay = mag > DEADZONE ? stickY : 0;

      if (isLeft) {
        this.state.move.set(ax, ay);
      } else {
        this.state.turn.set(ax, ay);
      }

      // ── Gatillos y grips ─────────────────────────────────────────────────
      if (isLeft) {
        this.state.triggerL = gp.buttons[0]?.value ?? 0;
        this.state.gripL    = gp.buttons[1]?.value ?? 0;
        this.state.btnX     = gp.buttons[4]?.pressed ?? false;
        this.state.btnY     = gp.buttons[5]?.pressed ?? false;
      } else {
        this.state.triggerR = gp.buttons[0]?.value ?? 0;
        this.state.gripR    = gp.buttons[1]?.value ?? 0;
        this.state.btnA     = gp.buttons[4]?.pressed ?? false;
        this.state.btnB     = gp.buttons[5]?.pressed ?? false;
      }
    }

    return { ...this.state };
  }
}
