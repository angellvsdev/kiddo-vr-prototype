# Integración del modo "Descenso en bici"

## Archivos nuevos
- `src/modes/ModeManager.js`: cambia entre la travesía y el descenso (genérico).
- `src/modes/downhill/`: el modo completo (pista, bici en primera persona, monedas, HUD, física y pruebas).

## Archivos modificados (solo estos dos)
- `src/main.js`: registra los dos modos y dirige el bucle. Las líneas `[DESCENSO]` marcan los cambios.
- `index.html`: estilos y botones del selector de modo (`#mode-switch`).

## Sin cambios
`SceneManager.js`, `DeviceActionBridge.js`, `SpatialAudioManager.js`, `PedalController.js` y el resto del programa.

## Uso
```bash
npm install
npm run dev          # abre la URL HTTPS que muestra la terminal
node --test src/modes/downhill/__tests__/downhillPhysics.test.js
```
Tecla **1**: travesía costera. Tecla **2**: descenso en bici.

## Estructura
```
kiddo-vr-descenso/
├── src/
│   ├── main.js                    ← MODIFICADO (registro de modos)
│   ├── modes/                     ← NUEVO
│   │   ├── ModeManager.js
│   │   └── downhill/
│   │       ├── index.js           API pública: createDownhillMode()
│   │       ├── DownhillMode.js    orquestador (fases, monedas, eventos)
│   │       ├── DownhillTrack.js   pista, monedas, montañas, arbustos
│   │       ├── DownhillBike.js    bicicleta en primera persona
│   │       ├── DownhillHUD.js     panel de telemetría
│   │       ├── DownhillInput.js   XR, teclado y pedales
│   │       ├── downhillPhysics.js física pura (sin Three.js)
│   │       ├── downhillConfig.js  parámetros ajustables
│   │       ├── README.md
│   │       └── __tests__/downhillPhysics.test.js
│   ├── scene/, vr/, input/, audio/, entities/, services/, cinematics/, utils/
│   └── style.css, counter.js, assets/ (originales)
├── index.html                     ← MODIFICADO (selector de modo)
├── package.json, vite.config.js, README.md, .gitignore
└── cloudflared.exe, .git/         (originales, sin cambios)
