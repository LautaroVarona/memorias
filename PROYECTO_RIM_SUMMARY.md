# PROYECTO RIM — Resumen técnico del estado actual

> Documento de traspaso para consultoría IA. Objetivo del producto: los empleados del despacho suben **dos memorias** (ejercicio anterior y actual, `.doc`/`.docx`/`.pdf`) y un **libro de cierre Excel** (`.xlsm`) por cliente, y el sistema audita inconsistencias automáticamente antes del cierre del **30 de junio**. Volumen previsto: **200–300 expedientes**.

---

## 1. Stack Tecnológico y Dependencias Clave

| Capa | Tecnología | Notas |
|---|---|---|
| Framework | **Next.js 15** (App Router) + React 19 + TypeScript 5.8 | App monolítica: frontend y API routes en el mismo proyecto |
| UI | Tailwind CSS 4 | |
| Persistencia | **Prisma 6 + SQLite** (`prisma/dev.db`) | App local de despacho, sin servidor externo |
| Excel (.xlsm/.xlsx/.xls) | **`xlsx` (SheetJS 0.18.5)** | Lectura por hojas con whitelist; sin ejecución de macros (solo datos) |
| Word .docx | **`mammoth`** (`extractRawText`) | Texto plano |
| Word .doc binario (97-2003) | **`word-extractor`** | Cuerpo + encabezados (la portada vive en el header) |
| .DOC que en realidad son RTF | **Parser RTF propio sin dependencias** (`src/lib/parsers/memoria/rtf.ts`) | Las memorias generadas por A3SOC llegan con extensión `.DOC` pero contenido RTF |
| PDF | **`pdf-parse`** | Texto plano + número de páginas |
| Validación | Motor de reglas propio en TypeScript puro | ~46 reglas en 14 categorías |
| **IA / LLM** | **❌ NO EXISTE TODAVÍA** | No hay Vercel AI SDK, LangChain, ni llamadas directas a APIs. Cero prompts en el código. Ver sección 5 |

Dependencias declaradas pero **sin uso real en `src/`** (deuda): `zod`, `@react-pdf/renderer`.

---

## 2. Estructura del Proyecto (Árbol de Directorios)

```
memorias/
├── data/pgc/                      # Catálogos normativos estáticos (JSON)
│   ├── apartados-memoria.json     #   Apartados obligatorios memoria abreviada/normal + variantes de título
│   ├── cuentas.json               #   Catálogo PGC
│   └── reglas-fiscales.json       #   Keywords (vinculadas, riesgos, provisiones, BINs, continuidad...)
├── examples/                      # Archivos reales del despacho para pruebas (xlsm + 2 memorias .DOC)
├── prisma/
│   └── schema.prisma              # Expediente, Archivo, DatosExtraidos, ValidacionResultado, ReglaCustom
├── scripts/
│   └── e2e-examples.ts            # Prueba de aceptación: pipeline completo contra examples/
├── uploads/<expedienteId>/        # Archivos subidos, en disco local
└── src/
    ├── app/
    │   ├── page.tsx               # Listado de expedientes
    │   ├── expedientes/[id]/      # Dashboard de revisión (resultados, evidencia, score)
    │   └── api/
    │       ├── expedientes/                  # CRUD + upload (multipart)
    │       ├── expedientes/[id]/process/     # POST → ejecuta el pipeline completo (síncrono, maxDuration 300s)
    │       ├── expedientes/[id]/report/      # Exporta informe HTML / Excel
    │       └── rules/                        # CRUD de reglas personalizadas (JSON)
    ├── components/
    │   ├── review/                # Dashboard: IssueCard, ValidationTable, EvidenceChip, InterannualDiff...
    │   └── upload/Dropzone.tsx
    ├── lib/
    │   ├── parsers/
    │   │   ├── excel/             # detector.ts (hojas/columnas), cierre-despacho.ts (.xlsm), sheet-config.ts (whitelist)
    │   │   └── memoria/           # parser.ts (orquestador), rtf.ts (RTF propio), extractors.ts (apartados/tablas/cifras)
    │   ├── case/build-case-data.ts# Ensambla el "CaseData": modelo unificado memoria + Excel + año anterior
    │   ├── classifier/            # Heurística tipo de empresa (holding/comercial/industrial) por saldos PGC
    │   ├── normalizers/cuentas.ts # Normalización de cuentas (grupo PGC, nivel, saldo)
    │   ├── process/expediente.ts  # PIPELINE PRINCIPAL: parsear archivos → CaseData → reglas → persistir
    │   ├── rules/
    │   │   ├── engine.ts          # Orquestador: ejecuta las ~46 reglas + custom, ordena por prioridad
    │   │   ├── builtin/           # 14 ficheros de reglas (temporal, cierre, cross, fiscal, balance, pgc, formal,
    │   │   │                      #   interannual, anomaly, narrative-advanced, company-type, consistency-global...)
    │   │   ├── custom/evaluator.ts# Evaluador de reglas JSON definidas por el usuario
    │   │   ├── scoring.ts         # Score 0-100 con penalizaciones ponderadas
    │   │   ├── global-evaluation.ts # Estado global: ok / revisar / no_formulable
    │   │   └── helpers/           # vinculadas, group-accounts, closure-signals, evidence, explanation
    │   └── reports/builder.ts     # Informe HTML autocontenido + filas para export Excel
    └── types/                     # domain.ts (modelos ES), case-data.ts (CaseData unificado)
```

