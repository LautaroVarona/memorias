export type MemoriaSegment =
  | { type: "text"; content: string }
  | { type: "table"; rows: string[][] };

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  return trimmed.split("|").filter((c) => c.trim().length > 0).length >= 2;
}

function parseTableRow(line: string): string[] {
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

function rowHasNumericValues(cells: string[]): boolean {
  return cells.some(cellLooksNumeric);
}

function filterEmptyDataRows(rows: string[][]): string[][] {
  if (rows.length === 0) return rows;
  const [header, ...body] = rows;
  const filteredBody = body.filter(rowHasNumericValues);
  if (filteredBody.length === 0) {
    return rowHasNumericValues(header) ? [header] : [];
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
