import { parseImporte } from "@/lib/parsers/memoria/extractors";
import { etiquetaFilaParaAlineacion, colapsarColumnaNifVacia } from "@/lib/parsers/memoria/table-parser";
import { compareWithTolerance } from "@/lib/rules/helpers/accounts";
import { celdaImporteTieneValor } from "@/lib/rules/helpers/tablas-interanual";
import { normalizarTextoApartado } from "@/lib/rules/helpers/text-normalize";
import type { LineDiffKind } from "./apartado-line-diff";
import { parseTableRow } from "./parse-pipe-table";

/** Fila comparada lado a lado: celdas verbatim de cada memoria (null si la fila no existe). */
export interface SideBySideRow {
  kind: LineDiffKind;
  prior: string[] | null;
  current: string[] | null;
}

/**
 * Comparación de una tabla mostrada TAL CUAL en cada memoria (sin fusionar
 * columnas): se conservan las cabeceras y celdas originales de cada ejercicio y
 * solo se alinean las filas por etiqueta para poder pintarlas en paralelo.
 */
export interface ComparedTable {
  priorHeader: string[];
  currentHeader: string[];
  priorCols: number;
  currentCols: number;
  /** Columna del año compartido (continuidad interanual) en cada memoria, si existe. */
  priorSharedCol: number | null;
  currentSharedCol: number | null;
  rows: SideBySideRow[];
}

/** Elimina saltos de página, espacios no separables y ruido estructural en celdas. */
export function limpiarCeldaTabla(cell: string): string {
  return cell
    .replace(/\f/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+-\s*\d{1,4}\s*-\s*$/g, "")
    .trim();
}

