# Modo: Descenso en bicicleta contra el reloj

Un corredor a la vez baja una pista de montaña en bicicleta. Hay cuenta atrás,
checkpoints, obstáculos con penalización y meta.

Para integrarlo en el programa, ver `INTEGRACION.md` en la raíz de esta carpeta.

## Controles

| Acción    | Quest 3 / XR                  | Teclado          | Pedales             |
|-----------|-------------------------------|------------------|---------------------|
| Iniciar   | Gatillo                       | Espacio o W      | Pedalear            |
| Girar     | Stick derecho (o izquierdo)   | A / D o flechas  | —                   |
| Frenar    | Gatillos                      | S o flecha abajo | Pedales hacia atrás |
| Pedalear  | Stick izquierdo hacia delante | W                | Pedaleo             |
| Reiniciar | A + B a la vez                | R                | —                   |

El pedaleo solo acelera en el tramo de salida (`sprintLength`). Después manda la gravedad.

## Monedas y racha

- Hay monedas doradas repartidas en cadenas que zigzaguean por la pista. Para recogerlas todas hay que trazar la línea con el giro.
- Cada moneda resta tiempo (`coinBonusSec`). Las monedas seguidas forman una **racha**: el bonus se multiplica hasta `maxStreakMultiplier`.
- Fallar una moneda (pasar de largo) o chocar corta la racha.
- El tiempo final es el tiempo de carrera más penalizaciones, menos el bonus de monedas.

## Vista en primera persona

Se ve el cuadro, el manillar con los puños (gira con el volante o el stick) y la horquilla. La rueda delantera se ve de canto desde el sillín, como en la vida real: hay que mirar hacia abajo para verla completa.

## Archivos

- `index.js`: API pública (`createDownhillMode`).
- `DownhillMode.js`: fases, checkpoints, choques, meta, integración.
- `DownhillTrack.js`: pista procedural (curva, mallas, obstáculos, puertas).
- `DownhillBike.js`: cabina en primera persona.
- `DownhillHUD.js`: panel de telemetría (repinta ~5 Hz).
- `DownhillInput.js`: unifica XR, teclado y pedales.
- `downhillPhysics.js`: física pura, sin Three.js (incluye recogida de monedas y bonus de racha).
- `downhillConfig.js`: parámetros ajustables.
- `__tests__/`: pruebas (`node --test`).

## Ajustes

Todo está en `downhillConfig.js`. La física se puede probar sin gafas:

```bash
node --test src/modes/downhill/__tests__/downhillPhysics.test.js
```

## Limitaciones

- No hay inclinación en curvas (decisión de comodidad VR).
- En escritorio la cámara se fija a 1,35 m con 11° de inclinación para ver la bici; en VR manda la altura real de la cabeza.
- El cambio de modo se hace desde la página, no dentro del visor.