**Flujo end-to-end:** Upload (clasificación rápida por extensión) → `POST /api/expedientes/[id]/process` → re-clasificación por contenido (magic bytes) → parsers → `buildCaseData` (fusiona ejercicio actual + anterior) → `runFullValidation` → resultados, score y estado global persistidos en SQLite → dashboard / informe.

---

## 3. Estrategia de Parseo y Extracción de Datos

### 3.1 Memorias Word — detección por contenido, no por extensión

Las memorias del despacho llegan como `.DOC` pero pueden ser RTF (A3SOC), Word binario 97-2003 o docx renombrado. Se detecta por *magic bytes*:

```41:47:src/lib/parsers/memoria/parser.ts
export function detectarFormatoMemoria(buffer: Buffer): FormatoMemoria | null {
  if (esRtf(buffer)) return "rtf";          // "{\rtf"
  if (esOle2(buffer)) return "doc_binario"; // D0 CF 11 E0
  if (esZip(buffer)) return "docx";         // PK
  if (esPdf(buffer)) return "pdf";          // %PDF
  return null;
}
```

- **RTF**: parser propio (~140 líneas) que recorre el stream de tokens. Convierte `\par`→`\n`, `\cell`→`" | "`, `\row`→`\n`, decodifica `\'xx` (cp1252) y `\uNNNN`, descarta destinos (fonttbl, pict, footer...) **conservando los encabezados** porque contienen la portada ("MEMORIA ABREVIADA 2024").
- **.doc binario**: `word-extractor` → cuerpo + `getHeaders()`.
- **.docx**: `mammoth.extractRawText` (texto plano).
- **.pdf**: `pdf-parse` (texto plano + páginas reales).

Todo se normaliza a **un único formato de texto**: las celdas de tabla quedan como `a | b | c`, de modo que los extractores trabajan igual venga de RTF o de word-extractor (tabs → pipes).

**Mapeo de tablas**: `extraerTablas()` reagrupa bloques de líneas con `|`, detecta la cabecera, asocia la tabla a su apartado (`01`–`11`) y al título del párrafo previo, y marca `vacia: true` si todas las celdas de datos están en blanco. Incluye una heurística para el RTF que parte filas lógicas en varias líneas físicas (celdas sueltas se anexan a la fila anterior hasta alcanzar el ancho de la cabecera).

**Extracción estructurada de la memoria** (todo regex/heurística, en `extractors.ts`):
- `extraerApartados`: encabezados canónicos `"NN Título"` + patrones legacy (romanos, `1.`, MAYÚSCULAS).
- `extraerDatosClave`: denominación, NIF, ejercicio (título → pares comparativos "IMPORTE 2024/2023" → fecha 31/12), impuesto corriente, empleo medio, PMP, BINs pendientes, fecha de formulación, firmante.
- `extraerStatements`: afirmaciones tipadas (vinculadas, riesgos, provisiones, continuidad, deuda...) detectadas por keywords del catálogo `reglas-fiscales.json`, con el fragmento fuente como evidencia.
- `extraerAniosMencionados`: todos los años con contexto, distinguiendo referencias legales ("Ley 16/2012") de años arrastrados.
- `analizarFormal`: portada, firma, placeholders (`XXX`, `[...]`, `PENDIENTE DE`), apartados duplicados, frases cortadas.

