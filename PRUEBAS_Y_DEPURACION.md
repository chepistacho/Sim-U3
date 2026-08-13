# Validación y depuración

## Regla principal

No uses «se ve bien» como evidencia de corrección. Una prueba debe declarar una propiedad observable antes de ejecutar el sistema.

## Matriz mínima

| Prueba | Fuerzas activas | Condición inicial | Predicción |
|---|---|---|---|
| Inercia | ninguna | velocidad ≠ 0 | movimiento sin aceleración deliberada |
| +X | viento | velocidad = 0 | `v.x` crece positiva |
| Atracción | radial + | velocidad = 0 | aceleración hacia atractor |
| Repulsión | radial - | velocidad = 0 | aceleración alejándose |
| Vórtice | radial suave + tangencial | velocidad = 0 | aparece giro, no solo caída radial |

## Errores típicos generados por IA

### Actualizar partículas en JavaScript

Síntoma: `for (...) position[i] ...` por frame. Esto elimina el propósito del compute masivo.

### Confundir render shader con compute

Síntoma: el material altera visualmente vértices, pero el estado físico real no cambia. Pregunta: ¿La posición futura queda escrita en storage?

### Singularidad radial

Síntoma: las partículas explotan al acercarse al atractor. Revisa división por distancia y `softening`.

### dt demasiado grande

Síntoma: sistema errático al cambiar de equipo o velocidad. Mantén inicialmente paso fijo y luego experimenta conscientemente.

### Demasiados parámetros

Síntoma: instrumento imposible de tocar. Separa parámetros de calibración y controles de performance.

### Publicación rota

Síntoma: local funciona, GitHub Pages queda negro o con 404. Abre DevTools → Network/Console; verifica rutas de assets y que el workflow haya terminado correctamente.

## Checklist de entrega técnica

- `npm run build` pasa.
- `npm run preview` reproduce la obra.
- URL pública abre en una ventana incógnita.
- consola sin errores críticos.
- LAB permite aislar fuerzas.
- PERFORMANCE no requiere la interfaz de desarrollo.
- Puedes explicar estado, fuerzas, integración, render y controles.
