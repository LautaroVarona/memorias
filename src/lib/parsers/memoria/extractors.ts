import apartadosPGC from "../../../../data/pgc/apartados-memoria.json";
import reglasFiscales from "../../../../data/pgc/reglas-fiscales.json";
import type { MemoryStatement, StatementType } from "@/types/case-data";
import type { DocumentoOrigen, TrackingValue } from "@/types/tracking";
import { trackingValue } from "@/types/tracking";
import { celdaMemoriaATracking } from "@/lib/tracking/memory";
import type {
  AnioMencionado,
  ApartadoMemoria,
  CifrasMemoria,
  DatosClaveMemoria,
  FormalMemoria,
  MemoriaBloque,
  MemoriaTableBlock,
  MemoriaTableRow,
  TablaMemoria,
} from "@/types/domain";
import {
  celdaEsItemLista,
  debeIniciarNuevaTabla,
  esLineaTabla,
  esTablaListaPseudo,
  filasTablaListaAVertical,
  alinearFilaAlAnchoCabecera,
  limpiarValorCelda,
  parsearLineaTabla,
  procesarBloqueTabla,
  serializarFilasTabla,
} from "./table-parser";
import { validarTablaCriticaSiAplica, validarAnclajeTemporal, detectarFusionEnCabecera, indiceColumnaEjercicioEstricto } from "./schemas";
import { normalizarTextoComparacionInteranual } from "@/lib/rules/helpers/text-normalize";
import type {
  ImporteVinculadasFila,
  VinculadasCategoria,
  VinculadasMemoria,
} from "@/types/case-data";