### 3.2 Excel / Macro (.xlsm) — libro de cierre del despacho

`SheetJS` lee el libro **solo con la whitelist de hojas ministeriales** (no se cargan las decenas de pestañas auxiliares ni se ejecutan macros):

```6:17:src/lib/parsers/excel/sheet-config.ts
export const HOJAS_LIBRO_CIERRE = [
  "Sys4_digital",
  "balance",
  "pg",
  "inmovilizado",
  "ajuis",
  "calcis",
  "bonificacion",
  "pagos proveedores",
  "dana",
  "retribucion administradores",
] as const;
```

- **`Sys4_digital`** (sumas y saldos): se localiza la fila de cabecera (`cuenta`/`debe`/`haber`), se extrae el detalle por cuenta y se agrega a 4 dígitos.
- **`balance` y `pg`**: layout comparativo autodetectado — se busca la fila con ≥2 fechas serial de Excel (ejercicio actual / anterior) y se extraen epígrafes con ambas columnas. De ahí salen `TOTAL ACTIVO`, patrimonio neto, resultado, cliente (celda "Sociedad:"), ejercicio y fecha de cierre.
- **Hojas auxiliares** (inmovilizado, calcis...): mismos layouts comparativos, guardados como `hojasMinisterio`.
- **Excel genéricos** (`.xlsx`/`.xls` que no son libro de cierre): `detector.ts` escanea cada hoja buscando cabeceras por regex (`cuenta|código`, `debe|cargo`, `haber|abono`...) y clasifica balance vs sumas y saldos.

El resultado se normaliza a `LibroCierre` + `BalanceNormalizado` (actual y anterior), con **evidencia trazable** (hoja + fila) en cada cuenta y epígrafe.

---

## 4. Motor de Reglas Actual (Pipeline de Validación)

El motor (`src/lib/rules/engine.ts`) ejecuta ~**46 reglas declarativas** sobre un modelo unificado `CaseData` (financials + memory + priorYear). Cada regla separa **detección**, **explicación** y **evidencia**:

```19:29:src/lib/rules/types.ts
export interface RuleDefinition {
  id: string;
  title: string;
  type: RuleType;
  defaultSeverity: "critical" | "error" | "warning";
  normativa?: string;
  referencia?: string;
  execute: (data: CaseData) => RuleOutcome;
  explanation: (outcome: RuleOutcome) => string;
  evidence: (outcome: RuleOutcome) => Evidence[];
}
```

La separación conceptual que pides **ya existe de facto**, aunque hoy las tres capas son 100 % código (sin LLM):

| Capa | Implementación actual | Reglas |
|---|---|---|
| **Reglas Duras** (formato/estructura, código puro) | Regex + estructura del documento | `FORMAL_001/002` (texto roto, secciones duplicadas), `CIERRE_006` (apartados obligatorios 01-11), `CIERRE_007` (tablas vacías o anunciadas sin contenido), `CIERRE_009` (identificación de la sociedad), `TEMP_004` (fecha de formulación) |
| **Reglas de Consistencia** (cruce numérico Excel ↔ Word) | Comparación con tolerancias sobre cuentas PGC vs cifras extraídas de la memoria | `CIERRE_001/002` (cuadres debe=haber, activo=PN+pasivo), `CIERRE_004` (vinculadas memoria vs cuentas 24x/25x/552/43x/40x), `CIERRE_005` (impuesto corriente vs cuenta 6300), `CROSS_001..005` (vinculadas, activos/pasivos financieros, IS, ingresos vs actividad), `BAL_001..003`, `INTER_001..004` (interanual), `FISCAL_*` |
| **Reglas "Semánticas"** (hoy heurísticas, candidatas a LLM) | Keywords + contradicción con magnitudes contables | `TEMP_001` (años obsoletos arrastrados), `TEMP_002` (boilerplate caducado: pandemia, estado de alarma), `NARR_ADV_001` (afirmaciones genéricas "sin riesgos"/"sin deuda" contradichas por el balance), `ANOM_001/002` (variaciones >50 % sin explicación narrativa) |