function normalizarEtiquetaFila(label: string): string {
  return normalizarTextoApartado(label)
    .replace(/\bimporte\s+20\d{2}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRowsFromText(text: string): string[][] {
  const rows = text
    .split("\n")
    .map((line) => limpiarCeldaTabla(line))
    .filter((line) => line.includes("|"))
    .map(parseTableRow)
    .filter((row) => row.length > 0)
    .filter((row) => !esFilaDecorativa(row));
  return normalizarFilasTabla(rows);
}

function esCeldaDecorativa(cell: string): boolean {
  const t = limpiarCeldaTabla(cell);
  if (!t) return true;
  return /^[-–—_=.\s]+$/.test(t);
}

/**
 * El parser de Word a veces deja filas "fantasma" de maquetación (--- | --- | ---).
 * No aportan datos y provocan saltos/filas extra en la comparativa.
 */
function esFilaDecorativa(row: string[]): boolean {
  if (row.length === 0) return true;
  return row.every((cell) => esCeldaDecorativa(cell));
}

/** Cabecera con columnas IMPORTE / año comparativo (3+ columnas). */
function esCabeceraImportes(header: string[]): boolean {
  if (header.length < 3) return false;
  return header.slice(1).some((c) => /\bimporte\b/i.test(c) || /\b(19|20)\d{2}\b/.test(c));
}

/**
 * Alinea cada fila al ancho de la cabecera y repara filas colapsadas donde se
 * perdió la celda vacía del ejercicio actual (etiqueta | importe → etiqueta | | importe).
 */
function normalizarFilasTabla(rows: string[][]): string[][] {
  if (rows.length === 0) return rows;
  rows = colapsarColumnaNifVacia(rows);
  const header = rows[0];
  const width = header.length;
  const importes = esCabeceraImportes(header);

  return rows.map((row, idx) => {
    if (idx === 0) {
      while (row.length < width) row.push("");
      return row.slice(0, width);
    }

    let cells = [...row];
    if (importes && width >= 3 && cells.length === 2) {
      const [label, val] = cells;
      if (parseImporte(label) === null && parseImporte(val) !== null) {
        cells = [label, "", val];
      }
    }

    while (cells.length < width) cells.push("");
    return cells.slice(0, width);
  });
}

/** Fila de cabecera anual ("… | 2024 | 2023" o "… | IMPORTE 2024 | …"). */
function esFilaCabeceraAnual(cells: string[]): boolean {
  const rest = cells.slice(1).filter((c) => c.length > 0);
  if (rest.length === 0) return false;
  return rest.every(
    (c) => /^(19|20)\d{2}$/.test(c) || /\bimporte\s+(19|20)\d{2}\b/i.test(c)
  );
}

/** Dos cifras son equivalentes si el valor numérico coincide (ignora formato y espacios). */
export function cifrasEquivalentes(a: string, b: string, tolerancia = 0.005): boolean {
  const pa = parseImporte(limpiarCeldaTabla(a));
  const pb = parseImporte(limpiarCeldaTabla(b));
  if (pa !== null && pb !== null) return compareWithTolerance(pa, pb, tolerancia);
  return false;
}

/** Celda con dato en la columna del año compartido (importe o cifra significativa). */
export function celdaCompartidaTieneValor(cell: string): boolean {
  return celdaImporteTieneValor(limpiarCeldaTabla(cell));
}

function yearsInHeader(header: string[]): number[] {
  return header.slice(1).flatMap((c) => {
    const m = c.match(/\b(19|20)\d{2}\b/);
    return m ? [parseInt(m[0], 10)] : [];
  });
}

function yearColIndex(header: string[], year: number): number | null {
  for (let i = 1; i < header.length; i++) {
    const m = header[i].match(/\b(19|20)\d{2}\b/);
    if (m && parseInt(m[0], 10) === year) return i;
  }
  return null;
}

/** Alinea filas de cuerpo por etiqueta (LCS); las no emparejadas quedan como []. */
function alignRows(
  priorBody: string[][],
  currentBody: string[][],
  priorHeader: string[],
  currentHeader: string[]
): { prior: string[]; current: string[] }[] {
  const priorLabels = priorBody.map((r) => etiquetaFilaParaAlineacion(r, priorHeader));
  const currentLabels = currentBody.map((r) => etiquetaFilaParaAlineacion(r, currentHeader));

  const n = priorLabels.length;
  const m = currentLabels.length;
  const dp = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const match = priorLabels[i] === currentLabels[j] && priorLabels[i].length > 0;
      dp[i][j] = match ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const pairs: { prior: string[]; current: string[] }[] = [];
  let i = 0;
  let j = 0;

  while (i < n || j < m) {
    if (i < n && j < m && priorLabels[i] === currentLabels[j] && priorLabels[i].length > 0) {
      pairs.push({ prior: priorBody[i], current: currentBody[j] });
      i++;
      j++;
    } else if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) {
      pairs.push({ prior: priorBody[i], current: [] });
      i++;
    } else {
      pairs.push({ prior: [], current: currentBody[j] });
      j++;
    }
  }

  return pairs;
}

/**
 * Compara dos bloques de tabla preservando la estructura original de cada
 * ejercicio. Las filas se alinean por etiqueta; la clasificación de "ruptura"
 * se basa en la columna del año compartido (p. ej. la columna 2024 debe
 * coincidir entre la memoria 2024 y la memoria 2025).
 */
export function buildTableComparison(priorText: string, currentText: string): ComparedTable {
  const priorRows = parseRowsFromText(priorText);
  const currentRows = parseRowsFromText(currentText);

  const priorHeader = priorRows[0] ?? [];
  const currentHeader = currentRows[0] ?? [];
  const priorBody = priorRows.slice(1).filter((r) => !esFilaCabeceraAnual(r));
  const currentBody = currentRows.slice(1).filter((r) => !esFilaCabeceraAnual(r));

  const compartidos = yearsInHeader(priorHeader).filter((y) =>
    yearsInHeader(currentHeader).includes(y)
  );
  const sharedYear = compartidos.length > 0 ? Math.max(...compartidos) : null;
  const priorSharedCol = sharedYear !== null ? yearColIndex(priorHeader, sharedYear) : null;
  const currentSharedCol = sharedYear !== null ? yearColIndex(currentHeader, sharedYear) : null;

  const rows: SideBySideRow[] = alignRows(priorBody, currentBody, priorHeader, currentHeader).map(({ prior, current }) => {
    const hasPrior = prior.length > 0;
    const hasCurrent = current.length > 0;

    let kind: LineDiffKind = "unchanged";
    if (hasPrior && !hasCurrent) kind = "removed";
    else if (!hasPrior && hasCurrent) kind = "added";
    else if (priorSharedCol !== null && currentSharedCol !== null) {
      const pv = prior[priorSharedCol] ?? "";
      const cv = current[currentSharedCol] ?? "";
      const priorHas = celdaCompartidaTieneValor(pv);
      const currentHas = celdaCompartidaTieneValor(cv);
      if (priorHas && currentHas && !cifrasEquivalentes(pv, cv)) kind = "structural";
      else if (priorHas !== currentHas) kind = "structural";
    }

    return { kind, prior: hasPrior ? prior : null, current: hasCurrent ? current : null };
  });

  const priorCols = Math.max(priorHeader.length, ...priorBody.map((r) => r.length), 1);
  const currentCols = Math.max(currentHeader.length, ...currentBody.map((r) => r.length), 1);

  return {
    priorHeader,
    currentHeader,
    priorCols,
    currentCols,
    priorSharedCol,
    currentSharedCol,
    rows,
  };
}

export function tableHasChanges(table: ComparedTable): boolean {
  return table.rows.some((r) => r.kind !== "unchanged");
}

export function summarizeTableDiff(table: ComparedTable): {
  structuralCount: number;
  expectedCount: number;
} {
  let structuralCount = 0;
  let expectedCount = 0;
  for (const row of table.rows) {
    if (row.kind === "unchanged") continue;
    if (row.kind === "expected") expectedCount++;
    else structuralCount++;
  }
  return { structuralCount, expectedCount };
}
