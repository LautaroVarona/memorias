/**
 * Parser dinámico de tablas para memorias A3SOC.
 * Preserva celdas vacías, infiere cabeceras por tabla y detecta sub-conceptos indentados.
 */

import { normalizarTextoApartado } from "@/lib/rules/helpers/text-normalize";

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
  if (trimmed.includes("|")) {
    const cells = trimmed.split("|").map((c) => limpiarValorCelda(c));
    if (trimmed.endsWith("|") && cells.length > 1 && cells[cells.length - 1] === "") {
      cells.pop();
    }
    return cells;
  }
  // Word/DOC puede emitir tablas separadas por tabulaciones en lugar de pipes.
  if (trimmed.includes("\t")) {
    return trimmed.split(/\t+/).map((c) => limpiarValorCelda(c));
  }
  return [limpiarValorCelda(trimmed)];
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
  if (!t.includes("|") && !t.includes("\t")) return false;
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

const ETIQUETA_NATURALEZA_VINCULADA =
  /^(entidad\s+(dependiente|dominante|vinculada)|sociedad\s+dominante|parte\s+vinculada|otras\s+partes\s+vinculadas)/i;

/** Nombre de empresa/sociedad (no es título de tabla). */
export function pareceNombreEmpresa(texto: string): boolean {
  const t = limpiarValorCelda(texto);
  if (t.length < 8) return false;
  if (ETIQUETA_NATURALEZA_VINCULADA.test(t)) return false;
  if (/\b(S\.?\s*L\.?\s*U?\.?|S\.?\s*A\.?|S\.?\s*COOP)\b/i.test(t)) return true;
  return false;
}