Ejemplo representativo de la capa de consistencia + "semántica" combinadas (la memoria niega vinculadas pero el Excel muestra saldos de grupo):

```47:51:src/lib/rules/builtin/cross.ts
      const hasGroupBalance = totals.excel.total > 10_000;
      const descuadreTotal =
        totals.memoria.total > 0 &&
        totals.diferencia > Math.max(1_000, totals.excel.total * 0.05);
      const triggered = (hasGroupBalance && memorySaysNo) || descuadreTotal;
```

Además del listado de issues hay dos agregadores:
- **`scoring.ts`**: score 0-100 (crítico −30, warning −10/−5, penalización extra −15 si hay inconsistencias cross-document; cap a 60 si el estado es `no_formulable`).
- **`global-evaluation.ts`**: estado de negocio `ok / revisar / no_formulable` según bloqueadores (errores críticos, pendientes del despacho, modelos fiscales sin confirmar).

**Reglas personalizadas**: el usuario puede crear reglas JSON (`{field, operator, compareTo, tolerance, message}`) evaluadas por path sobre el contexto (`custom/evaluator.ts`), persistidas en `ReglaCustom` (globales o por expediente).

---

## 5. Implementación de los Prompts e IA

**Estado real: no hay ninguna integración con IA.** Auditado el código completo:

- ❌ No hay dependencias de IA (`openai`, `@anthropic-ai/sdk`, `@google/generative-ai`, `ai`, `langchain`... ausentes de `package.json`).
- ❌ No hay System Prompts ni llamadas a APIs de LLM en ningún punto de `src/`.
- ❌ No hay Structured Outputs / JSON Schema para LLM (zod está instalado pero sin uso).
- ✅ Lo que existe es un motor **determinista** que cubre por heurísticas lo que en la visión final harían las reglas semánticas con LLM.

**Sin embargo, la arquitectura ya está preparada para incorporarlo con poco esfuerzo**, porque:

1. Existe un **modelo de datos unificado y serializable** (`CaseData`: apartados con contenido, tablas estructuradas, statements con fragmento fuente, cifras, cuentas con hoja/fila) que es exactamente el contexto que se le pasaría a un LLM. Ya se persiste como JSON en `DatosExtraidos`.
2. El contrato `RuleDefinition` (detección → explicación → evidencia, con severidad y normativa) admite añadir reglas cuyo `execute` sea asíncrono contra un LLM con salida estructurada, sin tocar el resto del pipeline. *(Nota: hoy `execute` es síncrono; habría que extender el motor a `async`.)*
3. Los textos de explicación ya siguen el formato "qué pasa / por qué importa / qué hacer" (`helpers/explanation.ts`), compatible con generación por LLM.

**Huecos que la capa IA debería cubrir** (donde las heurísticas actuales se quedan cortas):
- Comparación semántica memoria N vs memoria N-1 (párrafos que deberían haberse actualizado y no lo fueron, más allá de años sueltos).
- Detección de omisiones (hechos posteriores, avales, litigios) que no responden a keywords fijas.
- Verificación de que la narrativa de cada apartado es coherente con las magnitudes del Excel (hoy solo 4 patrones regex en `NARR_ADV_001`).
- Lectura robusta de tablas degradadas que el parser estructural no reconstruye.

---

## 6. Cuellos de Botella, Bugs y Deuda Técnica Conocida

### Crítico para escalar a 200–300 expedientes

1. **Procesamiento síncrono dentro de la request HTTP.** `POST /api/expedientes/[id]/process` ejecuta todo el pipeline en línea (`maxDuration = 300`). No hay cola, ni workers, ni procesamiento por lotes: 300 expedientes habría que lanzarlos uno a uno desde la UI. Es la refactorización más urgente (cola de trabajos + endpoint batch + estado de progreso).
2. **El expediente del año anterior se re-parsea en cada procesamiento** (si está vinculado por `ejercicioAnteriorId`, se leen y parsean sus archivos de nuevo en vez de reutilizar el `DatosExtraidos` ya persistido).
3. **SQLite con payloads gigantes**: cada procesamiento guarda el JSON completo del parseo (incluido `textoCompleto` de cada memoria) en `DatosExtraidos.payload` (string), y los ~46 resultados se insertan con `prisma.create` **uno a uno** dentro de un bucle. Con 300 expedientes la BD crecerá rápido y el insert es innecesariamente lento (falta `createMany` y/o recortar payloads).

