/**
 * XRSession.js
 * Gestiona el ciclo de vida de la sesión WebXR immersive-vr para Meta Quest 3,
 * con diagnóstico automático de contexto seguro (HTTPS) y detección del navegador.
 */
export class XRSessionManager {
  constructor(renderer, sceneManager) {
    this.renderer = renderer;
    this.sceneManager = sceneManager;
    this.session = null;

    // Configurar 'local-floor' para que la altura de los ojos en VR
    // coincida con la altura física real del usuario en su habitación
    try {
      this.renderer.xr.setReferenceSpaceType('local-floor');
    } catch (e) {
      console.warn('[WebXR] setReferenceSpaceType advertencia:', e);
    }

    // Escuchar inicio y fin de la sesión WebXR
    this.renderer.xr.addEventListener('sessionstart', () => {
      console.log('[WebXR] Sesión inmersiva iniciada con éxito');
      if (this.sceneManager && this.sceneManager.onSessionStart) {
        this.sceneManager.onSessionStart();
      }
      this._updateUI(true);
    });

    this.renderer.xr.addEventListener('sessionend', () => {
      console.log('[WebXR] Sesión inmersiva finalizada');
      if (this.sceneManager && this.sceneManager.onSessionEnd) {
        this.sceneManager.onSessionEnd();
      }
      this.session = null;
      this._updateUI(false);
    });

    this._setupWebXR();
  }

  async _setupWebXR() {
    const btn = document.getElementById('btn-enter-vr');
    const status = document.getElementById('status-bar');

    // 1. Diagnóstico de contexto seguro (HTTPS)
    if (!window.isSecureContext) {
      if (btn) btn.disabled = true;
      if (status) {
        status.innerHTML = '⚠️ <strong>Sin HTTPS seguro:</strong> WebXR requiere HTTPS. Redirigiendo a https://...';
      }
      // Forzar redirección automática a HTTPS si se entró por HTTP
      if (location.protocol === 'http:') {
        setTimeout(() => {
          location.href = location.href.replace('http:', 'https:');
        }, 1200);
      }
      return;
    }

    // 2. Detección de WebView / Navegador In-App (ej. WhatsApp, Messenger, Instagram dentro de Quest)
    const ua = navigator.userAgent || '';
    const isInApp = /FBAN|FBAV|Instagram|WhatsApp|Messenger/i.test(ua);
    const isQuest = /Quest|OculusBrowser/i.test(ua);

    // 3. Comprobación de navigator.xr
    if (!navigator.xr) {
      if (btn) btn.disabled = true;

      if (isInApp) {
        if (status) {
          status.innerHTML = '⚠️ <strong>Estás en el visor interno de una app:</strong><br/>Toca los 3 puntos (⋮) arriba a la derecha y elige <strong>"Abrir en Meta Quest Browser"</strong>.';
        }
      } else if (!isQuest) {
        if (status) {
          status.innerHTML = '🖥️ <strong>Estás en modo pantalla:</strong> Para inmersión total en 360°, abre este enlace dentro de la app <strong>Navegador</strong> de tus Meta Quest 3.';
        }
      } else {
        if (status) {
          status.innerHTML = '⚠️ <strong>WebXR no activado:</strong> Abre la app oficial <strong>Navegador</strong> (icono de globo terráqueo) en tus Meta Quest 3 y asegúrate de cargar con <strong>https://</strong>.';
        }
      }
      return;
    }

    // 4. Comprobación de soporte de sesión 'immersive-vr'
    try {
      const supported = await navigator.xr.isSessionSupported('immersive-vr');
      if (supported) {
        if (btn) btn.disabled = false;
        if (status) {
          status.innerHTML = '✨ <strong>Meta Quest 3 detectado</strong> — Pulsa el botón para sumergirte en el espacio 360°';
        }

        const sessionOptions = {
          optionalFeatures: [
            'local-floor',
            'bounded-floor',
            'hand-tracking',
            'layers',
          ],
        };

        // Activar soporte nativo offerSession en Meta Quest Browser
        if (typeof navigator.xr.offerSession === 'function') {
          navigator.xr.offerSession('immersive-vr', sessionOptions)
            .then(async (session) => {
              this.session = session;
              await this.renderer.xr.setSession(session);
            })
            .catch((err) => console.log('[WebXR] offerSession aviso:', err));
        }
      } else {
        if (btn) btn.disabled = true;
        if (status) {
          status.innerHTML = '⚠️ Dispositivo sin soporte de modo inmersivo 6DOF. Abre en Meta Quest Browser.';
        }
      }
    } catch (err) {
      console.warn('[WebXR] Error comprobando soporte:', err);
      if (status) status.textContent = `Aviso WebXR: ${err.message}`;
    }
  }

  /**
   * Dispara la sesión inmersiva.
   * La pantalla desaparece y el usuario queda dentro del mundo 360°.
   */
  async enterVR() {
    if (!navigator.xr) {
      alert('Para entrar al modo inmersivo completo, debes abrir este enlace en la app "Navegador" de tus Meta Quest 3 usando HTTPS.');
      return;
    }

    if (this.session) {
      await this.session.end();
      return;
    }

    try {
      const sessionOptions = {
        requiredFeatures: ['local-floor'],
        optionalFeatures: [
          'bounded-floor',
          'hand-tracking',
          'layers',
        ],
      };

      console.log('[WebXR] Solicitando sesión immersive-vr (local-floor)...');
      let session;
      try {
        session = await navigator.xr.requestSession('immersive-vr', sessionOptions);
      } catch (reqErr) {
        console.warn('[WebXR] Fallback a optionalFeatures:', reqErr);
        session = await navigator.xr.requestSession('immersive-vr', {
          optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'],
        });
      }
      this.session = session;

      await this.renderer.xr.setSession(session);
      console.log('[WebXR] ¡Sesión inmersiva iniciada con éxito!');
    } catch (err) {
      console.error('[WebXR] Error al iniciar sesión inmersiva:', err);
      const status = document.getElementById('status-bar');
      if (status) status.textContent = `Error al entrar a VR: ${err.message}`;
    }
  }

  _updateUI(isVRActive) {
    const btn = document.getElementById('btn-enter-vr');
    const status = document.getElementById('status-bar');
    if (btn) {
      btn.innerHTML = isVRActive
        ? '<span>🛑</span><span>SALIR DE MODO VR</span>'
        : '<span>🥽</span><span>ENTRAR A VR INMERSIVO (360° TOTAL)</span>';
    }
    if (status) {
      status.textContent = isVRActive
        ? '🔴 MODO VR 360° ACTIVO EN QUEST 3'
        : '✨ Pulsa el botón para sumergirte en el mundo 360°';
    }
  }
}