function normalizarEtiquetaFilaTabla(label: string): string {
  return normalizarTextoApartado(label)
    .replace(/\bimporte\s+20\d{2}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Etiqueta estable para alinear filas entre memorias.
 * En tablas de vinculadas el NIF suele ir vacío y el nombre en la 2.ª columna.
 */
export function etiquetaFilaParaAlineacion(cells: string[], header?: string[]): string {
  const candidatos: { label: string; score: number }[] = [];

  for (let i = 0; i < cells.length; i++) {
    const raw = cells[i] ?? "";
    const label = normalizarEtiquetaFilaTabla(raw);
    if (!label || ETIQUETA_NATURALEZA_VINCULADA.test(label)) continue;
    if (/^[A-Z]\d{7,8}[A-Z0-9]?$/i.test(raw.trim())) continue;

    let score = 0;
    const colHeader = header?.[i] ?? "";
    if (/\bIDENTIFICACI[ÓO]N\b/i.test(colHeader)) score += 12;
    if (/\bNIF\b/i.test(colHeader)) score -= 5;
    if (/\bDESCRIPCI[ÓO]N\b/i.test(colHeader)) score += 8;
    if (/\bCONCEPTO\b/i.test(colHeader)) score += 8;
    if (pareceNombreEmpresa(raw)) score += 6;
    if (i === 0) score += 2;
    if (label.length >= 10) score += 2;

    candidatos.push({ label, score });
  }

  candidatos.sort((a, b) => b.score - a.score);
  if (candidatos.length > 0 && candidatos[0].score > 0) return candidatos[0].label;

  return normalizarEtiquetaFilaTabla(cells[0] ?? "");
}

/** Si la columna NIF está vacía en todas las filas de datos, la elimina. */
export function colapsarColumnaNifVacia(filas: string[][]): string[][] {
  if (filas.length < 2) return filas;
  const header = filas[0];
  if (!/\bNIF\b/i.test(header[0] ?? "")) return filas;
  const datosVacios = filas.slice(1).every((fila) => !(fila[0] ?? "").trim());
  if (!datosVacios) return filas;
  return filas.map((fila) => fila.slice(1));
}

const PATRON_SUBTITULO_TABLA_VINCULADAS =
  /^(OTRAS\s+PARTES\s+VINCULADAS|EMPRESAS\s+DEPENDIENTES|EMPRESAS\s+ASOCIADAS|ENTIDAD\s+DOMINANTE|ENTIDADES\s+MULTIGRUPO|SOCIEDADES\s+MULTIGRUPO)/i;

/**
 * Párrafo narrativo o título descriptivo que precede a una tabla (no es etiqueta de fila).
 * Word binario A3SOC suele emitirlos en un párrafo aparte justo antes de la cabecera.
 */
export function pareceTextoIntroductorioTabla(linea: string): boolean {
  const t = limpiarValorCelda(linea);
  if (!t) return false;
  if (/:\s*$/.test(t)) return true;
  if (
    /\b(a continuaci[oó]n|se detallan?|es el siguiente|no ha habido|a fecha de|propuesta de|durante el ejercicio|ha sido el siguiente|presenta,?\s+durante)\b/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /\b(composici[oó]n de|importe neto|cifra de negocios|detalle por elementos|movimiento de la amortizaci[oó]n|movimientos? de la)\b/i.test(
      t
    )
  ) {
    return true;
  }
  if (/\bel importe total\b/i.test(t)) return true;
  if (/\b(son|es)\s+los?\s+siguientes?\b/i.test(t)) return true;
  if (/\bactivos financieros\b/i.test(t) && /:\s*$/.test(t)) return true;
  if (/\.\s*$/.test(t) && t.length >= 25) return true;
  if (/\b(de la|de las|de los|del ejercicio|en el ejercicio|los siguientes)\b/i.test(t) && t.length >= 20) {
    return true;
  }
  return false;
}

/**
 * Etiqueta de fila que Word a veces emite en un párrafo aparte (sin separadores de celda).
 * Típico en tablas de partes vinculadas del Word binario A3SOC.
 */
export function pareceEtiquetaFilaSuelta(linea: string): boolean {
  const t = limpiarValorCelda(linea);
  if (!t || t.length > 160 || linea.includes("|")) return false;
  if (pareceTextoIntroductorioTabla(t)) return false;
  if (celdaPareceImporte(t)) return false;
  if (celdaEsItemLista(t)) return false;
  if (PATRON_SUBTITULO_TABLA_VINCULADAS.test(t)) return false;
  if (/^(DESCRIPCI[ÓO]N|IDENTIFICACI[ÓO]N|CONCEPTO|NATURALEZA)\b/i.test(t)) return false;
  if (/^(La|El|Los|Las|Durante|Se muestran|En el ejercicio|Personal|Miembros|Participaci)/i.test(t) && t.length > 55) {
    return false;
  }
  if (/\.\s+[A-ZÁÉÍÓÚÑ]/.test(t)) return false;
  return true;
}

/** Inserta una etiqueta pendiente en la primera columna vacía de una fila tabular. */
export function fusionarEtiquetaEnCeldas(
  cells: string[],
  etiquetaPendiente: string | null
): { cells: string[]; etiquetaPendiente: string | null } {
  if (!etiquetaPendiente || (cells[0] ?? "").trim()) {
    return { cells, etiquetaPendiente };
  }
  const merged = [...cells];
  merged[0] = etiquetaPendiente;
  return { cells: merged, etiquetaPendiente: null };
}

/** Cabecera titular de tabla (MOVIMIENTOS…, ELEMENTO…, INFORMACIÓN SOBRE…). */
export function esCabeceraTituloTabla(cells: string[]): boolean {
  if (cells.length < 2) return false;
  if (!columnasParecenCabecera(cells)) return false;

  const c0 = cells[0] ?? "";
  if (pareceNombreEmpresa(c0)) return false;
  if (ETIQUETA_NATURALEZA_VINCULADA.test(c0)) return false;
  if (/\bentidad\s+dependiente\b/i.test(cells[1] ?? "")) return false;
  if (PATRON_SUBTITULO_TABLA_VINCULADAS.test(c0.trim())) return false;

  if (PATRON_TITULO_CABECERA.test(c0)) return true;

  if (c0.length >= 12 && c0 === c0.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{4}/.test(c0)) {
    return true;
  }
  return false;
}

export function esCabeceraTabla(cells: string[]): boolean {
  return esCabeceraAnual(cells) || esCabeceraTituloTabla(cells);
}

/** La tabla solo tiene fila de cabecera/título (sin filas de datos aún). */
export function tablaSoloTieneCabecera(tabla: string[][]): boolean {
  if (tabla.length !== 1) return false;
  const row = tabla[0] ?? [];
  return esCabeceraTabla(row) || esCabeceraTituloTabla(row);
}

/**
 * Word binario A3SOC a veces intercala el párrafo introductorio entre la cabecera
 * titular y las filas de datos de la misma tabla.
 */
export function introInterrumpeCabeceraTabla(linea: string, tabla: string[][]): boolean {
  const t = limpiarValorCelda(linea);
  if (!t || tabla.length === 0) return false;
  return pareceTextoIntroductorioTabla(t) && tablaSoloTieneCabecera(tabla);
}

/** Segunda parte de una tabla partida (cabecera titular + filas de datos separadas). */
export function tablasParecenMismaTablaPartida(cabecera: string[][], cuerpo: string[][]): boolean {
  if (!tablaSoloTieneCabecera(cabecera) || cuerpo.length === 0) return false;
  const ancho = cabecera[0]?.length ?? 0;
  if (ancho < 2) return false;
  const primeraCuerpo = cuerpo[0] ?? [];
  if (
    esCabeceraTabla(primeraCuerpo) &&
    normalizarCabecera(primeraCuerpo) === normalizarCabecera(cabecera[0] ?? [])
  ) {
    return false;
  }
  return cuerpo.every((fila) => fila.length <= ancho + 1);
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

  if (esCabeceraTituloTabla(cells)) {
    const esTablaFinancieraVinculadas =
      /\bDESCRIPCI[ÓO]N\b/i.test(headerActual[0] ?? "") &&
      headerActual.slice(1).some(
        (c) => /\b20\d{2}\b/.test(c) || /\b(EMPRESAS\s+DEPENDIENTES|OTRAS\s+PARTES\s+VINCULADAS)\b/i.test(c)
      );
    if (esTablaFinancieraVinculadas && (pareceNombreEmpresa(cells[0] ?? "") || PATRON_SUBTITULO_TABLA_VINCULADAS.test((cells[0] ?? "").trim()))) {
      return false;
    }
    return true;
  }

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
  const colapsadas = colapsarColumnaNifVacia(rawFilas);
  const ancho = Math.max(...colapsadas.map((f) => f.length));
  const normalizadas = colapsadas.map((fila) => alinearFilaAlAnchoCabecera(fila, ancho));

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
