export type MemoriaSegment =
  | { type: "text"; content: string }
  | { type: "table"; rows: string[][] };

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  return trimmed.split("|").filter((c) => c.trim().length > 0).length >= 2;
}

/**
 * Cabecera de tabla comparativa anual: celdas (salvo la 1ª) son años "2024" o
 * "IMPORTE 2024". Permite separar dos tablas contiguas sin texto entre medias
 * (p. ej. BASE DE REPARTO seguida de DISTRIBUCIÓN).
 */
function isAnnualHeaderRow(cells: string[]): boolean {
  if (cells.length < 2) return false;
  const rest = cells.slice(1).filter((c) => c.length > 0);
  if (rest.length === 0) return false;
  return rest.every((c) => /^(19|20)\d{2}$/.test(c) || /\bimporte\s+(19|20)\d{2}\b/i.test(c));
}

export function parseTableRow(line: string): string[] {
  return line
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

export function cellLooksNumeric(cell: string): boolean {
  const t = cell.trim();
  if (!/\d/.test(t)) return false;
  return /^[\d\s.,\-–—()+€%]+$/.test(t);
}

function rowHasContent(cells: string[]): boolean {
  return cells.some((c) => c.trim().length >= 1);
}

function filterEmptyDataRows(rows: string[][]): string[][] {
  if (rows.length === 0) return rows;
  const [header, ...body] = rows;
  const filteredBody = body.filter(rowHasContent);
  if (filteredBody.length === 0) {
    return rowHasContent(header) ? [header] : [];
  }
  return [header, ...filteredBody];
}

function parseTableLines(lines: string[]): string[][] {
  const rows = lines.map(parseTableRow).filter((r) => r.length > 0);
  return filterEmptyDataRows(rows);
}

export function segmentMemoriaContent(text: string): MemoriaSegment[] {
  const lines = text.split("\n");
  const segments: MemoriaSegment[] = [];
  let textBuffer: string[] = [];
  let tableBuffer: string[] = [];

  function flushText() {
    if (textBuffer.length === 0) return;
    const content = textBuffer.join("\n").trim();
    if (content) segments.push({ type: "text", content });
    textBuffer = [];
  }

  function flushTable() {
    if (tableBuffer.length === 0) return;
    const rows = parseTableLines(tableBuffer);
    if (rows.length > 0) segments.push({ type: "table", rows });
    tableBuffer = [];
  }

  for (const line of lines) {
    if (isTableLine(line)) {
      flushText();
      // Dos tablas contiguas (sin texto): una nueva cabecera anual tras filas de
      // datos inicia una tabla independiente en vez de fusionarlas.
      const cells = parseTableRow(line);
      if (
        tableBuffer.length > 0 &&
        isAnnualHeaderRow(cells) &&
        tableBuffer.some((l) => !isAnnualHeaderRow(parseTableRow(l)))
      ) {
        flushTable();
      }
      tableBuffer.push(line);
    } else {
      flushTable();
      textBuffer.push(line);
    }
  }

  flushText();
  flushTable();
  return segments;
}