export function parseImporte(str: string): number | null {
  const limpio = str.replace(/[\u0000-\u001F\u007F]/g, "");
  const match = limpio.match(/(-?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|-?\d+(?:,\d{1,2})?)/);
  if (!match) return null;
  const n = parseFloat(match[1].replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

/**
 * Ejercicio codificado en el nombre del archivo del despacho.
 * Ej.: `M0106578-2024.DOC` → 2024. Si no hay sufijo `-YYYY`, devuelve undefined
 * y el ejercicio se infiere del contenido (p. ej. `M0106578.DOC` → 2025).
 */
export function ejercicioDesdeNombreArchivo(fileName: string): number | undefined {
  const base = fileName.replace(/^.*[/\\]/, "").replace(/\.[^.]+$/i, "");
  const match = base.match(/-(\d{4})$/);
  if (!match) return undefined;
  const year = parseInt(match[1], 10);
  if (!Number.isFinite(year) || year < 1990 || year > 2099) return undefined;
  return year;
}

function puntuacionAniosEnTexto(texto: string, ejercicio: number): number {
  const years = [...texto.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => parseInt(m[0], 10));
  if (years.includes(ejercicio)) return 3;
  if (years.includes(ejercicio - 1)) return 1;
  return 0;
}

/** Prefiere la variante que cita el ejercicio de la memoria (p. ej. 2025 frente a 2024). */
function elegirVariantePorEjercicio(a: string, b: string, ejercicio: number): string {
  const sa = puntuacionAniosEnTexto(a, ejercicio);
  const sb = puntuacionAniosEnTexto(b, ejercicio);
  if (sa !== sb) return sa > sb ? a : b;
  return a.trim().length >= b.trim().length ? a : b;
}

/**
 * Los .DOC de A3SOC suelen volcar texto duplicado (plantilla del año anterior en el
 * cuerpo + versión actualizada en cabecera o cuadros de texto). Conserva la variante
 * alineada con el ejercicio de la memoria cuando dos líneas son semánticamente iguales
 * salvo años o cifras.
 */
export function deduplicarVariantesAnualesTexto(
  texto: string,
  ejercicioAncla?: number
): string {
  if (!ejercicioAncla || ejercicioAncla <= 0 || !texto.trim()) return texto;

  const bloques = texto.split(/\n{2,}/);
  const vistos = new Map<string, string>();
  const resultado: string[] = [];

  for (const bloque of bloques) {
    const lineas = bloque.split("\n");
    const lineasDedup = deduplicarLineasAnuales(lineas, ejercicioAncla, vistos);
    const unido = lineasDedup.join("\n").trim();
    if (!unido) continue;

    const key = normalizarTextoComparacionInteranual(unido);
    if (!key) {
      resultado.push(unido);
      continue;
    }

    const prev = vistos.get(key);
    if (!prev) {
      vistos.set(key, unido);
      resultado.push(unido);
      continue;
    }

    const elegido = elegirVariantePorEjercicio(prev, unido, ejercicioAncla);
    if (elegido !== prev) {
      const idx = resultado.indexOf(prev);
      if (idx >= 0) resultado[idx] = elegido;
      vistos.set(key, elegido);
    }
  }

  return resultado.join("\n\n");
}

function deduplicarLineasAnuales(
  lineas: string[],
  ejercicioAncla: number,
  vistosBloques: Map<string, string>
): string[] {
  const resultado: string[] = [];
  const indicePorSemantica = new Map<string, number>();

  for (const linea of lineas) {
    if (!linea.trim()) {
      resultado.push(linea);
      continue;
    }

    const key = normalizarTextoComparacionInteranual(linea);
    if (!key) {
      resultado.push(linea);
      continue;
    }

    const prevIdx = indicePorSemantica.get(key);
    if (prevIdx === undefined) {
      indicePorSemantica.set(key, resultado.length);
      resultado.push(linea);
      continue;
    }

    const anterior = resultado[prevIdx];
    if (anterior === linea) continue;

    const elegido = elegirVariantePorEjercicio(anterior, linea, ejercicioAncla);
    if (elegido !== anterior) {
      resultado[prevIdx] = elegido;
      const prevBloque = vistosBloques.get(key);
      if (prevBloque === anterior) vistosBloques.set(key, elegido);
    }
  }

  return resultado;
}

export function extraerCifras(texto: string): CifrasMemoria {
  const cifras: CifrasMemoria = {};
  const patterns: [keyof CifrasMemoria, RegExp][] = [
    ["activoTotal", /activo\s+total[:\s]+([\d.,]+)/i],
    ["pasivoTotal", /pasivo\s+total[:\s]+([\d.,]+)/i],
    ["patrimonioNeto", /patrimonio\s+neto[:\s]+([\d.,]+)/i],
    ["resultadoEjercicio", /resultado\s+(?:del\s+)?ejercicio[:\s]+([\d.,\-]+)/i],
    ["impuestoSociedades", /impuesto\s+sobre\s+(?:sociedades|beneficios)[:\s]+([\d.,]+)/i],
    ["activosFinancieros", /activos?\s+financieros?[:\s]+([\d.,]+)/i],
    ["provisiones", /provisiones[:\s]+([\d.,]+)/i],
    ["reservas", /reservas[:\s]+([\d.,]+)/i],
  ];

  for (const [key, regex] of patterns) {
    const match = texto.match(regex);
    if (match) {
      const val = parseImporte(match[1]);
      if (val !== null) cifras[key] = val;
    }
  }

  return cifras;
}

function detectStatement(texto: string, keywords: string[]): { found: boolean; sourceText?: string } {
  const lower = texto.toLowerCase();
  for (const kw of keywords) {
    const idx = lower.indexOf(kw.toLowerCase());
    if (idx !== -1) {
      const start = Math.max(0, idx - 20);
      const end = Math.min(texto.length, idx + kw.length + 40);
      return { found: true, sourceText: texto.slice(start, end).trim() };
    }
  }
  return { found: false };
}

function detectExistence(texto: string, patterns: RegExp[]): { found: boolean; sourceText?: string } {
  for (const pattern of patterns) {
    const match = texto.match(pattern);
    if (match) {
      return { found: true, sourceText: match[0].slice(0, 120) };
    }
  }
  return { found: false };
}

export function extraerStatements(texto: string): MemoryStatement[] {
  const statements: MemoryStatement[] = [];

  const configs: { type: StatementType; keywords?: string[]; existence?: RegExp[] }[] = [
    { type: "vinculadas", keywords: reglasFiscales.keywordsVinculadas as string[] },
    { type: "riesgos", keywords: reglasFiscales.keywordsRiesgos as string[] },
    { type: "provisiones", keywords: reglasFiscales.keywordsProvisiones as string[] },
    { type: "criterios", keywords: reglasFiscales.keywordsCriterios as string[] },
    { type: "deuda", keywords: reglasFiscales.keywordsSinDeuda as string[] },
    {
      type: "actividad",
      existence: [
        /actividad\s+principal/i,
        /objeto\s+social/i,
        /cifra\s+de\s+negocios/i,
        /ingresos\s+de\s+explotación/i,
        /ventas\s+netas/i,
      ],
    },
    { type: "continuidad", keywords: reglasFiscales.keywordsContinuidad as string[] },
    { type: "cambios_contables", keywords: reglasFiscales.keywordsCambiosContables as string[] },
    {
      type: "bases_negativas",
      existence: (reglasFiscales.keywordsBasesNegativas as string[]).map(
        (k) => new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
      ),
    },
    {
      type: "incentivos_fiscales",
      existence: (reglasFiscales.keywordsIncentivosExistencia as string[]).map(
        (k) => new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
      ),
    },
  ];

  for (const cfg of configs) {
    if (cfg.keywords) {
      const { found, sourceText } = detectStatement(texto, cfg.keywords);
      if (found) statements.push({ type: cfg.type, value: true, sourceText });
    } else if (cfg.existence) {
      const { found, sourceText } = detectExistence(texto, cfg.existence);
      if (found) statements.push({ type: cfg.type, value: false, sourceText });
    }
  }

  return statements;
}

/**
 * Encabezado de apartado de primer nivel: "01 Actividad", "03. Normas de registro".
 * Exige dos dígitos para no confundir subtítulos internos ("1. Objeto social") con apartados.
 */
const CANONICAL_HEADING = /^(\d{2})[.\s)\-–:]+([A-ZÁÉÍÓÚÑ].{2,120})$/;

const TITULO_APARTADO_INVALIDO =
  /^(importe|saldo|total|subtotal|p[aá]gina|nota|tabla|anexo|movimientos)\b/i;

interface CatalogoApartado {
  id: string;
  titulo: string;
  variantes: string[];
  numero?: number;
}

function esTituloApartadoValido(titulo: string): boolean {
  const t = titulo.trim();
  if (t.length < 3) return false;
  if (TITULO_APARTADO_INVALIDO.test(t)) return false;
  if (/^\d+([.,]\d+)?(\s*€)?$/.test(t)) return false;
  return true;
}

function parseMainApartadoHeading(linea: string): { numero: number; titulo: string } | null {
  const canonical = linea.match(CANONICAL_HEADING);
  if (!canonical) return null;
  const numero = parseInt(canonical[1], 10);
  if (!Number.isFinite(numero) || numero < 1 || numero > 99) return null;
  const titulo = canonical[2].trim();
  if (!esTituloApartadoValido(titulo)) return null;

  return { numero, titulo };
}

function esObligatorio(titulo: string): boolean {
  const catalogo = [
    ...(apartadosPGC.abreviada as CatalogoApartado[]),
    ...(apartadosPGC.normal as CatalogoApartado[]),
  ];
  const lower = titulo.toLowerCase();
  return catalogo.some(
    (a) => a.variantes.some((v) => lower.includes(v)) || lower.includes(a.titulo.toLowerCase())
  );
}

export function extraerApartados(texto: string): ApartadoMemoria[] {
  const lineas = texto.split(/\n/).map((l) => l.trim());
  const apartados: ApartadoMemoria[] = [];
  let current: ApartadoMemoria | null = null;
  const preambuloLineas: string[] = [];
  const numerosApartadoVistos = new Set<number>();
  let maxNumeroApartado = 0;

  function appendLinea(linea: string) {
    if (current) {
      current.contenido += (current.contenido ? "\n" : "") + linea;
    } else {
      preambuloLineas.push(linea);
    }
  }

  for (const linea of lineas) {
    if (!linea) continue;
    const heading = !linea.includes("|") ? parseMainApartadoHeading(linea) : null;

    // Ignorar renumeraciones internas (p. ej. un segundo "03 Riesgo de mercado" en anexos)
    const esApartadoPrincipal =
      heading &&
      (!numerosApartadoVistos.has(heading.numero) || heading.numero > maxNumeroApartado);

    if (esApartadoPrincipal && heading) {
      if (current) apartados.push(current);
      numerosApartadoVistos.add(heading.numero);
      maxNumeroApartado = Math.max(maxNumeroApartado, heading.numero);
      current = {
        id: String(heading.numero).padStart(2, "0"),
        titulo: heading.titulo,
        contenido: "",
        obligatorio: esObligatorio(heading.titulo),
        numero: heading.numero,
      };
    } else {
      appendLinea(linea);
    }
  }

  if (current) apartados.push(current);

  if (apartados.length === 0) {
    apartados.push({
      id: "sec-1",
      titulo: "Documento completo",
      contenido: [preambuloLineas.join("\n"), texto].filter(Boolean).join("\n"),
      obligatorio: false,
    });
  } else if (preambuloLineas.length > 0) {
    const primerApartado = apartados[0];
    primerApartado.contenido = [preambuloLineas.join("\n"), primerApartado.contenido]
      .filter(Boolean)
      .join("\n");
  }

  return apartados;
}

export function crearBloqueTabla(rawFilas: string[][]): MemoriaTableBlock {
  const { rows, meta } = procesarBloqueTabla(rawFilas);
  return {
    type: "table",
    rows,
    cabecera: meta.cabecera,
    esComparativaAnual: meta.esComparativaAnual,
    esTablaTexto: meta.esTablaTexto,
  };
}

export function filasCeldasDeTabla(rows: MemoriaTableRow[]): string[][] {
  return rows.map((r) => [...r.cells]);
}

/**
 * Segmenta texto normalizado (celdas separadas por " | ") en bloques inline
 * texto/tabla en orden de aparición. Cierra la tabla al encontrar un párrafo sin
 * delimitadores pipe e inicia una nueva cuando detecta cabecera titular distinta.
 */
export function segmentarBloquesDeTexto(texto: string): MemoriaBloque[] {
  const bloques: MemoriaBloque[] = [];
  let textBuffer: string[] = [];
  let tabla: string[][] = [];

  const flushText = () => {
    const content = textBuffer.join("\n").trim();
    textBuffer = [];
    if (content) bloques.push({ type: "text", content });
  };

  const flushTabla = () => {
    if (tabla.length === 0) return;
    if (esTablaListaPseudo(tabla)) {
      textBuffer.push(filasTablaListaAVertical(tabla));
      tabla = [];
      return;
    }
    bloques.push(crearBloqueTabla(tabla));
    tabla = [];
  };

  for (const lineaRaw of texto.split(/\n/)) {
    const linea = lineaRaw.trim();
    if (esLineaTabla(linea)) {
      flushText();
      const cells = parsearLineaTabla(linea);

      if (tabla.length > 0 && debeIniciarNuevaTabla(cells, tabla)) {
        flushTabla();
      }

      if (tabla.length > 0) {
        const ancho = tabla[0].length;
        if (cells.length < ancho) {
          tabla.push(alinearFilaAlAnchoCabecera(cells, ancho));
          continue;
        }
      }

      tabla.push(cells);
    } else {
      flushTabla();
      if (linea) {
        if (linea.includes("|")) {
          const cells = parsearLineaTabla(linea).map(limpiarValorCelda).filter((c) => c.length > 0);
          if (cells.length >= 2 && cells.every(celdaEsItemLista)) {
            textBuffer.push(...cells);
            continue;
          }
        }
        textBuffer.push(linea);
      }
    }
  }

  flushTabla();
  flushText();
  return bloques;
}

/** Serializa una lista de bloques a texto, separando cada bloque por una línea en blanco. */
function serializarBloques(bloques: MemoriaBloque[]): string {
  return bloques
    .map((b) => (b.type === "text" ? b.content.trim() : serializarFilasTabla(b.rows)))
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Construye los apartados a partir del flujo de bloques inline, manteniendo el
 * orden exacto (texto/tabla/texto…). Las tablas se conservan como entidades
 * independientes y el `contenido` se serializa con una línea en blanco entre
 * bloques para que el render del frontend las mantenga separadas e inline.
 */
export function extraerApartadosDesdeBloques(bloques: MemoriaBloque[]): ApartadoMemoria[] {
  const apartados: ApartadoMemoria[] = [];
  const preambulo: MemoriaBloque[] = [];
  let current: ApartadoMemoria | null = null;
  const numerosApartadoVistos = new Set<number>();
  let maxNumeroApartado = 0;

  let parrafoPend: string[] = [];

  const destino = (): MemoriaBloque[] => (current ? current.bloques! : preambulo);

  const flushParrafo = () => {
    const content = parrafoPend.join("\n").trim();
    parrafoPend = [];
    if (content) destino().push({ type: "text", content });
  };

  const abrirApartado = (numero: number, titulo: string) => {
    flushParrafo();
    if (current) apartados.push(current);
    numerosApartadoVistos.add(numero);
    maxNumeroApartado = Math.max(maxNumeroApartado, numero);
    current = {
      id: String(numero).padStart(2, "0"),
      titulo,
      contenido: "",
      bloques: [],
      obligatorio: esObligatorio(titulo),
      numero,
    };
  };

  for (const bloque of bloques) {
    if (bloque.type === "table") {
      flushParrafo();
      destino().push({
        type: "table",
        rows: bloque.rows.map((r) => ({ cells: [...r.cells], ...(r.is_subconcept ? { is_subconcept: true } : {}) })),
        cabecera: [...bloque.cabecera],
        esComparativaAnual: bloque.esComparativaAnual,
        esTablaTexto: bloque.esTablaTexto,
      });
      continue;
    }

    for (const lineaRaw of bloque.content.split(/\n/)) {
      const linea = lineaRaw.trim();
      if (!linea) {
        flushParrafo();
        continue;
      }
      const heading = !linea.includes("|") ? parseMainApartadoHeading(linea) : null;
      const esApartadoPrincipal =
        heading &&
        (!numerosApartadoVistos.has(heading.numero) || heading.numero > maxNumeroApartado);
      if (esApartadoPrincipal && heading) {
        abrirApartado(heading.numero, heading.titulo);
      } else {
        parrafoPend.push(linea);
      }
    }
  }

  flushParrafo();
  if (current) apartados.push(current);

  if (apartados.length === 0) {
    return [
      {
        id: "sec-1",
        titulo: "Documento completo",
        contenido: serializarBloques(preambulo),
        bloques: preambulo,
        obligatorio: false,
      },
    ];
  }

  if (preambulo.length > 0) {
    const primer = apartados[0];
    primer.bloques = [...preambulo, ...(primer.bloques ?? [])];
  }

  for (const apartado of apartados) {
    apartado.contenido = serializarBloques(apartado.bloques ?? []);
  }

  return apartados;
}

export function extraerTablasDesdeBloques(
  bloques: MemoriaBloque[],
  textoCompletoFallback: string,
  ejercicioActual?: number
): TablaMemoria[] {
  const tablas: TablaMemoria[] = [];
  let apartadoActual: string | undefined;
  let tituloPrevio = "";
  let linea = 1;

  for (const bloque of bloques) {
    if (bloque.type === "text") {
      const lineas = bloque.content.split(/\n/).map((l) => l.trim());
      for (const l of lineas) {
        if (!l) {
          linea += 1;
          continue;
        }
        const heading = parseMainApartadoHeading(l);
        if (heading) apartadoActual = String(heading.numero).padStart(2, "0");
        tituloPrevio = l;
        linea += 1;
      }
      continue;
    }

    const celdas = filasCeldasDeTabla(bloque.rows);
    if (celdas.length === 0) continue;

    const cabecera = bloque.cabecera.length > 0 ? bloque.cabecera : (celdas[0] ?? []);
    const datos = celdas.length > 1 ? celdas.slice(1) : [];
    const filasDetalle = bloque.rows.length > 1 ? bloque.rows.slice(1) : [];
    const vacia = tablaEstaVacia(cabecera, datos, bloque.esTablaTexto);

    const tabla: TablaMemoria = {
      apartado: apartadoActual,
      titulo: tituloPrevio,
      cabecera,
      filas: datos,
      filasDetalle,
      esComparativaAnual: bloque.esComparativaAnual,
      esTablaTexto: bloque.esTablaTexto,
      vacia,
      linea,
      pagina: lineaToPagina(textoCompletoFallback, linea),
    };

    if (ejercicioActual !== undefined && bloque.esComparativaAnual && !bloque.esTablaTexto) {
      const anclaje = validarAnclajeTemporal(
        {
          cabecera,
          filas: datos,
          titulo: tituloPrevio,
          apartado: apartadoActual,
          esComparativaAnual: bloque.esComparativaAnual,
        },
        ejercicioActual
      );
      if (!anclaje.ok) {
        tabla.tabla_rota = anclaje.tabla_rota ?? true;
        tabla.alerta_extraccion = anclaje.alerta_extraccion ?? true;
        tabla.errorParseo = anclaje.error;
        tabla.vacia = true;
      } else {
        try {
          validarTablaCriticaSiAplica(
            {
              cabecera,
              filas: datos,
              titulo: tituloPrevio,
              apartado: apartadoActual,
              esComparativaAnual: bloque.esComparativaAnual,
            },
            ejercicioActual
          );
        } catch (err) {
          tabla.tabla_rota = true;
          tabla.errorParseo = err instanceof Error ? err.message : "Tabla corrupta";
          tabla.vacia = true;
        }
      }
    }

    tablas.push(tabla);
    linea += celdas.length;
  }

  return tablas;
}

/**
 * Extrae las tablas del texto normalizado (filas con celdas separadas por " | ").
 */
function lineaToPagina(texto: string, linea: number): number {
  const fragmento = texto.split(/\n/).slice(0, Math.max(0, linea - 1)).join("\n");
  return Math.max(1, (fragmento.match(/\f/g) || []).length + 1);
}

function celdaTieneContenido(celda: string): boolean {
  const t = celda.trim();
  if (!t) return false;
  if (/^[-—–]$/.test(t)) return true;
  if (/^(n\/?a|no aplica|s\.?d\.?|sin datos)$/i.test(t)) return true;
  return /\d/.test(t);
}

function celdaTieneTextoSignificativo(celda: string): boolean {
  const t = celda.trim();
  if (!t) return false;
  if (/^[-—–]$/.test(t)) return false;
  if (/^(n\/?a|no aplica|s\.?d\.?|sin datos)$/i.test(t)) return true;
  return t.length >= 2;
}

/** Cabeceras de tablas puramente descriptivas (sin importes). */
const PATRON_TABLA_CUALITATIVA =
  /\b(identificaci[oó]n|naturaleza(?:\s+de\s+la\s+relaci[oó]n)?|sociedad|domicilio|denominaci[oó]n|raz[oó]n\s+social|relaci[oó]n|vida\s+[uú]til|m[eé]todo\s+(de\s+)?amort)/i;

const PATRON_CABECERA_NUMERICA_TABLA =
  /\b(importe|saldo|euros?|cantidad|valor|20\d{2})\b/i;

/**
 * Tablas cualitativas (p. ej. identificación de partes vinculadas) no requieren
 * cifras para considerarse con contenido válido.
 */
export function tablaEsCualitativa(cabecera: string[], datos: string[][] = []): boolean {
  const textoCabecera = cabecera.join(" ");
  if (PATRON_CABECERA_NUMERICA_TABLA.test(textoCabecera)) return false;
  if (PATRON_TABLA_CUALITATIVA.test(textoCabecera)) return true;

  if (datos.length > 0) {
    const primeraFila = datos[0].join(" ");
    if (PATRON_CABECERA_NUMERICA_TABLA.test(primeraFila)) return false;
    if (PATRON_TABLA_CUALITATIVA.test(primeraFila)) return true;
  }

  return false;
}

function columnasDatosRelevantes(cabecera: string[]): number[] {
  const importeCols: { idx: number; year: number }[] = [];
  for (let i = 1; i < cabecera.length; i++) {
    const m = cabecera[i].match(/IMPORTE\s+(20\d{2})/i);
    if (m) importeCols.push({ idx: i, year: parseInt(m[1], 10) });
  }
  if (importeCols.length > 0) {
    // Columna del ejercicio más reciente (IMPORTE 2025 antes que IMPORTE 2024)
    const masReciente = [...importeCols].sort((a, b) => b.year - a.year)[0];
    return [masReciente.idx];
  }
  return cabecera.slice(1).map((_, idx) => idx + 1);
}

function tablaEstaVacia(cabecera: string[], datos: string[][], esTablaTexto?: boolean): boolean {
  if (datos.length === 0) return false;

  if (esTablaTexto || tablaEsCualitativa(cabecera, datos)) {
    return !datos.some((fila) => fila.some((celda) => celdaTieneTextoSignificativo(celda)));
  }

  const cols = columnasDatosRelevantes(cabecera);
  const dataCells = datos.flatMap((f) => cols.map((c) => f[c] ?? ""));
  if (dataCells.length === 0) return false;
  return dataCells.every((c) => !celdaTieneContenido(c));
}

export function extraerTablas(texto: string, ejercicioActual?: number): TablaMemoria[] {
  return extraerTablasDesdeBloques(segmentarBloquesDeTexto(texto), texto, ejercicioActual);
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

export function detectarAnioPortada(texto: string): number | undefined {
  const portada = texto.slice(0, 4000);
  const titulo = portada.match(/MEMORIA\s+(?:ABREVIADA|PYMES?|NORMAL)?\s*(\d{4})/i);
  if (!titulo) return undefined;
  const year = parseInt(titulo[1], 10);
  return Number.isFinite(year) && year >= 1990 && year <= 2099 ? year : undefined;
}

function detectarEjercicio(texto: string): number | undefined {
  const signals: number[] = [];

  // Portada / cabecera (título con año)
  const portada = texto.slice(0, 4000);
  const titulo = portada.match(/MEMORIA\s+(?:ABREVIADA|PYMES?|NORMAL)?\s*(\d{4})/i);
  if (titulo) signals.push(parseInt(titulo[1], 10));

  // Fechas de cierre 31/12/YYYY (la del ejercicio suele ser la más reciente)
  const cierres = [...texto.matchAll(/\b31\/12\/(20\d{2})\b/g)].map((m) => parseInt(m[1], 10));
  if (cierres.length > 0) signals.push(Math.max(...cierres));

  // Columnas comparativas IMPORTE 20xx
  const importes = [...texto.matchAll(/IMPORTE\s+(20\d{2})/gi)].map((m) => parseInt(m[1], 10));
  if (importes.length >= 2) {
    const counts = new Map<number, number>();
    for (const y of importes) counts.set(y, (counts.get(y) ?? 0) + 1);
    const candidatos = [...counts.keys()].filter((y) => counts.has(y - 1));
    if (candidatos.length > 0) signals.push(Math.max(...candidatos));
  }

  if (signals.length === 0) return undefined;
  // El ejercicio de la memoria es el año más reciente respaldado por las señales
  return Math.max(...signals);
}

function detectarTipoMemoria(texto: string, numApartados: number): DatosClaveMemoria["tipoMemoria"] {
  if (/memoria\s+abreviada/i.test(texto)) return "abreviada";
  if (/memoria\s+(?:de\s+)?pymes?/i.test(texto)) return "pymes";
  if (/memoria\s+normal/i.test(texto)) return "normal";
  if (numApartados > 0 && numApartados <= 13) return "abreviada";
  return "normal";
}

export function extraerDatosClave(
  texto: string,
  fileName?: string,
  ejercicioAncla?: number
): DatosClaveMemoria {
  const datos: DatosClaveMemoria = {};

  const denominacion = texto.match(/La empresa\s+(.{3,80}?)\s+se constituyó/i);
  if (denominacion) datos.denominacion = denominacion[1].trim().replace(/[,.]$/, "");

  const nif =
    texto.match(/N[úu]mero de Identificaci[óo]n Fiscal\s+([A-Z]?\d{7,8}[A-Z0-9])/i) ||
    texto.match(/\bN\.?I\.?F\.?\s*:?\s*([A-Z]\d{8}|\d{8}[A-Z])\b/);
  if (nif) datos.nif = nif[1].toUpperCase();

  const ejercicioNombre = fileName ? ejercicioDesdeNombreArchivo(fileName) : undefined;
  datos.ejercicio =
    ejercicioAncla ?? ejercicioNombre ?? detectarAnioPortada(texto) ?? detectarEjercicio(texto);

  const cierre = texto.match(/\b(31\/12\/(20\d{2}))\b/);
  if (cierre) {
    const anioCierre = parseInt(cierre[2], 10);
    if (
      datos.ejercicio === undefined ||
      anioCierre === datos.ejercicio ||
      anioCierre === datos.ejercicio - 1
    ) {
      datos.fechaCierre = cierre[1];
    }
  }

  const impuesto = texto.match(
    /impuesto corriente asciende a\s+(-?[\d.,]+)(?:\s*\((-?[\d.,]+)\s+en\s+(\d{4})\))?/i
  );
  if (impuesto) {
    datos.impuestoCorriente = parseImporte(impuesto[1]) ?? undefined;
    if (impuesto[2] && impuesto[3]) {
      const anioImp = parseInt(impuesto[3], 10);
      if (
        datos.ejercicio === undefined ||
        anioImp === datos.ejercicio ||
        anioImp === datos.ejercicio - 1
      ) {
        datos.impuestoCorrienteAnterior = parseImporte(impuesto[2]) ?? undefined;
      }
    }
  }

  const empleo = texto.match(/TOTAL EMPLEO MEDIO\s*\|\s*([\d.,]+)\s*(?:\|\s*([\d.,]+))?/i);
  if (empleo) {
    datos.empleoMedio = parseImporte(empleo[1]) ?? undefined;
    if (empleo[2]) datos.empleoMedioAnterior = parseImporte(empleo[2]) ?? undefined;
  }

  const pmp = texto.match(/Periodo medio de pago a proveedores\s*\|\s*([\d.,]+)\s*(?:\|\s*([\d.,]+))?/i);
  if (pmp) {
    datos.pmpDias = parseImporte(pmp[1]) ?? undefined;
    if (pmp[2]) datos.pmpDiasAnterior = parseImporte(pmp[2]) ?? undefined;
  }

  // Total de BINs pendientes: fila "Total | A COMPENSAR | APLICADO | PENDIENTE"
  const binsIdx = texto.search(/bases imponibles negativas pendientes de compensar/i);
  if (binsIdx !== -1) {
    const fragmento = texto.slice(binsIdx, binsIdx + 1500);
    const total = fragmento.match(/Total\s*\|\s*[\d.,]+\s*\|\s*[\d.,]+\s*\|\s*([\d.,]+)/i);
    if (total) datos.basesImponiblesNegativasPendientes = parseImporte(total[1]) ?? undefined;
  }

  const formulacion = texto.match(
    /En\s+.{2,40}?,\s*a\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4}),?\s+quedan formuladas/i
  );
  if (formulacion) {
    const anioForm = parseInt(formulacion[3], 10);
    const ej = datos.ejercicio;
    const anioValido = ej === undefined || anioForm === ej || anioForm === ej + 1;
    if (anioValido) {
      const mes = MESES[formulacion[2].toLowerCase()] ?? 0;
      datos.fechaFormulacion = `${formulacion[1].padStart(2, "0")}/${String(mes).padStart(2, "0")}/${formulacion[3]}`;
    }
  }

  const firmante = texto.match(/([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{4,60})\s+con\s+N\.?I\.?F\.?/);
  if (firmante) datos.firmante = firmante[1].trim();

  const apartados = extraerApartados(texto);
  datos.tipoMemoria = detectarTipoMemoria(texto, apartados.filter((a) => a.numero !== undefined).length);

  return datos;
}

const CONTEXTO_LEGAL =
  /(ley|real decreto|r\.?d\.?|d\.?a\.?|art[íi]culo|art\.|disposici[óo]n|c[óo]digo|reglamento|orden|normativa)/i;

export function extraerAniosMencionados(texto: string, ejercicioAncla?: number): AnioMencionado[] {
  const resultado: AnioMencionado[] = [];
  const regex = /\b(19\d{2}|20\d{2})\b/g;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(texto)) !== null) {
    const anio = parseInt(m[1], 10);
    const start = Math.max(0, m.index - 70);
    const end = Math.min(texto.length, m.index + m[1].length + 70);
    const contexto = texto.slice(start, end).replace(/\s+/g, " ").trim();
    const linea = texto.slice(0, m.index).split(/\n/).length;

    // Ignorar componentes de fechas dd/mm/yyyy y números con separador de miles
    const antes = texto.slice(Math.max(0, m.index - 12), m.index);
    if (/[\d.,]$/.test(antes.trimEnd()) && !/\/$/.test(antes)) continue;

    const contextoCorto = texto.slice(Math.max(0, m.index - 30), m.index + 10);
    const esReferenciaLegal = /\d{1,3}\/$/.test(antes) || CONTEXTO_LEGAL.test(contextoCorto);

    const fueraDeContexto =
      ejercicioAncla !== undefined &&
      !esReferenciaLegal &&
      anio !== ejercicioAncla &&
      anio !== ejercicioAncla - 1;

    resultado.push({
      anio,
      contexto,
      esReferenciaLegal,
      fueraDeContexto: fueraDeContexto || undefined,
      linea,
      pagina: lineaToPagina(texto, linea),
    });
  }

  return resultado;
}

