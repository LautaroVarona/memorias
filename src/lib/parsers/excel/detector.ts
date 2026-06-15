import * as XLSX from "xlsx";
import { sheetsToLoad } from "./sheet-config";

export interface ColumnMapping {
  cuenta: number;
  descripcion: number;
  debe: number;
  haber: number;
  saldo: number;
  nivel: number | null;
}

export interface SheetDetection {
  hoja: string;
  tipo: "balance" | "sumas_saldos" | "desconocido";
  headerRow: number;
  columns: ColumnMapping;
  formatoDetectado: string;
}

const HEADER_PATTERNS: Record<string, RegExp[]> = {
  cuenta: [/cuenta/i, /código/i, /codigo/i, /cta/i, /^nº$/i],
  descripcion: [/descrip/i, /denominación/i, /denominacion/i, /título/i, /titulo/i],
  debe: [/debe/i, /cargo/i, /deudor/i],
  haber: [/haber/i, /abono/i, /acreedor/i],
  saldo: [/saldo/i, /importe/i, /balance/i],
  nivel: [/nivel/i, /grado/i],
};

function findColumn(headers: string[], patterns: RegExp[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || "").trim();
    if (patterns.some((p) => p.test(h))) return i;
  }
  return -1;
}

function detectHeaderRow(rows: unknown[][]): { row: number; headers: string[] } | null {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const row = rows[r] as unknown[];
    if (!row) continue;
    const headers = row.map((c) => String(c ?? ""));
    const cuentaCol = findColumn(headers, HEADER_PATTERNS.cuenta);
    const descCol = findColumn(headers, HEADER_PATTERNS.descripcion);
    if (cuentaCol >= 0 && descCol >= 0) {
      return { row: r, headers };
    }
  }
  return null;
}

function buildMapping(headers: string[]): ColumnMapping | null {
  const cuenta = findColumn(headers, HEADER_PATTERNS.cuenta);
  const descripcion = findColumn(headers, HEADER_PATTERNS.descripcion);
  const debe = findColumn(headers, HEADER_PATTERNS.debe);
  const haber = findColumn(headers, HEADER_PATTERNS.haber);
  const saldo = findColumn(headers, HEADER_PATTERNS.saldo);
  const nivel = findColumn(headers, HEADER_PATTERNS.nivel);

  if (cuenta < 0 || descripcion < 0) return null;
  if (debe < 0 && haber < 0 && saldo < 0) return null;

  return {
    cuenta,
    descripcion,
    debe: debe >= 0 ? debe : saldo,
    haber: haber >= 0 ? haber : saldo,
    saldo: saldo >= 0 ? saldo : debe >= 0 ? debe : haber,
    nivel: nivel >= 0 ? nivel : null,
  };
}

function detectSheetType(sheetName: string, rows: unknown[][]): "balance" | "sumas_saldos" | "desconocido" {
  const nameLower = sheetName.toLowerCase();
  if (/balance|situaci[oó]n|activo|pasivo/i.test(nameLower)) return "balance";
  if (/sumas|saldos|mayor|diario/i.test(nameLower)) return "sumas_saldos";

  const text = rows
    .slice(0, 50)
    .flat()
    .map((c) => String(c ?? "").toLowerCase())
    .join(" ");

  if (/activo.*pasivo|patrimonio neto|total activo/i.test(text)) return "balance";
  if (/sumas y saldos|debe.*haber/i.test(text)) return "sumas_saldos";

  return "desconocido";
}

export function detectWorkbook(buffer: Buffer, fileName: string): SheetDetection[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const detections: SheetDetection[] = [];

  for (const hoja of workbook.SheetNames) {
    const sheet = workbook.Sheets[hoja];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];
    const header = detectHeaderRow(rows);
    if (!header) continue;

    const columns = buildMapping(header.headers);
    if (!columns) continue;

    const tipo = detectSheetType(hoja, rows);
    detections.push({
      hoja,
      tipo,
      headerRow: header.row,
      columns,
      formatoDetectado: fileName.toLowerCase().includes("a3soc")
        ? "A3SOC"
        : fileName.toLowerCase().includes("sys")
          ? "SYS_cliente"
          : "generico",
    });
  }

  return detections;
}

export function readWorkbook(buffer: Buffer): XLSX.WorkBook {
  return XLSX.read(buffer, { type: "buffer", cellDates: true });
}

/**
 * Lee solo las hojas relevantes del libro de cierre (.xlsm).
 * Evita cargar pestañas auxiliares que no intervienen en la revisión.
 */
export function readLibroCierreWorkbook(buffer: Buffer): XLSX.WorkBook {
  const index = XLSX.read(buffer, { type: "buffer", bookSheets: true });
  const toLoad = sheetsToLoad(index.SheetNames);
  if (toLoad.length === 0) {
    return XLSX.read(buffer, { type: "buffer", cellDates: true });
  }
  return XLSX.read(buffer, { type: "buffer", cellDates: true, sheets: toLoad });
}

export function getSheetRows(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];
}
