/**
 * Parser dinámico de tablas para memorias A3SOC.
 * Preserva celdas vacías, infiere cabeceras por tabla y detecta sub-conceptos indentados.
 */

export interface MemoriaTableRow {
  cells: string[];
  is_subconcept?: boolean;
}

export interface TablaParseadaMeta {
  cabecera: string[];
  esComparativaAnual: boolean;
  esTablaTexto: boolean;
}

const PATRON_TITULO_CABECERA =
  /^(MOVIMIENTOS?\b|AMORTIZACI[ÓO]N\b|INFORMACI[ÓO]N SOBRE|ELEMENTO\b|DESCRIPCI[ÓO]N\b|CONCEPTO\b|BASE DE REPARTO\b|DISTRIBUCI[ÓO]N\b|IDENTIFICACI[ÓO]N\b|INSTRUMENTOS\b|CR[EÉ]DITOS\b|DERIVADOS\b|TOTAL\b|DEUDORES\b|APROVISIONAMIENTOS\b|HONORARIOS\b|ABONOS\b|CARGOS\b|SALDOS\b|CONCEPTOS\b|Categor[ií]a\b|EJERCICIO\b|INVERSIONES\b|SUBVENCIONES\b|MOVIMIENTO\b|Hacienda\b)/i;

/** Elimina caracteres de control sin colapsar la celda. */
export function limpiarValorCelda(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    // Pie de página A3SOC (- PAGE -) que a veces se cuela tras el último párrafo
    .replace(/\s+-\s*\d{1,4}\s*-\s*$/g, "")
    .trim();
}

/**
 * Parsea una línea con delimitador pipe preservando celdas vacías internas.
 * Solo elimina la celda vacía final por un pipe sobrante al final de línea.
 */
export function parsearLineaTabla(linea: string): string[] {
  const trimmed = linea.trim();
  const cells = trimmed.split("|").map((c) => limpiarValorCelda(c));
  if (trimmed.endsWith("|") && cells.length > 1 && cells[cells.length - 1] === "") {
    cells.pop();
  }
  return cells;
}

/** Ítem de lista alfabética/numérica (a), b), 1., etc.). */
export function celdaEsItemLista(celda: string): boolean {
  return /^(?:[a-z]\)|\d+\)|\d+\.)\s+\S/i.test(limpiarValorCelda(celda));
}

/** Tabla RTF/Word que en realidad es una lista en columnas (objeto social, etc.). */
export function esTablaListaPseudo(filas: string[][]): boolean {
  const celdas = filas
    .flat()
    .map(limpiarValorCelda)
    .filter((c) => c.length > 0);
  if (celdas.length < 2) return false;
  const items = celdas.filter(celdaEsItemLista);
  return items.length >= 2 && items.length >= celdas.length * 0.75;
}

/** Convierte una pseudo-tabla de lista a texto vertical (un ítem por línea). */
export function filasTablaListaAVertical(filas: string[][]): string {
  return filas
    .flat()
    .map(limpiarValorCelda)
    .filter((c) => c.length > 0)
    .join("\n");
}

/** Fila de tabla: al menos 2 celdas delimitadas (pueden estar vacías). */
export function esLineaTabla(linea: string): boolean {
  const t = linea.trim();
  if (!t.includes("|")) return false;
  const cells = parsearLineaTabla(t);
  if (cells.length < 2) return false;
  const conTexto = cells.filter((c) => c.length > 0);
  if (conTexto.length >= 2 && conTexto.every(celdaEsItemLista)) return false;
  return true;
}

/** Cabecera comparativa anual: celdas (salvo la 1ª) son años o IMPORTE 20xx. */
export function esCabeceraAnual(cells: string[]): boolean {
  if (cells.length < 2) return false;
  const resto = cells.slice(1).filter((c) => c.length > 0);
  if (resto.length === 0) return false;
  return resto.every(
    (c) => /^(19|20)\d{2}$/.test(c) || /\bimporte\s+(19|20)\d{2}\b/i.test(c)
  );
}