/**
 * Detecta párrafos que anuncian un detalle/tabla ("se detalla a continuación...")
 * sin que les siga ninguna tabla ni contenido: el caso real de la tabla de
 * coeficientes de amortización vacía.
 */
export function detectarTablasAnunciadasAusentes(texto: string): string[] {
  const lineas = texto.split(/\n/).map((l) => l.trim());
  const anuncios: string[] = [];
  const patronAnuncio =
    /(se detallan? a continuaci[óo]n|a continuaci[óo]n se detallan?|de los diferentes elementos es:|siguiente detalle:|se muestran? a continuaci[óo]n)/i;

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    if (!linea || linea.includes("|")) continue;
    if (!patronAnuncio.test(linea)) continue;

    // Buscar contenido en las 8 líneas no vacías siguientes
    let encontrado = false;
    let filasTabla = 0;
    let revisadas = 0;
    for (let j = i + 1; j < lineas.length && revisadas < 8; j++) {
      const siguiente = lineas[j];
      if (!siguiente) continue;
      revisadas++;
      if (siguiente.includes("|")) {
        filasTabla++;
        if (filasTabla >= 2) {
          encontrado = true;
          break;
        }
        continue;
      }
      if (CANONICAL_HEADING.test(siguiente)) {
        encontrado = true;
        break;
      }
      if (/\d/.test(siguiente)) {
        encontrado = true;
        break;
      }
    }

    if (!encontrado) anuncios.push(linea.slice(0, 140));
  }

  return anuncios;
}