### Fragilidad de parseo (fallos conocidos)

4. **Tablas en .docx**: `mammoth.extractRawText` no emite separadores de celda fiables (la normalización tabs→pipes está pensada para word-extractor/RTF). Las memorias .docx con tablas pueden perder estructura → reglas de tablas (`CIERRE_004/007`) degradadas para ese formato. Mismo problema en PDF (texto plano).
5. **Reconstrucción de filas RTF es heurística**: las celdas sueltas se anexan a la fila anterior "hasta alcanzar el ancho de cabecera". Funciona con las memorias A3SOC reales pero se rompe con tablas anidadas o celdas combinadas ("tablas rotas").
6. **Número de páginas estimado** para Word/RTF (`texto.length / 3000`): cualquier regla futura de formato/páginas no es fiable salvo en PDF.
7. **Extracción de cifras por regex** (`extraerCifras`, `extraerDatosClave`): sensible a variaciones de redacción ("El impuesto corriente asciende a..."). Si el despacho cambia la plantilla, los cruces numéricos se quedan sin dato y las reglas pasan silenciosamente (`comparable === false` ⇒ passed).
8. **Layout del balance .xlsm con columnas fijas**: `detectarLayout(balRows, 2)` para activo y `(balRows, 10)` para pasivo. Un libro con columnas desplazadas pierde medio balance.

### Reglas muertas / incoherencias internas

9. **`LibroCierre.a3soc` y `notas` están hardcodeados a `[]`** (marcados `@deprecated`: los libros actuales ya no traen hoja A3SOC ni PENDIENTES/INCIDENCIAS), pero siguen existiendo consumidores: `CIERRE_003` (SYS vs A3SOC), `CIERRE_008` (pendientes), `hasSysA3Differences` y `countPendientes` en la evaluación global. Esas reglas **nunca pueden fallar** hoy → o se eliminan o se reconecta la fuente de datos.
10. **`scripts/e2e-examples.ts` está desactualizado**: referencia archivos (`PROFILTEK... .xlsm`, `M0106643.DOC`) que ya no están en `examples/` (ahora hay FITOGAR/M0106733) y asevera `a3soc.length > 20` y `notas.length > 0`, imposibles con el punto 9. La única prueba de aceptación del proyecto **falla en el estado actual**.
11. **Doble nomenclatura legacy/actual** arrastrada por todo el dominio: `severidad`/`severity`, `mensaje`/`explanation`, `evidencia`/`evidence`, `categoria`/`type`, español/inglés en `CaseData`. Hay adaptadores (`evidenceToLegacy`, `caseDataToEvalContext`) pero duplican mantenimiento.
12. **Evaluador de reglas custom sin validación de entrada**: usa non-null assertions (`toNumber(fieldVal)!`) — un path inexistente produce comparaciones con `NaN` en vez de error claro. zod está instalado y sería el candidato natural.

### Entorno y varios

13. **Fricción en Windows** (documentada en README): EPERM/ENOENT con la caché `.next`, DLL de Prisma bloqueado si se hace `npm install` con el dev server corriendo. Existe `npm run dev:reset` como mitigación.
14. **Dependencias instaladas sin uso**: `zod`, `@react-pdf/renderer` (el informe PDF nunca se implementó; hoy se exporta HTML y filas Excel).
15. **Sin tests unitarios** de parsers ni reglas: solo el script e2e (roto, ver punto 10). Para tocar los parsers con confianza de cara a 300 expedientes reales hace falta una batería de fixtures por formato.
16. **Clasificación inicial por extensión** al subir (`classifyByExtension`) se corrige luego por contenido al procesar; si el contenido no se reconoce, se mantiene silenciosamente el tipo por extensión (catch vacío en `processExpediente`).

---

*Generado el 12/06/2026 a partir del análisis estático del repositorio (`src/`, `prisma/`, `data/`, `scripts/`). No incluye credenciales ni datos de clientes.*
