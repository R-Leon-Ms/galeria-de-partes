# Biblioteca de BOM

## Flujo
1. **Integrar una pieza paramétrica** (sin tocar sus cálculos):
       node scripts/integrar.mjs ruta/Pieza.jsx CODIGO "Nombre" Categoria "Descripción"
   Crea `src/articulos/CODIGO-Nombre.jsx`. El script avisa qué falta si el archivo tiene otra estructura.
   Pieza fija (solo lista de materiales): copia `plantillas/articulo-estatico.jsx` a `src/articulos/`.
2. **Modificar:** edita el archivo en `src/articulos/`. El BOM se lee de las mismas tablas que dibuja el componente, no hay filas duplicadas.
3. **Revisar:** `npm run dev` (galería) o `npm run empaquetar` y luego `node salida/bom-motor.mjs --verificar`.
4. **Empaquetar:** `npm run empaquetar` → `salida/bom-motor.mjs` (un solo archivo con todas las piezas).
5. **Ejecutar con una lista de partes:**
       node salida/bom-motor.mjs lista.json resultado.csv
   Lista en JSON o CSV (ver `ejemplos/`). Los nombres de parámetro de cada pieza salen con `node salida/bom-motor.mjs` sin argumentos.

La app importa y exporta la misma lista desde el panel del proyecto.

## Vercel
Sube a GitHub → vercel.com → Add New → Project → Deploy.