export function analizarFormal(texto: string): FormalMemoria {
  const textoLower = texto.toLowerCase();
  const tienePortada =
    /memoria\s+(?:anual|abreviada|pymes?)|ejercicio\s+\d{4}|cuentas\s+anuales/i.test(texto.slice(0, 2000)) ||
    /memoria\s+(?:anual|abreviada|pymes?)\s+\d{4}/i.test(texto);
  const tieneFirma =
    /quedan formuladas las cuentas anuales|dando su conformidad mediante firma|firmado por/i.test(textoLower) ||
    (/firma|administrador|consejero|apoderado|representante\s+legal/i.test(textoLower) &&
      /[_]{3,}|\.{3,}|firmado/i.test(textoLower));

  const camposVacios: string[] = [];
  const placeholderMatches = texto.match(/\[\.{2,}\]|\[\.+\]|_{5,}|XXX|TBD|PENDIENTE DE/gi);
  if (placeholderMatches) camposVacios.push(...placeholderMatches);

  const titulos = extraerApartados(texto).map((a) => a.titulo.toLowerCase().trim());
  const apartadosRepetidos = titulos.filter((t, i) => titulos.indexOf(t) !== i);

  // Una frase se considera cortada si termina en coma o en palabra funcional
  // (artículo, preposición, conjunción): los títulos de sub-apartados sin
  // puntuación final no deben marcarse.
  const PALABRAS_FUNCIONALES =
    /(?:\b(?:de|del|la|las|el|los|y|o|u|e|en|a|al|que|con|para|por|su|sus|se|ni|como|según|entre|sobre|hacia|sin|tras|cuyo|cuya|es|son|ha|han|sido|más))$/i;
  const frasesCortadas: string[] = [];
  const parrafos = texto.split(/\n\n+/);
  for (const p of parrafos) {
    const trimmed = p.trim();
    if (trimmed.includes("|")) continue;
    if (
      trimmed.length > 40 &&
      trimmed.length < 200 &&
      !/^\d/.test(trimmed) &&
      (/,$/.test(trimmed) || PALABRAS_FUNCIONALES.test(trimmed))
    ) {
      frasesCortadas.push(trimmed.slice(0, 100) + (trimmed.length > 100 ? "..." : ""));
    }
  }

  const textoExtraible = texto.replace(/\s/g, "").length > 100;

  return {
    tienePortada,
    tieneFirma,
    camposVacios: [...new Set(camposVacios)],
    apartadosRepetidos: [...new Set(apartadosRepetidos)],
    frasesCortadas: frasesCortadas.slice(0, 10),
    textoExtraible,
  };
}

