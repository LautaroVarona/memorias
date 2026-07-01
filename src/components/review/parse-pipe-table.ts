import {
  celdaEsItemLista,
  debeIniciarNuevaTabla,
  detectarSubconcepto,
  esLineaTabla,
  esTablaListaPseudo,
  filasTablaListaAVertical,
  fusionarEtiquetaEnCeldas,
  limpiarValorCelda,
  pareceEtiquetaFilaSuelta,
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
    if (esTablaListaPseudo(tableBuffer)) {
      textBuffer.push(filasTablaListaAVertical(tableBuffer));
      tableBuffer = [];
      return;
    }
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
      let cells = parseTableRow(line);
      let etiquetaPendiente: string | null = null;

      if (textBuffer.length > 0) {
        const ultima = textBuffer[textBuffer.length - 1]?.trim() ?? "";
        if (pareceEtiquetaFilaSuelta(ultima)) {
          etiquetaPendiente = ultima;
          textBuffer.pop();
        }
      }

      if (textBuffer.length > 0) flushText();

      ({ cells, etiquetaPendiente } = fusionarEtiquetaEnCeldas(cells, etiquetaPendiente));
      if (etiquetaPendiente) {
        textBuffer.push(etiquetaPendiente);
      }

      if (tableBuffer.length > 0 && debeIniciarNuevaTabla(cells, tableBuffer)) {
        flushTable();
      }
      tableBuffer.push(cells);
    } else {
      const trimmed = line.trim();
      if (trimmed && tableBuffer.length > 0 && pareceEtiquetaFilaSuelta(trimmed)) {
        const ancho = tableBuffer[0].length;
        tableBuffer.push(
          Array.from({ length: ancho }, (_, i) => (i === 0 ? trimmed : ""))
        );
        continue;
      }

      flushTable();
      if (trimmed.includes("|")) {
        const cells = parsearLineaTabla(trimmed).map(limpiarValorCelda).filter((c) => c.length > 0);
        if (cells.length >= 2 && cells.every(celdaEsItemLista)) {
          textBuffer.push(...cells);
          continue;
        }
      }
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
