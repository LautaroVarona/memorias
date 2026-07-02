import { parsearLineaTabla, detectarSubconcepto } from "@/lib/parsers/memoria/table-parser";
import { segmentarBloquesDeTexto } from "@/lib/parsers/memoria/extractors";
import type { MemoriaBloque } from "@/types/domain";
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

function bloquesToSegments(bloques: MemoriaBloque[]): MemoriaSegment[] {
  return bloques.map((b) => {
    if (b.type === "text") return { type: "text", content: b.content };
    return {
      type: "table",
      rows: b.rows,
      cabecera: b.cabecera,
      esComparativaAnual: b.esComparativaAnual,
      esTablaTexto: b.esTablaTexto,
    };
  });
}

export function cellLooksNumeric(cell: string): boolean {
  const t = cell.trim();
  if (!/\d/.test(t)) return false;
  return /^[\d\s.,\-–—()+€%]+$/.test(t);
}

/** Segmenta el contenido de un apartado reutilizando el mismo pipeline del parser. */
export function segmentMemoriaContent(text: string): MemoriaSegment[] {
  return bloquesToSegments(segmentarBloquesDeTexto(text));
}

/** Convierte filas enriquecidas a matriz plana (p. ej. para diff). */
export function tableRowsToMatrix(rows: MemoriaTableRow[]): string[][] {
  return rows.map((r) => [...r.cells]);
}

/** Detecta sub-concepto en celda de etiqueta (exportado para diff). */
export { detectarSubconcepto };