export function contarPaginasPdf(text: string): number {
  const pageBreaks = (text.match(/\f/g) || []).length;
  return Math.max(1, pageBreaks + 1);
}

const PATRON_TITULO_SECCION_PROPUESTA = /0?3\s+Aplicaci[oó]n\s+de\s+resultados/i;
const PATRON_PROPUESTA_DISTRIBUCION = /propuesta\s+de\s+distribuci[oó]n/i;
const PATRON_MARCADOR_TABLA_PROPUESTA = /BASE\s+DE\s+REPARTO|DISTRIBUCI[OÓ]N/i;
const PATRON_FILA_PERDIDAS_GANANCIAS = /P[eé]rdidas\s+y\s+ganancias/i;
const PATRON_FILA_RESERVA_CAPITALIZACION = /A\s+reserva\s+de\s+capitalizaci[oó]n/i;
const PATRON_FILA_RESERVAS_VOLUNTARIAS = /A\s+reservas\s+voluntarias/i;

/** Limpia importes de celdas Word/A3SOC (control chars, miles europeos). */
function limpiarImporteCelda(celda: string): number | null {
  const sinControl = celda.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  const limpio = sinControl.replace(/[^\d.,\-]/g, "");
  if (!limpio || limpio === "-" || limpio === "," || limpio === ".") return null;
  const estandar = limpio.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(estandar);
  return Number.isFinite(n) ? n : null;
}

