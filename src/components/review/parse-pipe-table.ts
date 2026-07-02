import {
  celdaEsItemLista,
  debeIniciarNuevaTabla,
  detectarSubconcepto,
  esLineaTabla,
  esTablaListaPseudo,
  filasTablaListaAVertical,
  fusionarEtiquetaEnCeldas,
  introInterrumpeCabeceraTabla,
  limpiarValorCelda,
  pareceEtiquetaFilaSuelta,
  pareceTextoIntroductorioTabla,
  parsearLineaTabla,
  procesarBloqueTabla,
  tablasParecenMismaTablaPartida,
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

function textoEsIntroductorioDeTabla(content: string): boolean {
  const lineas = content
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lineas.length === 0 || lineas.length > 3) return false;
  return lineas.every(
    (l) => pareceTextoIntroductorioTabla(l) || (l.length <= 80 && /:\s*$/.test(l))
  );
}

function fusionarSegmentosTabla(
  a: Extract<MemoriaSegment, { type: "table" }>,
  b: Extract<MemoriaSegment, { type: "table" }>
): Extract<MemoriaSegment, { type: "table" }> {
  const filas = [
    ...a.rows.map((r) => r.cells),
    ...b.rows.map((r) => r.cells),
  ];
  const { rows, meta } = procesarBloqueTabla(filas);
  return {
    type: "table",
    rows,
    cabecera: meta.cabecera,
    esComparativaAnual: meta.esComparativaAnual,
    esTablaTexto: meta.esTablaTexto,
  };
}

function fusionarSegmentosTablaPartida(segments: MemoriaSegment[]): MemoriaSegment[] {
  const out: MemoriaSegment[] = [];
  let i = 0;

  while (i < segments.length) {
    const actual = segments[i];
    const siguiente = segments[i + 1];
    const tercero = segments[i + 2];

    if (
      actual?.type === "table" &&
      siguiente?.type === "text" &&
      textoEsIntroductorioDeTabla(siguiente.content) &&
      tercero?.type === "table" &&
      tablasParecenMismaTablaPartida(
        actual.rows.map((r) => r.cells),
        tercero.rows.map((r) => r.cells)
      )
    ) {
      out.push(siguiente, fusionarSegmentosTabla(actual, tercero));
      i += 3;
      continue;
    }

    if (
      actual?.type === "table" &&
      siguiente?.type === "table" &&
      tablasParecenMismaTablaPartida(
        actual.rows.map((r) => r.cells),
        siguiente.rows.map((r) => r.cells)
      )
    ) {
      out.push(fusionarSegmentosTabla(actual, siguiente));
      i += 2;
      continue;
    }

    out.push(actual!);
    i += 1;
  }

  return out;
}

function corregirOrdenIntroductorioSegmentos(segments: MemoriaSegment[]): MemoriaSegment[] {
  const out: MemoriaSegment[] = [];
  let i = 0;
  while (i < segments.length) {
    const actual = segments[i];
    const siguiente = segments[i + 1];
    if (
      actual?.type === "table" &&
      siguiente?.type === "text" &&
      textoEsIntroductorioDeTabla(siguiente.content)
    ) {
      out.push(siguiente, actual);
      i += 2;
      continue;
    }
    out.push(actual!);
    i += 1;
  }
  return out;
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
        flushText();
      }

      if (tableBuffer.length > 0 && debeIniciarNuevaTabla(cells, tableBuffer)) {
        flushTable();
      }
      tableBuffer.push(cells);
    } else {
      const trimmed = line.trim();
      if (trimmed && introInterrumpeCabeceraTabla(trimmed, tableBuffer)) {
        textBuffer.push(trimmed);
        flushText();
        continue;
      }

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

  flushTable();
  flushText();
  return fusionarSegmentosTablaPartida(corregirOrdenIntroductorioSegmentos(segments));
}

/** Convierte filas enriquecidas a matriz plana (p. ej. para diff). */
export function tableRowsToMatrix(rows: MemoriaTableRow[]): string[][] {
  return rows.map((r) => [...r.cells]);
}

/** Detecta sub-concepto en celda de etiqueta (exportado para diff). */
export { detectarSubconcepto };
