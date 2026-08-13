# Guía del estudiante

## ¿Qué debes ser capaz de hacer?

No se espera que memorices Three.js, TSL o WebGPU. Sí debes poder:

1. Explicar dónde vive el estado de las partículas;
2. Localizar las fuerzas y relacionarlas con ecuaciones;
3. Predecir qué debería ocurrir al aislar una fuerza;
4. Usar predicciones y observaciones para detectar una implementación incorrecta;
5. Modificar deliberadamente el sistema con ayuda de IA;
6. Desplegar una URL funcional;
7. Convertir parámetros del sistema en controles expresivos para una interpretación en vivo.

## Modelo mental

```text
CONTROLES DEL INTÉRPRETE
        ↓
PARÁMETROS / UNIFORMS
        ↓
COMPUTE EN GPU
estado → fuerzas → aceleración → velocidad → posición
        ↓
BUFFERS DE POSICIÓN Y VELOCIDAD
        ↓
RENDER
material + instancias + cámara → pantalla
```

### CPU y GPU

JavaScript organiza la aplicación y modifica parámetros. La actualización masiva de partículas ocurre en GPU. El compute pass ejecuta conceptualmente la misma regla para muchas partículas en paralelo.

### TSL

TSL es la capa de Three.js con la que expresamos operaciones que Three.js convierte al shader apropiado. No necesitas escribir WGSL directamente en esta unidad.

## Cinco exploraciones antes de diseñar

En modo LAB usa `1..5` y registra la predicción y la observación:

1. **Inercia:** sin fuerzas, una partícula que ya se mueve conserva aproximadamente su movimiento.
2. **Fuerza constante +X:** partiendo con velocidad cero, la velocidad X debe crecer y las partículas deben desplazarse hacia +X.
3. **Atracción:** la aceleración debe apuntar hacia el atractor.
4. **Repulsión:** al invertir el signo de la fuerza radial, el comportamiento debe invertirse.
5. **Vórtice:** una fuerza tangencial debe introducir giro; no debe equivaler a atracción radial.

No aceptes como evidencia «se ve interesante». Formula primero una predicción.

## Cómo trabajar con IA

No pidas: «hazme una obra de partículas».

Trabaja así:

1. Define la intención;
2. Formula o selecciona una fuerza;
3. Explica a la IA la arquitectura existente;
4. Pide una modificación localizada;
5. Exige que preserve `estado → fuerzas → integración → render`;
6. Ejecuta una exploración aislada;
7. Solo después integra la fuerza al instrumento.

Un buen prompt incluye: archivo a modificar, ecuación o comportamiento deseado, parámetros que deben ser uniforms, prueba esperada y restricciones que no deben tocarse.

## Criterio de dominio

Debes poder señalar en el proyecto:

- **estado:** `positionBuffer`, `velocityBuffer`;
- **fuerzas:** bloque `force` de `createSimulation.js`;
- **integración:** actualización de `v` y `p`;
- **render:** `SpriteNodeMaterial` + `InstancedMesh`;
- **controles:** panel y mapeo de teclado/puntero.

Si una modificación de IA no puedes ubicarla en este mapa, aún no está bajo tu control.
