import {
  debeIniciarNuevaTabla,
  detectarSubconcepto,
  esLineaTabla,
  parsearLineaTabla,
  procesarBloqueTabla,
} from "@/lib/parsers/memoria/table-parser";
import type { MemoriaTableRow } from "@/types/domain";

export type MemoriaSegment =
  | { type: "text"; content: string }
  | {
      type: "table";
      rows: MemoriaTableRow[];
      cabecera: string[];
      esComparativaAnual?: boolean;
      esTablaTexto?: boolean;
    };

export function parseTableRow(line: string): string[] {
  return parsearLineaTabla(line);
}

export function cellLooksNumeric(cell: string): boolean {
  const t = cell.trim();
  if (!/\d/.test(t)) return false;
  return /^[\d\s.,\-–—()+€%]+$/.test(t);
}

function rowHasContent(cells: string[]): boolean {
  return cells.some((c) => c.trim().length >= 1);
}

function filterEmptyDataRows(rows: MemoriaTableRow[]): MemoriaTableRow[] {
  if (rows.length === 0) return rows;
  const [header, ...body] = rows;
  const filteredBody = body.filter((r) => rowHasContent(r.cells));
  if (filteredBody.length === 0) {
    return rowHasContent(header.cells) ? [header] : [];
  }
  return [header, ...filteredBody];
}

function parseTableLines(lines: string[]): MemoriaTableRow[] {
  const raw = lines.filter(esLineaTabla).map(parseTableRow).filter((r) => r.length >= 2);
  if (raw.length === 0) return [];
  const { rows } = procesarBloqueTabla(raw);
  return filterEmptyDataRows(rows);
}

export function segmentMemoriaContent(text: string): MemoriaSegment[] {
  const lines = text.split("\n");
  const segments: MemoriaSegment[] = [];
  let textBuffer: string[] = [];
  let tableBuffer: string[][] = [];

  function flushText() {
    if (textBuffer.length === 0) return;
    const content = textBuffer.join("\n").trim();
    if (content) segments.push({ type: "text", content });
    textBuffer = [];
  }

  function flushTable() {
    if (tableBuffer.length === 0) return;
    const { rows, meta } = procesarBloqueTabla(tableBuffer);
    if (rows.length > 0) {
      segments.push({
        type: "table",
        rows,
        cabecera: meta.cabecera,
        esComparativaAnual: meta.esComparativaAnual,
        esTablaTexto: meta.esTablaTexto,
      });
    }
    tableBuffer = [];
  }

  for (const line of lines) {
    if (esLineaTabla(line)) {
      flushText();
      const cells = parseTableRow(line);
      if (tableBuffer.length > 0 && debeIniciarNuevaTabla(cells, tableBuffer)) {
        flushTable();
      }
      tableBuffer.push(cells);
    } else {
      flushTable();
      textBuffer.push(line);
    }
  }

  flushText();
  flushTable();
  return segments;
}

/** Convierte filas enriquecidas a matriz plana (p. ej. para diff). */
export function tableRowsToMatrix(rows: MemoriaTableRow[]): string[][] {
  return rows.map((r) => [...r.cells]);
}

/** Detecta sub-concepto en celda de etiqueta (exportado para diff). */
export { detectarSubconcepto };
