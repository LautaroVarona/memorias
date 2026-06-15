# Memorias — Revisión de cierres y memorias anuales

Aplicación web local para despachos contables que automatiza la revisión y validación de cierres contables y memorias anuales.

## Requisitos

- Node.js 18+
- npm

## Instalación

```bash
npm install
npx prisma migrate dev --name init
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

### Problemas frecuentes (Windows)

Si aparecen **EPERM**, **ENOENT**, **`__webpack_modules__ is not a function`** o el servidor usa el puerto 3003 en lugar del 3000:

1. Cierra **todas** las terminales con `npm run dev` (Ctrl+C).
2. Ejecuta:

```bash
npm run dev:reset
```

Eso mata procesos en los puertos 3000–3004, borra la caché `.next` y arranca limpio en el puerto 3000.

> No ejecutes `npm install` con el servidor en marcha: bloquea el DLL de Prisma.

## Uso

1. **Crear expediente**: suba el libro de cierre del despacho (`.xlsm`) y la memoria (`.doc`/`.docx`/`.pdf`). El cliente y el ejercicio se autodetectan del contenido al procesar.
2. **Memoria del año anterior** (opcional): súbala al mismo expediente; se asigna automáticamente por el ejercicio detectado en su contenido.
3. **Iniciar revisión**: ejecuta parsers y motor de validación (coherencia temporal, cruces memoria↔Excel, cuadres, PGC, fiscal, formal).
4. **Revisar resultados**: filtre por severidad/categoría, consulte evidencia cruzada (hoja/fila del Excel, fragmento de la memoria).
5. **Reglas personalizadas**: añada validaciones JSON en `/expedientes/[id]/rules`.
6. **Exportar**: informe HTML o Excel.

## Estructura

- `src/lib/parsers/excel/cierre-despacho.ts` — Libro de cierre .xlsm (SYS_cliente, A3SOC, BALANCE, PG, PENDIENTES, INCIDENCIAS)
- `src/lib/parsers/memoria/` — Memoria .DOC (RTF o Word binario), .docx y .pdf; apartados 01-11, tablas y datos clave
- `src/lib/rules/` — Motor de reglas (temporal, cierre, cross, fiscal, balance, pgc, formal + custom)
- `src/lib/classifier/` — Clasificador tipo empresa
- `data/pgc/` — Catálogos normativos (cuentas, apartados, fiscal)
- `scripts/e2e-examples.ts` — Caso de aceptación contra los archivos reales de `examples/`

## Formatos soportados

- Excel: `.xlsm` (libro de cierre del despacho, detectado por sus hojas características), `.xlsx`, `.xls` (balance/sumas y saldos genéricos)
- Memoria: `.doc` (RTF o Word 97-2003, detectado por contenido), `.docx`, `.rtf`, `.pdf`

## Validaciones destacadas

- **Coherencia temporal**: años obsoletos arrastrados de ejercicios anteriores y boilerplate caducado (pandemia, estado de alarma).
- **Cruces memoria↔cierre**: saldos con vinculadas (apartado 09), impuesto corriente (cuenta 6300), ejercicio de la memoria vs libro.
- **Cuadres**: debe=haber en sumas y saldos, total activo = total PN+pasivo, contabilidad del cliente vs A3SOC.
- **Estructura**: apartados obligatorios 01-11 de la memoria abreviada, tablas vacías o anunciadas sin contenido, identificación y firma.
- **Notas del despacho**: puntos marcados como pendientes en las hojas PENDIENTES/INCIDENCIAS.

## Prueba de aceptación

```bash
npm run test:examples
```

Ejecuta el pipeline completo contra los tres archivos reales de `examples/`.