function normalizarCabecera(cells: string[]): string {
  return cells.map(limpiarValorCelda).join("\t").toUpperCase();
}

function celdaPareceImporte(c: string): boolean {
  const t = c.trim();
  if (!t) return false;
  return /^-?[\d.,]+$/.test(t.replace(/\s/g, ""));
}

function columnasParecenCabecera(cells: string[]): boolean {
  const resto = cells.slice(1);
  if (resto.every((c) => !c.trim())) return false;
  return resto.every((c) => {
    const t = c.trim();
    if (!t) return true;
    if (/\bimporte\s+(19|20)\d{2}\b/i.test(t)) return true;
    if (/^(19|20)\d{2}$/.test(t)) return true;
    if (/\b(amort|años|m[eé]todo|vto|d[ií]as|%|cifra|informaci[oó]n)\b/i.test(t)) return true;
    if (!celdaPareceImporte(t) && t.length >= 2) return true;
    return false;
  });
}

/** Cabecera titular de tabla (MOVIMIENTOS…, ELEMENTO…, INFORMACIÓN SOBRE…). */
export function esCabeceraTituloTabla(cells: string[]): boolean {
  if (cells.length < 2) return false;
  if (!columnasParecenCabecera(cells)) return false;

  const c0 = cells[0] ?? "";
  if (PATRON_TITULO_CABECERA.test(c0)) return true;

  if (c0.length >= 12 && c0 === c0.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{4}/.test(c0)) {
    return true;
  }
  return false;
}

export function esCabeceraTabla(cells: string[]): boolean {
  return esCabeceraAnual(cells) || esCabeceraTituloTabla(cells);
}

/**
 * Decide si una fila inicia una tabla nueva separada de la tabla en curso.
 * Se usa cuando dos tablas van consecutivas sin párrafo intermedio.
 */
export function debeIniciarNuevaTabla(cells: string[], tablaActual: string[][]): boolean {
  if (tablaActual.length === 0) return false;
  if (!esCabeceraTabla(cells)) return false;

  const headerActual = tablaActual[0] ?? [];
  if (normalizarCabecera(cells) === normalizarCabecera(headerActual)) return false;

  const tieneFilasDatos = tablaActual.some((r, idx) => idx > 0 || !esCabeceraTabla(r));
  if (!tieneFilasDatos) return false;

  if (esCabeceraAnual(cells) && tablaActual.some((r) => !esCabeceraAnual(r))) return true;
  if (esCabeceraTituloTabla(cells)) return true;

  return false;
}

/** Analiza la primera fila para clasificar columnas (comparativa anual vs texto). */
export function analizarCabeceraTabla(cabecera: string[]): TablaParseadaMeta {
  const columnaEsAnual = (c: string): boolean => {
    const t = c.trim();
    if (/^(19|20)\d{2}$/.test(t)) return true;
    if (/\bimporte\s+(19|20)\d{2}\b/i.test(t)) return true;
    if (/\b(19|20)\d{2}\b/.test(t) && /\b(amort|importe|saldo|d[ií]as|%|cifra)\b/i.test(t)) return true;
    return false;
  };

  const esComparativaAnual = cabecera.slice(1).some(columnaEsAnual);

  const textoCabecera = cabecera.join(" ");
  const tieneMetodoAmort =
    /\bm[eé]todo\b/i.test(textoCabecera) || /\bvida\s+[uú]til\b/i.test(textoCabecera);
  const tieneColumnasSoloTexto = cabecera.slice(1).every((c) => {
    const t = c.trim();
    if (!t) return true;
    return !celdaPareceImporte(t) && !columnaEsAnual(t);
  });

  const esTablaTexto =
    tieneMetodoAmort ||
    (tieneColumnasSoloTexto && !esComparativaAnual) ||
    /\bnaturaleza\b/i.test(textoCabecera) ||
    /\bidentificaci[oó]n\b/i.test(textoCabecera);

  return { cabecera: cabecera.map(limpiarValorCelda), esComparativaAnual, esTablaTexto };
}