function normalizarEtiquetaFila(celda: string): string {
  return celda.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

function detectarApartadoPropuesta(texto: string): boolean {
  if (PATRON_TITULO_SECCION_PROPUESTA.test(texto)) return true;
  if (PATRON_PROPUESTA_DISTRIBUCION.test(texto)) return true;

  const catalogo = apartadosPGC.normal.find((a) => a.id === "propuesta_aplicacion");
  const variantes = catalogo?.variantes ?? ["propuesta de aplicación", "aplicación del resultado"];
  const textoLower = texto.toLowerCase();
  return variantes.some((v) => textoLower.includes(v.toLowerCase()));
}

function tablaTieneMarcadorReparto(tabla: TablaMemoria): boolean {
  const celdas = [tabla.cabecera[0] ?? "", ...tabla.cabecera.slice(1), ...tabla.filas.flat()];
  return celdas.some((c) => PATRON_MARCADOR_TABLA_PROPUESTA.test(normalizarEtiquetaFila(c)));
}

function perteneceApartadoPropuesta(tabla: TablaMemoria): boolean {
  if (tabla.apartado === "03") return true;
  const titulo = tabla.titulo ?? "";
  if (PATRON_TITULO_SECCION_PROPUESTA.test(titulo)) return true;
  if (PATRON_PROPUESTA_DISTRIBUCION.test(titulo)) return true;
  return false;
}

/**
 * Localización híbrida: prioriza tablas del apartado 03 / propuesta de distribución;
 * si no hay tablas ahí, recorre todo el documento buscando BASE DE REPARTO o DISTRIBUCIÓN.
 */
function localizarTablasPropuesta(texto: string, tablas: TablaMemoria[]): TablaMemoria[] {
  const tieneSeccionPrioritaria =
    PATRON_TITULO_SECCION_PROPUESTA.test(texto) || PATRON_PROPUESTA_DISTRIBUCION.test(texto);

  if (tieneSeccionPrioritaria) {
    const enApartado = tablas.filter((t) => perteneceApartadoPropuesta(t) && !t.vacia);
    if (enApartado.length > 0) return enApartado;
  }

  return tablas.filter((t) => !t.vacia && tablaTieneMarcadorReparto(t));
}

interface CifrasPropuestaTabla {
  resultadoEjercicio?: TrackingValue<number>;
  resultadoEjercicioAnterior?: TrackingValue<number>;
  reservaIndisponible?: TrackingValue<number>;
  reservaIndisponibleAnterior?: TrackingValue<number>;
  reservasVoluntarias?: TrackingValue<number>;
  reservasVoluntariasAnterior?: TrackingValue<number>;
}

function extraerCeldaPropuesta(
  tabla: TablaMemoria,
  fila: string[],
  filaEtiqueta: string,
  columnaIdx: number,
  documento: DocumentoOrigen,
  ejercicio?: number
): TrackingValue<number> | undefined {
  const celdaRaw = fila[columnaIdx] ?? "";
  const valor = limpiarImporteCelda(celdaRaw);
  if (valor === null) return undefined;
  return celdaMemoriaATracking(valor, {
    tabla,
    filaEtiqueta,
    columnaIdx,
    celdaRaw,
    documento,
    ejercicio,
  });
}

function extraerCifrasPropuestaDeTablas(
  tablas: TablaMemoria[],
  documento: DocumentoOrigen,
  ejercicio?: number
): CifrasPropuestaTabla {
  const cifras: CifrasPropuestaTabla = {};

  for (const tabla of tablas) {
    const { actual: colActual, anterior: colAnterior, anclajeRoto } = columnasComparativasPorEjercicio(
      tabla.cabecera,
      ejercicio
    );
    if (anclajeRoto || colActual === undefined) continue;

    for (const fila of tabla.filas) {
      const etiqueta = normalizarEtiquetaFila(fila[0] ?? "");
      if (!etiqueta) continue;

      if (PATRON_FILA_PERDIDAS_GANANCIAS.test(etiqueta)) {
        const actual = extraerCeldaPropuesta(tabla, fila, etiqueta, colActual, documento, ejercicio);
        const anterior =
          colAnterior !== undefined
            ? extraerCeldaPropuesta(tabla, fila, etiqueta, colAnterior, documento, ejercicio)
            : undefined;
        if (actual) cifras.resultadoEjercicio = actual;
        if (anterior) cifras.resultadoEjercicioAnterior = anterior;
        continue;
      }

      if (PATRON_FILA_RESERVA_CAPITALIZACION.test(etiqueta)) {
        const actual = extraerCeldaPropuesta(tabla, fila, etiqueta, colActual, documento, ejercicio);
        const anterior =
          colAnterior !== undefined
            ? extraerCeldaPropuesta(tabla, fila, etiqueta, colAnterior, documento, ejercicio)
            : undefined;
        if (actual) cifras.reservaIndisponible = actual;
        if (anterior) cifras.reservaIndisponibleAnterior = anterior;
        continue;
      }

      if (PATRON_FILA_RESERVAS_VOLUNTARIAS.test(etiqueta)) {
        const actual = extraerCeldaPropuesta(tabla, fila, etiqueta, colActual, documento, ejercicio);
        const anterior =
          colAnterior !== undefined
            ? extraerCeldaPropuesta(tabla, fila, etiqueta, colAnterior, documento, ejercicio)
            : undefined;
        if (actual) cifras.reservasVoluntarias = actual;
        if (anterior) cifras.reservasVoluntariasAnterior = anterior;
      }
    }
  }

  return cifras;
}

export interface ExtraerPropuestaOpciones {
  documento?: DocumentoOrigen;
  ejercicio?: number;
}

/** Extrae cifras del apartado de propuesta de aplicación (memoria Normal). */
export function extraerPropuestaAplicacion(
  texto: string,
  tablas: TablaMemoria[],
  opts: ExtraerPropuestaOpciones = {}
): import("@/types/case-data").PropuestaAplicacion {
  const documento = opts.documento ?? "memoria_actual";
  const tieneApartado = detectarApartadoPropuesta(texto);
  if (!tieneApartado) {
    return { tieneApartado: false };
  }

  const tablasPropuesta = localizarTablasPropuesta(texto, tablas);
  const cifras = extraerCifrasPropuestaDeTablas(tablasPropuesta, documento, opts.ejercicio);

  return {
    tieneApartado: true,
    ...cifras,
  };
}

// ─── Apartado 09 / Saldos con partes vinculadas ─────────────────────────────

const PATRON_TITULO_SECCION_VINCULADAS =
  /0?9\s+Operaciones\s+con\s+partes\s+vinculadas|operaciones\s+con\s+partes\s+vinculadas|partes\s+vinculadas/i;
const PATRON_SALDOS_PENDIENTES = /saldos?\s+pendientes?\s+(de\s+)?activos/i;
const PATRON_CABECERA_DESCRIPCION = /^DESCRIPCI[ÓO]N$/i;
const PATRON_COL_VINCULADAS = /(?:DOMINANTE|DEPENDIENTE|VINCULAD)/i;

const PATRON_FILA_CLIENTES_VINCULADAS =
  /clientes?\s+por\s+ventas\s+y\s+prestaci[óo]n\s+de\s+servicios/i;
const PATRON_FILA_PROVEEDORES_VINCULADAS =
  /proveedores?\s+(a\s+)?(corto|largo)|^a\)\s*proveedores|^proveedores?$/i;
