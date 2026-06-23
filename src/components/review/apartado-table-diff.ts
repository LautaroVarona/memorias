import { parseImporte } from "@/lib/parsers/memoria/extractors";
import { compareWithTolerance } from "@/lib/rules/helpers/accounts";
import {
  normalizarTextoApartado,
  normalizarTextoComparacionInteranual,
} from "@/lib/rules/helpers/text-normalize";
import type { LineDiffKind } from "./apartado-line-diff";
import { parseTableRow } from "./parse-pipe-table";

export interface AlignedColumn {
  key: string;
  headerPrior: string;
  headerCurrent: string;
  priorIndex: number | null;
  currentIndex: number | null;
}

export interface ComparedTableCell {
  kind: LineDiffKind;
  prior: string;
  current: string;
}

export interface ComparedTableRow {
  kind: LineDiffKind;
  label: string;
  cells: ComparedTableCell[];
}

export interface ComparedTable {
  columns: AlignedColumn[];
  rows: ComparedTableRow[];
}

/** Elimina saltos de página, espacios no separables y ruido estructural en celdas. */
export function limpiarCeldaTabla(cell: string): string {
  return cell
    .replace(/\f/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normalizarEtiquetaFila(label: string): string {
  return normalizarTextoApartado(label)
    .replace(/\bimporte\s+20\d{2}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clave semántica de columna: año, etiqueta o slug del encabezado. */
export function claveColumnaTabla(header: string, colIndex: number): string {
  const norm = normalizarTextoApartado(limpiarCeldaTabla(header));
  const yearMatch = norm.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) return `year:${yearMatch[0]}`;

  if (
    colIndex === 0 ||
    /^(concepto|denominacion|descripcion|movimientos|partida|detalle)\b/.test(norm)
  ) {
    return "label";
  }

  const slug = norm
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return slug ? `col:${slug}` : `col:extra_${colIndex}`;
}

function parseRowsFromText(text: string): string[][] {
  return text
    .split("\n")
    .map((line) => limpiarCeldaTabla(line))
    .filter((line) => line.includes("|"))
    .map(parseTableRow)
    .filter((row) => row.length > 0);
}

function esFilaCabeceraAnual(cells: string[]): boolean {
  const joined = cells.join(" ").toLowerCase();
  if (/importe\s+20\d{2}/.test(joined) && cells.filter((c) => parseImporte(c) !== null).length === 0) {
    return true;
  }
  const label = (cells[0] ?? "").toLowerCase();
  return /^movimientos\s/.test(label) && /importe\s+20\d{2}/.test(joined);
}

/** Dos cifras son equivalentes si el valor numérico coincide (ignora formato y espacios). */
export function cifrasEquivalentes(a: string, b: string, tolerancia = 0.005): boolean {
  const pa = parseImporte(limpiarCeldaTabla(a));
  const pb = parseImporte(limpiarCeldaTabla(b));
  if (pa !== null && pb !== null) return compareWithTolerance(pa, pb, tolerancia);
  return false;
}

/** Cambio solo de cifras o años en una celda, no de redacción. */
function isSoloCambioCelda(prior: string, current: string): boolean {
  if (prior === current) return false;
  return normalizarTextoComparacionInteranual(prior) === normalizarTextoComparacionInteranual(current);
}

function classifyCell(prior: string, current: string): LineDiffKind {
  const p = limpiarCeldaTabla(prior);
  const c = limpiarCeldaTabla(current);

  if (p === c) return "unchanged";
  if (!p && !c) return "unchanged";
  if (cifrasEquivalentes(p, c)) return "unchanged";

  if (!p && c) return "added";
  if (p && !c) return "removed";

  if (isSoloCambioCelda(p, c)) return "expected";

  const pn = parseImporte(p);
  const cn = parseImporte(c);
  if (pn !== null && cn !== null) return "expected";

  return "structural";
}

const SEVERITY: Record<LineDiffKind, number> = {
  unchanged: 0,
  expected: 1,
  added: 2,
  removed: 2,
  structural: 3,
};

function worstKind(kinds: LineDiffKind[]): LineDiffKind {
  return kinds.reduce(
    (worst, k) => (SEVERITY[k] > SEVERITY[worst] ? k : worst),
    "unchanged" as LineDiffKind
  );
}

/** Alinea columnas de dos tablas por clave semántica (año, etiqueta, nombre). */
export function alinearColumnasTabla(
  priorHeader: string[],
  currentHeader: string[]
): AlignedColumn[] {
  const columns: AlignedColumn[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < priorHeader.length; i++) {
    const key = claveColumnaTabla(priorHeader[i], i);
    if (seen.has(key)) continue;
    seen.add(key);
    const currentIdx = currentHeader.findIndex((h, j) => claveColumnaTabla(h, j) === key);
    columns.push({
      key,
      headerPrior: priorHeader[i],
      headerCurrent: currentIdx >= 0 ? currentHeader[currentIdx] : "",
      priorIndex: i,
      currentIndex: currentIdx >= 0 ? currentIdx : null,
    });
  }

  for (let j = 0; j < currentHeader.length; j++) {
    const key = claveColumnaTabla(currentHeader[j], j);
    if (seen.has(key)) continue;
    seen.add(key);
    columns.push({
      key,
      headerPrior: "",
      headerCurrent: currentHeader[j],
      priorIndex: null,
      currentIndex: j,
    });
  }

  return columns;
}

function alignRows(
  priorBody: string[][],
  currentBody: string[][]
): { prior: string[]; current: string[] }[] {
  const priorLabels = priorBody.map((r) => normalizarEtiquetaFila(r[0] ?? ""));
  const currentLabels = currentBody.map((r) => normalizarEtiquetaFila(r[0] ?? ""));

  const n = priorLabels.length;
  const m = currentLabels.length;
  const dp = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const match =
        priorLabels[i] === currentLabels[j] &&
        priorLabels[i].length >= 3;
      dp[i][j] = match ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const pairs: { prior: string[]; current: string[] }[] = [];
  let i = 0;
  let j = 0;

  while (i < n || j < m) {
    if (
      i < n &&
      j < m &&
      priorLabels[i] === currentLabels[j] &&
      priorLabels[i].length >= 3
    ) {
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

function getCell(row: string[], index: number | null): string {
  if (index === null || index < 0) return "";
  return limpiarCeldaTabla(row[index] ?? "");
}

/**
 * Compara dos bloques de tabla alineando columnas por semántica (no por índice).
 * Las columnas adicionales de un ejercicio no desplazan las equivalentes.
 */
export function buildTableComparison(priorText: string, currentText: string): ComparedTable {
  const priorRows = parseRowsFromText(priorText);
  const currentRows = parseRowsFromText(currentText);

  if (priorRows.length === 0 && currentRows.length === 0) {
    return { columns: [], rows: [] };
  }

  const [priorHeader, ...priorBody] = priorRows.length > 0 ? priorRows : [[]];
  const [currentHeader, ...currentBody] = currentRows.length > 0 ? currentRows : [[]];

  const priorBodyFiltered = priorBody.filter((r) => !esFilaCabeceraAnual(r));
  const currentBodyFiltered = currentBody.filter((r) => !esFilaCabeceraAnual(r));

  const columns = alinearColumnasTabla(priorHeader, currentHeader);
  const rowPairs = alignRows(priorBodyFiltered, currentBodyFiltered);

  const rows: ComparedTableRow[] = rowPairs.map(({ prior, current }) => {
    const cells: ComparedTableCell[] = columns.map((col) => {
      const priorVal = getCell(prior, col.priorIndex);
      const currentVal = getCell(current, col.currentIndex);
      return {
        kind: classifyCell(priorVal, currentVal),
        prior: priorVal,
        current: currentVal,
      };
    });

    const label = current[0]?.trim() || prior[0]?.trim() || "";
    const cellKinds = cells.map((c) => c.kind);
    const rowKind = worstKind(cellKinds);

    return { kind: rowKind, label, cells };
  });

  return { columns, rows };
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
