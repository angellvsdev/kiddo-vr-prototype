/**
 * DeviceActionBridge.js
 * Puente modular para disparar acciones en dispositivos de hardware externos.
 *
 * Cumple con el requisito:
 * "Elementos como perlas que el usuario debe recoger, que ejecuten una acción en
 * otro dispositivo (que por ahora no definiremos, pero que dejaremos lista para definir)".
 *
 * DRIVERS DISPONIBLES:
 * 1. MockDeviceDriver: Driver por defecto que emite logs visuales y eventos DOM.
 * 2. WebSocketDeviceDriver: Envía JSON en tiempo real a microcontroladores / servidores locales.
 * 3. WebBluetoothDeviceDriver: Preparado para enviar bytes a periféricos BLE.
 * 4. RestHttpDeviceDriver: Realiza peticiones POST a webhooks o APIs REST.
 */

export class IDeviceDriver {
  connect() {}
  sendPearlAction(data) {}
  sendCadenceAction(data) {}
  sendGoalAction(data) {}
  disconnect() {}
}

/**
 * Driver Mock de desarrollo: emite eventos en consola y en la interfaz para depuración
 */
export class MockDeviceDriver extends IDeviceDriver {
  constructor() {
    super();
    this.name = 'MockDriver (Consola + UI)';
    this.connected = true;
    this.lastAction = null;
  }

  sendPearlAction(data) {
    this.lastAction = { type: 'PEARL_TRIGGER', ...data, at: new Date().toLocaleTimeString() };
    console.log('[DeviceActionBridge] ⚡ ACCIÓN DISPARADA EN DISPOSITIVO EXTERNO:', this.lastAction);

    // Despachar evento global en ventana para quien quiera escuchar
    window.dispatchEvent(new CustomEvent('external-device-action', { detail: this.lastAction }));
  }

  sendCadenceAction(data) {
    this.lastAction = { type: 'CADENCE_TRIGGER', ...data };
  }

  sendGoalAction(data) {
    this.lastAction = { type: 'GOAL_TRIGGER', ...data, at: new Date().toLocaleTimeString() };
    console.log('[DeviceActionBridge] 🏆 META ALCANZADA - NOTIFICANDO A DISPOSITIVO:', this.lastAction);
    window.dispatchEvent(new CustomEvent('external-device-action', { detail: this.lastAction }));
  }
}

/**
 * Driver para comunicación WebSocket con dispositivos externos (ESP32, Raspberry Pi, Arduino)
 */
export class WebSocketDeviceDriver extends IDeviceDriver {
  constructor(url = 'ws://127.0.0.1:8080/device') {
    super();
    this.url = url;
    this.socket = null;
    this.connected = false;
  }

  connect() {
    try {
      this.socket = new WebSocket(this.url);
      this.socket.onopen = () => {
        this.connected = true;
        console.log('[DeviceActionBridge] WebSocket conectado:', this.url);
      };
      this.socket.onclose = () => {
        this.connected = false;
        console.log('[DeviceActionBridge] WebSocket desconectado');
      };
    } catch (e) {
      console.warn('[DeviceActionBridge] Error conectando WebSocket:', e);
    }
  }

  sendPearlAction(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ cmd: 'PEARL_COLLECTED', payload: data }));
    }
  }

  sendCadenceAction(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ cmd: 'CADENCE_UPDATE', payload: data }));
    }
  }

  sendGoalAction(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ cmd: 'GOAL_REACHED', payload: data }));
    }
  }
}

/**
 * Driver REST / HTTP Webhook
 */
export class RestHttpDeviceDriver extends IDeviceDriver {
  constructor(endpointUrl = 'http://127.0.0.1:5000/api/action') {
    super();
    this.endpointUrl = endpointUrl;
    this.connected = true;
  }

  async sendPearlAction(data) {
    try {
      await fetch(this.endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'PEARL_COLLECTED', data, timestamp: Date.now() }),
      });
    } catch (e) {
      console.warn('[DeviceActionBridge] Error HTTP POST:', e);
    }
  }

  async sendGoalAction(data) {
    try {
      await fetch(this.endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'GOAL_REACHED', data, timestamp: Date.now() }),
      });
    } catch (e) {
      console.warn('[DeviceActionBridge] Error HTTP POST:', e);
    }
  }
}

/**
 * Gestor y puente principal de acciones con dispositivos externos
 */
export class DeviceActionBridge {
  constructor(driver = null) {
    this.driver = driver || new MockDeviceDriver();
    this.listeners = [];
  }

  /**
   * Cambia el driver de conexión en tiempo de ejecución
   * @param {IDeviceDriver} newDriver
   */
  setDriver(newDriver) {
    if (this.driver && this.driver.disconnect) {
      this.driver.disconnect();
    }
    this.driver = newDriver;
    if (this.driver && this.driver.connect) {
      this.driver.connect();
    }
    console.log('[DeviceActionBridge] Driver activo:', newDriver.constructor.name);
  }

  /**
   * Invocado inmediatamente al recoger una perla
   * @param {{ id: number|string, totalCollected: number, targetTotal: number, position?: object }} pearlData
   */
  onPearlCollected(pearlData) {
    const payload = {
      event: 'PEARL_COLLECTED',
      pearlId: pearlData.id,
      totalCollected: pearlData.totalCollected,
      targetTotal: pearlData.targetTotal,
      position: pearlData.position ?? null,
      timestamp: Date.now(),
    };

    this.driver.sendPearlAction(payload);
    this._notifyListeners('pearl', payload);
  }

  /**
   * Invocado periódicamente con la cadencia de pedaleo
   * @param {{ rpm: number, speedKmh: number }} cadenceData
   */
  onCadenceUpdate(cadenceData) {
    const payload = {
      event: 'CADENCE_UPDATE',
      rpm: cadenceData.rpm,
      speedKmh: cadenceData.speedKmh,
      timestamp: Date.now(),
    };

    this.driver.sendCadenceAction(payload);
    this._notifyListeners('cadence', payload);
  }

  /**
   * Invocado al alcanzar la boya de llegada
   * @param {{ totalTimeSec: number, totalPearls: number, distanceMeters: number }} summary
   */
  onGoalReached(summary) {
    const payload = {
      event: 'GOAL_REACHED',
      totalTimeSec: summary.totalTimeSec,
      totalPearls: summary.totalPearls,
      distanceMeters: summary.distanceMeters,
      timestamp: Date.now(),
    };

    this.driver.sendGoalAction(payload);
    this._notifyListeners('goal', payload);
  }

  /** Suscribir un listener a los eventos locales del puente */
  addListener(callback) {
    this.listeners.push(callback);
  }

  _notifyListeners(type, data) {
    for (const cb of this.listeners) {
      try {
        cb(type, data);
      } catch (err) {
        console.error('[DeviceActionBridge] Error en listener:', err);
      }
    }
  }
}