const PATRON_FILA_PRESTAMOS_VINCULADAS =
  /cr[eé]ditos?|pr[eé]stamo|inversiones?\s+financieras/i;

/** Limpia la columna DESCRIPCIÓN de una fila de tabla vinculadas (sin arrastrar prefijos RTF). */
export function normalizarDescripcionVinculadas(celda: string): string {
  return normalizarEtiquetaFila(celda)
    .replace(/^\d+\.\s*/, "")
    .replace(/^[a-zA-Z]\)\s*/, "")
    .replace(/^\-\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clasificarFilaVinculadas(descripcion: string): VinculadasCategoria {
  if (PATRON_FILA_CLIENTES_VINCULADAS.test(descripcion)) return "clientes";
  if (PATRON_FILA_PROVEEDORES_VINCULADAS.test(descripcion)) return "proveedores";
  if (PATRON_FILA_PRESTAMOS_VINCULADAS.test(descripcion)) return "prestamos";
  return "otro";
}

function claveImporteVinculadas(tabla: string, descripcion: string): string {
  return `${tabla}::${descripcion}`;
}

function nombreTablaVinculadas(tabla: TablaMemoria): string {
  if (PATRON_SALDOS_PENDIENTES.test(tabla.titulo ?? "")) return "Saldos Pendientes";

  const titulo = (tabla.titulo ?? "").trim();
  if (/^(ENTIDAD DOMINANTE|EMPRESAS DEPENDIENTES|OTRAS PARTES VINCULADAS)/i.test(titulo)) {
    return titulo;
  }

  const colVinc = tabla.cabecera.find((c, i) => i > 0 && PATRON_COL_VINCULADAS.test(c));
  if (colVinc) {
    const base = colVinc.replace(/\s+20\d{2}$/i, "").trim();
    if (PATRON_SALDOS_PENDIENTES.test(tabla.titulo ?? "")) return `Saldos Pendientes — ${base}`;
    return base;
  }

  return titulo || "Operaciones vinculadas";
}

function tablaEsVinculadas(tabla: TablaMemoria): boolean {
  if (tabla.vacia || tabla.tabla_rota) return false;
  const cab0 = normalizarEtiquetaFila(tabla.cabecera[0] ?? "");
  if (!PATRON_CABECERA_DESCRIPCION.test(cab0)) return false;
  return tabla.cabecera.slice(1).some((c) => PATRON_COL_VINCULADAS.test(c));
}

function perteneceApartadoVinculadas(tabla: TablaMemoria): boolean {
  if (tabla.apartado === "09") return true;
  const titulo = tabla.titulo ?? "";
  if (/vinculad|dependiente|dominante|saldos?\s+pendientes/i.test(titulo)) return true;
  return tablaEsVinculadas(tabla);
}

function detectarApartadoVinculadas(texto: string): boolean {
  if (PATRON_TITULO_SECCION_VINCULADAS.test(texto)) return true;
  if (PATRON_SALDOS_PENDIENTES.test(texto)) return true;

  const catalogo = [
    ...(apartadosPGC.abreviada as CatalogoApartado[]),
    ...(apartadosPGC.normal as CatalogoApartado[]),
  ];
  const vinculadas = catalogo.find((a) => a.id === "vinculadas" || a.id === "partes_vinculadas");
  const variantes = vinculadas?.variantes ?? ["operaciones con partes vinculadas", "partes vinculadas"];
  const textoLower = texto.toLowerCase();
  return variantes.some((v) => textoLower.includes(v.toLowerCase()));
}

/**
 * Localización híbrida: prioriza tablas del apartado 09 / saldos pendientes;
 * si no hay coincidencias, recorre todo el documento buscando cabeceras DESCRIPCIÓN
 * con columnas DOMINANTE / DEPENDIENTE / VINCULADAS.
 */
function localizarTablasVinculadas(texto: string, tablas: TablaMemoria[]): TablaMemoria[] {
  const tieneSeccionPrioritaria =
    PATRON_TITULO_SECCION_VINCULADAS.test(texto) || PATRON_SALDOS_PENDIENTES.test(texto);

  if (tieneSeccionPrioritaria) {
    const enApartado = tablas.filter((t) => perteneceApartadoVinculadas(t) && tablaEsVinculadas(t));
    if (enApartado.length > 0) return enApartado;
  }

  return tablas.filter((t) => !t.vacia && tablaEsVinculadas(t));
}

function columnaPorEjercicio(cabecera: string[], ejercicio: number): number | undefined {
  if (detectarFusionEnCabecera(cabecera)) return undefined;
  const idx = indiceColumnaEjercicioEstricto(cabecera, ejercicio);
  return idx ?? undefined;
}

/** Resuelve columnas comparativas ancladas al ejercicio del expediente (sin inferir años por defecto). */
function columnasComparativasPorEjercicio(
  cabecera: string[],
  ejercicioMemoria?: number
): { actual?: number; anterior?: number; anclajeRoto?: boolean } {
  if (ejercicioMemoria === undefined) {
    const anioCols: { idx: number; year: number }[] = [];
    for (let i = 1; i < cabecera.length; i++) {
      const m = cabecera[i].match(/(?:IMPORTE\s+)?(20\d{2})/i);
      if (m) anioCols.push({ idx: i, year: parseInt(m[1], 10) });
    }
    if (anioCols.length === 0) return { anclajeRoto: true };
    const sorted = [...anioCols].sort((a, b) => b.year - a.year);
    return { actual: sorted[0].idx, anterior: sorted[1]?.idx };
  }

  if (detectarFusionEnCabecera(cabecera)) return { anclajeRoto: true };

  const actual = columnaPorEjercicio(cabecera, ejercicioMemoria);
  const anterior = columnaPorEjercicio(cabecera, ejercicioMemoria - 1);

  if (actual === undefined) return { anclajeRoto: true };

  return { actual, anterior };
}

function columnasEjercicioVinculadas(
  cabecera: string[],
  ejercicioMemoria?: number
): { actual?: number; anterior?: number; anclajeRoto?: boolean } {
  return columnasComparativasPorEjercicio(cabecera, ejercicioMemoria);
}

function ubicacionVinculadasFila(
  apartado: string,
  nombreTabla: string,
  nombreFila: string
): string {
  return `Apartado ${apartado.padStart(2, "0")} / Tabla: ${nombreTabla} / Fila: ${nombreFila}`;
}

function extraerCeldaVinculadas(
  apartado: string,
  nombreTabla: string,
  nombreFila: string,
  celdaRaw: string,
  documento: DocumentoOrigen
): TrackingValue<number> | undefined {
  const valor = limpiarImporteCelda(celdaRaw);
  if (valor === null || Math.abs(valor) === 0) return undefined;
  return trackingValue(
    valor,
    documento,
    ubicacionVinculadasFila(apartado, nombreTabla, nombreFila),
    celdaRaw.trim() || undefined
  );
}

function sumarPorCategoria(filas: ImporteVinculadasFila[], categoria: VinculadasCategoria): number {
  return filas
    .filter((f) => f.categoria === categoria)
    .reduce((s, f) => s + Math.abs(f.ejercicioActual?.valor ?? 0), 0);
}

function extraerCifrasVinculadasDeTablas(
  tablas: TablaMemoria[],
  documento: DocumentoOrigen,
  ejercicioMemoria?: number
): Pick<VinculadasMemoria, "filas" | "totalActual" | "clientesGrupo" | "proveedoresGrupo" | "prestamos"> {
  const filas: ImporteVinculadasFila[] = [];
  const indice = new Map<string, ImporteVinculadasFila>();

  for (const tabla of tablas) {
    if (tabla.tabla_rota) continue;

    const nombreTabla = nombreTablaVinculadas(tabla);
    const apartadoRef = tabla.apartado ?? "09";
    const { actual: colActual, anterior: colAnterior, anclajeRoto } = columnasEjercicioVinculadas(
      tabla.cabecera,
      ejercicioMemoria
    );
    if (anclajeRoto || colActual === undefined) continue;

    for (const fila of tabla.filas) {
      const nombreFilaLimpio = normalizarDescripcionVinculadas(fila[0] ?? "");
      if (!nombreFilaLimpio) continue;

      const clave = claveImporteVinculadas(nombreTabla, nombreFilaLimpio);
      let registro = indice.get(clave);
      if (!registro) {
        registro = {
          clave,
          descripcion: nombreFilaLimpio,
          tabla: nombreTabla,
          categoria: clasificarFilaVinculadas(nombreFilaLimpio),
        };
        indice.set(clave, registro);
        filas.push(registro);
      }

      const celdaActualRaw = fila[colActual] ?? "";
      const trackedActual = extraerCeldaVinculadas(
        apartadoRef,
        nombreTabla,
        nombreFilaLimpio,
        celdaActualRaw,
        documento
      );
      if (trackedActual) registro.ejercicioActual = trackedActual;

      if (colAnterior !== undefined) {
        const celdaAnteriorRaw = fila[colAnterior] ?? "";
        const trackedAnterior = extraerCeldaVinculadas(
          apartadoRef,
          nombreTabla,
          nombreFilaLimpio,
          celdaAnteriorRaw,
          documento
        );
        if (trackedAnterior) registro.ejercicioAnterior = trackedAnterior;
      }
    }
  }

  const clientesGrupo = sumarPorCategoria(filas, "clientes");
  const proveedoresGrupo = sumarPorCategoria(filas, "proveedores");
  const prestamos = sumarPorCategoria(filas, "prestamos");
  const totalActual = clientesGrupo + proveedoresGrupo + prestamos;

  return { filas, totalActual, clientesGrupo, proveedoresGrupo, prestamos };
}

export interface ExtraerVinculadasOpciones {
  documento?: DocumentoOrigen;
  ejercicio?: number;
}

/** Extrae saldos trazados del apartado de operaciones con partes vinculadas. */
export function extraerVinculadas(
  texto: string,
  tablas: TablaMemoria[],
  opts: ExtraerVinculadasOpciones = {}
): VinculadasMemoria {
  const documento = opts.documento ?? "memoria_actual";
  const tieneApartado = detectarApartadoVinculadas(texto);
  const tablasVinculadas = localizarTablasVinculadas(texto, tablas);

  if (tablasVinculadas.length === 0) {
    return {
      tieneApartado,
      filas: [],
      totalActual: 0,
      clientesGrupo: 0,
      proveedoresGrupo: 0,
      prestamos: 0,
    };
  }

  const cifras = extraerCifrasVinculadasDeTablas(tablasVinculadas, documento, opts.ejercicio);
  return { tieneApartado: true, ...cifras };
}