/** Detecta sub-conceptos indentados con guion en la primera columna. */
export function detectarSubconcepto(celdaRaw: string): { text: string; is_subconcept: boolean } {
  const sinControl = celdaRaw.replace(/[\u0000-\u001F\u007F]/g, "");
  const m = sinControl.match(/^(\s*)[-–—]\s*(.+)$/);
  if (m) {
    return { text: m[2].replace(/\s+/g, " ").trim(), is_subconcept: true };
  }
  return { text: limpiarValorCelda(celdaRaw), is_subconcept: false };
}

/** Alinea todas las filas al ancho de la cabecera sin colapsar celdas vacías internas. */
export function normalizarAnchoFilas(rawFilas: string[][]): string[][] {
  if (rawFilas.length === 0) return [];
  const ancho = Math.max(...rawFilas.map((f) => f.length));
  const normalizadas = rawFilas.map((fila) => alinearFilaAlAnchoCabecera(fila, ancho));

  // Solo recorta columnas vacías al final si TODAS las filas las tienen vacías
  // (no elimina columnas intermedias ni la primera columna vacía de etiqueta).
  while ((normalizadas[0]?.length ?? 0) > 1) {
    const last = normalizadas[0].length - 1;
    if (normalizadas.every((f) => !(f[last] ?? "").trim())) {
      normalizadas.forEach((f, i) => {
        normalizadas[i] = f.slice(0, last);
      });
    } else {
      break;
    }
  }

  return normalizadas;
}

/** Convierte filas crudas en filas con metadatos (sub-conceptos en columna 0). */
export function enriquecerFilasTabla(rawFilas: string[][]): MemoriaTableRow[] {
  const normalizadas = normalizarAnchoFilas(rawFilas);
  return normalizadas.map((cells, idx) => {
    if (idx === 0) return { cells: [...cells] };

    const concepto = detectarSubconcepto(cells[0] ?? "");
    const fila: MemoriaTableRow = {
      cells: [concepto.text, ...cells.slice(1)],
    };
    if (concepto.is_subconcept) fila.is_subconcept = true;
    return fila;
  });
}

/** Serializa filas a texto pipe preservando celdas vacías. */
export function serializarFilasTabla(filas: MemoriaTableRow[] | string[][]): string {
  const rows = filas.map((f) => ("cells" in f ? f.cells : f));
  return rows.map((fila) => fila.join(" | ")).join("\n");
}

/** Procesa un bloque de filas crudas: normaliza ancho, enriquece y analiza cabecera. */
export function procesarBloqueTabla(rawFilas: string[][]): {
  rows: MemoriaTableRow[];
  meta: TablaParseadaMeta;
} {
  const rows = enriquecerFilasTabla(rawFilas);
  const meta = analizarCabeceraTabla(rows[0]?.cells ?? []);
  return { rows, meta };
}

/**
 * Alinea una fila al ancho de la cabecera rellenando con celdas vacías al final.
 * No concatena texto a la fila anterior (evita fusionar descripción con importes).
 */
export function alinearFilaAlAnchoCabecera(cells: string[], anchoCabecera: number): string[] {
  if (anchoCabecera <= 0) return cells.map(limpiarValorCelda);
  const aligned = cells.map(limpiarValorCelda).slice(0, anchoCabecera);
  while (aligned.length < anchoCabecera) aligned.push("");
  return aligned;
}

/**
 * @deprecated Usar alinearFilaAlAnchoCabecera. Conservado para compatibilidad; ya no anexa celdas.
 */
export function intentarAnexarCeldasParciales(
  cells: string[],
  tabla: string[][]
): boolean {
  if (tabla.length === 0 || cells.length === 0) return false;
  const anchoCabecera = tabla[0]?.length ?? 0;
  if (anchoCabecera === 0) return false;

  if (cells.length < anchoCabecera) {
    tabla.push(alinearFilaAlAnchoCabecera(cells, anchoCabecera));
    return true;
  }
  return false;
}
