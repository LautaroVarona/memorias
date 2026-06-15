import * as XLSX from "xlsx";
import type { BalanceNormalizado, CuentaNormalizada, LibroCierre, Partida } from "@/types/domain";
import { esCuentaValida, normalizarCuenta } from "@/lib/normalizers/cuentas";
import { logger } from "@/lib/logger";
import { esLibroCierre, parseLibroCierre } from "./cierre-despacho";
import { detectWorkbook, getSheetRows, readLibroCierreWorkbook, readWorkbook, type SheetDetection } from "./detector";
import { sheetsToLoad } from "./sheet-config";

const log = logger.child({ module: "excel-parser" });

function parseNumber(val: unknown): number {
  if (typeof val === "number") return val;
  if (val === null || val === undefined || val === "") return 0;
  const str = String(val)
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[€$]/g, "");
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function extractCuenta(val: unknown): string | null {
  const str = String(val ?? "").trim().replace(/\s/g, "");
  if (esCuentaValida(str)) return str;
  const match = str.match(/(\d{4,6})/);
  return match ? match[1] : null;
}

function parseRows(
  rows: unknown[][],
  detection: SheetDetection
): CuentaNormalizada[] {
  const cuentas: CuentaNormalizada[] = [];
  const { columns, headerRow } = detection;

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row) continue;

    const cuentaRaw = row[columns.cuenta];
    const cuenta = extractCuenta(cuentaRaw);
    if (!cuenta) continue;

    const descripcion = String(row[columns.descripcion] ?? "");
    const debe = parseNumber(row[columns.debe]);
    const haber = parseNumber(row[columns.haber]);
    const saldo = columns.saldo >= 0 ? parseNumber(row[columns.saldo]) : debe - haber;
    const nivelCol = columns.nivel !== null ? parseNumber(row[columns.nivel]) : undefined;

    const normalizada = normalizarCuenta(cuenta, descripcion, debe, haber, saldo, r + 1, detection.hoja);
    if (nivelCol && nivelCol > 0) normalizada.nivel = nivelCol;

    cuentas.push(normalizada);
  }

  return cuentas;
}

function buildPartidas(cuentas: CuentaNormalizada[], grupo: "activo" | "pasivo" | "patrimonio"): Partida[] {
  return cuentas
    .filter((c) => c.grupoPGC === grupo)
    .map((c) => ({
      cuenta: c.cuenta,
      descripcion: c.descripcion,
      importe: Math.abs(c.saldo),
      nivel: c.nivel,
      fila: c.fila,
      hoja: c.hoja,
    }));
}

function buildBalance(cuentas: CuentaNormalizada[], detection: SheetDetection, archivo: string): BalanceNormalizado {
  const activoPartidas = buildPartidas(cuentas, "activo");
  const pasivoPartidas = buildPartidas(cuentas, "pasivo");
  const pnPartidas = buildPartidas(cuentas, "patrimonio");

  const activoTotal = activoPartidas.reduce((s, p) => s + p.importe, 0);
  const pasivoTotal = pasivoPartidas.reduce((s, p) => s + p.importe, 0);
  const pnTotal = pnPartidas.reduce((s, p) => s + p.importe, 0);
  const resultado = cuentas.find((c) => c.cuenta.startsWith("129"))?.saldo ?? 0;

  return {
    activo: { total: activoTotal, partidas: activoPartidas },
    pasivo: { total: pasivoTotal, partidas: pasivoPartidas },
    patrimonioNeto: { total: pnTotal, partidas: pnPartidas },
    resultado,
    cuentas,
    metadata: {
      archivo,
      hoja: detection.hoja,
      filasProcesadas: cuentas.length,
      formatoDetectado: detection.formatoDetectado,
    },
  };
}

export interface ExcelParseResult {
  balance?: BalanceNormalizado;
  balanceAnterior?: BalanceNormalizado;
  sumasSaldos?: CuentaNormalizada[];
  libroCierre?: LibroCierre;
  detections: SheetDetection[];
}

export function parseExcel(buffer: Buffer, fileName: string): ExcelParseResult {
  const fileLog = log.child({ fileName });
  const index = XLSX.read(buffer, { type: "buffer", bookSheets: true });
  const allSheets = index.SheetNames;

  fileLog.debug("workbook indexado", { sheets: allSheets, sheetCount: allSheets.length });

  // Libro de cierre del despacho: solo hojas permitidas
  if (esLibroCierre(index)) {
    const toLoad = sheetsToLoad(allSheets);
    const ignored = allSheets.filter((s) => !toLoad.includes(s));
    fileLog.info("detectado libro de cierre .xlsm", {
      sheetsLoaded: toLoad,
      sheetsIgnored: ignored,
    });

    const workbook = readLibroCierreWorkbook(buffer);
    const result = parseLibroCierre(workbook, fileName);

    fileLog.info("libro de cierre parseado", {
      cliente: result.libro.cliente,
      ejercicio: result.libro.ejercicio,
      cuentaCount: result.balance?.cuentas?.length ?? 0,
      hojasMinisterio: result.libro.hojasMinisterio?.length ?? 0,
    });

    return {
      balance: result.balance,
      balanceAnterior: result.balanceAnterior,
      sumasSaldos: result.libro.sumasSaldos,
      libroCierre: result.libro,
      detections: [],
    };
  }

  const workbook = readWorkbook(buffer);
  const detections = detectWorkbook(buffer, fileName);

  fileLog.info("excel genérico: hojas con datos detectados", {
    detections: detections.map((d) => ({ hoja: d.hoja, tipo: d.tipo, formato: d.formatoDetectado })),
    hojasSinDatos: allSheets.filter((s) => !detections.some((d) => d.hoja === s)),
  });

  let balance: BalanceNormalizado | undefined;
  let sumasSaldos: CuentaNormalizada[] | undefined;

  for (const detection of detections) {
    const rows = getSheetRows(workbook, detection.hoja);
    const cuentas = parseRows(rows, detection);

    if (detection.tipo === "balance" || (!balance && detection.tipo === "desconocido")) {
      balance = buildBalance(cuentas, detection, fileName);
    }
    if (detection.tipo === "sumas_saldos" || (!sumasSaldos && cuentas.length > 0)) {
      sumasSaldos = cuentas;
    }
  }

  if (!balance && sumasSaldos) {
    fileLog.warn("sin hoja balance explícita; se construye balance desde sumas y saldos", {
      cuentaCount: sumasSaldos.length,
    });
    const fakeDetection: SheetDetection = detections[0] || {
      hoja: workbook.SheetNames[0],
      tipo: "balance",
      headerRow: 0,
      columns: { cuenta: 0, descripcion: 1, debe: 2, haber: 3, saldo: 4, nivel: null },
      formatoDetectado: "generico",
    };
    balance = buildBalance(sumasSaldos, fakeDetection, fileName);
  }

  if (!balance && !sumasSaldos) {
    fileLog.warn("ninguna hoja con cuentas detectada", { sheets: allSheets });
  }

  return { balance, sumasSaldos, detections };
}

export function classifyExcelFile(
  buffer: Buffer,
  fileName: string
): "excel_balance" | "excel_sumas" | "excel_cierre" {
  const index = XLSX.read(buffer, { type: "buffer", bookSheets: true });
  if (esLibroCierre(index)) return "excel_cierre";
  const detections = detectWorkbook(buffer, fileName);
  const hasBalance = detections.some((d) => d.tipo === "balance");
  const hasSumas = detections.some((d) => d.tipo === "sumas_saldos");
  if (hasBalance) return "excel_balance";
  if (hasSumas) return "excel_sumas";
  return "excel_balance";
}
