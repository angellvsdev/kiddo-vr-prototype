/**
 * ModeManager.js
 * Conmuta entre modos de juego. Es genérico: no depende de ningún modo concreto.
 *
 * Interfaz que debe cumplir cada modo:
 *   - scene            : THREE.Scene propia del modo
 *   - enter?()         : opcional, al activarse
 *   - exit?()          : opcional, al desactivarse
 *   - update(dt, ctx)  : ctx lo define el host (p. ej. { controls, frame })
 *
 * El cameraRig (cuerpo del usuario y mandos XR) es único: se traslada de una
 * escena a otra al cambiar de modo.
 */
export class ModeManager {
  /** @param {THREE.Group} rig - cameraRig compartido */
  constructor(rig) {
    this.rig = rig;
    this.modes = new Map();
    this.activeId = null;
    this.active = null;
  }

  /**
   * Registra un modo. El primero registrado queda activo y debe ser el que
   * ya contiene el rig en su escena.
   */
  register(id, mode) {
    this.modes.set(id, mode);
    if (!this.active) {
      this.active = mode;
      this.activeId = id;
    }
    return this;
  }

  /** Cambia al modo indicado. Devuelve false si no existe o ya está activo. */
  switchTo(id) {
    const next = this.modes.get(id);
    if (!next || next === this.active) return false;

    this.active.exit?.();
    this.active.scene.remove(this.rig);

    next.scene.add(this.rig);
    this.active = next;
    this.activeId = id;
    next.enter?.();
    return true;
  }

  update(delta, ctx) {
    this.active.update(delta, ctx);
  }

  /** Escena que debe renderizarse en este momento. */
  get scene() {
    return this.active.scene;
  }
}
