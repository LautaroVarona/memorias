import * as XLSX from "xlsx";
import type {
  BalanceNormalizado,
  CuentaNormalizada,
  EpigrafeComparativo,
  HojaMinisterio,
  LibroCierre,
} from "@/types/domain";
import { normalizarCuenta } from "@/lib/normalizers/cuentas";
import {
  ALIASES_BALANCE,
  ALIASES_PG,
  isHojaMinisterioAux,
  resolveContabilidadSheet,
  resolveSheet,
} from "./sheet-config";

/**
 * Parser del libro de cierre .xlsm del despacho.
 * Solo lee las hojas ministeriales definidas en sheet-config; el resto se ignora.
 */

export function esLibroCierre(workbook: XLSX.WorkBook): boolean {
  const names = workbook.SheetNames;
  return !!(resolveContabilidadSheet(names) && resolveSheet(names, ...ALIASES_BALANCE));
}

function getRows(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
  const name = workbook.SheetNames.find(
    (n) => n.trim().toLowerCase() === sheetName.trim().toLowerCase()
  );
  if (!name || !workbook.Sheets[name]) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  }) as unknown[][];
}

function asNumber(val: unknown): number | null {
  if (typeof val === "number" && isFinite(val)) return val;
  if (typeof val === "string") {
    const n = parseFloat(val.replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? null : n;
  }
  return null;
}

function asText(val: unknown): string {
  return val === null || val === undefined ? "" : String(val).trim();
}

/** Convierte un serial de fecha Excel (1900 epoch) a fecha */
export function serialToDate(serial: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
}

function cellToYear(val: unknown): number | undefined {
  if (val instanceof Date) return val.getFullYear();
  const n = asNumber(val);
  if (n === null || n < 20000 || n > 80000) return undefined;
  return serialToDate(n).getUTCFullYear();
}

function cellToFecha(val: unknown): string | undefined {
  let d: Date | undefined;
  let utc = false;
  if (val instanceof Date) {
    d = val;
  } else {
    const n = asNumber(val);
    if (n !== null && n >= 20000 && n <= 80000) {
      d = serialToDate(n);
      utc = true;
    }
  }
  if (!d) return undefined;
  const dia = utc ? d.getUTCDate() : d.getDate();
  const mes = (utc ? d.getUTCMonth() : d.getMonth()) + 1;
  const anio = utc ? d.getUTCFullYear() : d.getFullYear();
  return `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${anio}`;
}

// ── Sys4_digital (contabilidad) ─────────────────────────────────────────────

function parseContabilidad(
  rows: unknown[][],
  hojaLabel: string
): { detalle: CuentaNormalizada[]; cuentas4: CuentaNormalizada[] } {
  const detalle: CuentaNormalizada[] = [];

  let headerRow = -1;
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r] ?? [];
    const texts = row.map(asText).map((t) => t.toLowerCase());
    if (texts.includes("cuenta") && texts.includes("debe") && texts.includes("haber")) {
      headerRow = r;
      break;
    }
  }
  if (headerRow === -1) return { detalle: [], cuentas4: [] };

  const header = (rows[headerRow] ?? []).map(asText).map((t) => t.toLowerCase());
  const colCuenta = header.indexOf("cuenta");
  const colTitulo = header.findIndex((t) => t === "título" || t === "titulo");
  const colDebe = header.indexOf("debe");
  const colHaber = header.indexOf("haber");

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const cuentaRaw = asText(row[colCuenta]);
    if (!/^\d{3,10}$/.test(cuentaRaw)) continue;
    const debe = asNumber(row[colDebe]) ?? 0;
    const haber = asNumber(row[colHaber]) ?? 0;
    if (debe === 0 && haber === 0) continue;
    detalle.push(
      normalizarCuenta(
        cuentaRaw,
        asText(row[colTitulo >= 0 ? colTitulo : colCuenta + 1]),
        debe,
        haber,
        debe - haber,
        r + 1,
        hojaLabel
      )
    );
  }

  const agregado = new Map<string, { descripcion: string; debe: number; haber: number; fila: number }>();
  for (const c of detalle) {
    const clave = c.cuenta.substring(0, 4);
    const existente = agregado.get(clave);
    if (existente) {
      existente.debe += c.debe;
      existente.haber += c.haber;
    } else {
      agregado.set(clave, { descripcion: c.descripcion, debe: c.debe, haber: c.haber, fila: c.fila ?? 0 });
    }
  }

  const cuentas4 = [...agregado.entries()].map(([cuenta, v]) =>
    normalizarCuenta(cuenta, v.descripcion, v.debe, v.haber, v.debe - v.haber, v.fila, hojaLabel)
  );

  return { detalle, cuentas4 };
}

// ── balance / pg (comparativos) ─────────────────────────────────────────────

interface LayoutComparativo {
  colEtiqueta: number;
  colActual: number;
  colAnterior: number;
  filaInicio: number;
  ejercicioActual?: number;
  ejercicioAnterior?: number;
  fechaCierre?: string;
}

function detectarLayout(rows: unknown[][], colEtiqueta: number): LayoutComparativo | null {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const row = rows[r] ?? [];
    const fechas: number[] = [];
    for (let c = colEtiqueta + 1; c < colEtiqueta + 10; c++) {
      if (cellToYear(row[c]) !== undefined) fechas.push(c);
    }
    if (fechas.length >= 2) {
      return {
        colEtiqueta,
        colActual: fechas[0],
        colAnterior: fechas[1],
        filaInicio: r + 1,
        ejercicioActual: cellToYear(row[fechas[0]]),
        ejercicioAnterior: cellToYear(row[fechas[1]]),
        fechaCierre: cellToFecha(row[fechas[0]]),
      };
    }
  }
  return null;
}

function extraerEpigrafes(rows: unknown[][], layout: LayoutComparativo, hoja: string): EpigrafeComparativo[] {
  const epigrafes: EpigrafeComparativo[] = [];
  for (let r = layout.filaInicio; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const etiqueta = asText(row[layout.colEtiqueta]);
    if (!etiqueta || /^\d+$/.test(etiqueta)) continue;
    const actual = asNumber(row[layout.colActual]);
    const anterior = asNumber(row[layout.colAnterior]);
    if (actual === null && anterior === null) continue;
    epigrafes.push({
      etiqueta,
      actual: actual ?? 0,
      anterior: anterior ?? 0,
      hoja,
      fila: r + 1,
    });
  }
  return epigrafes;
}

function parseHojaMinisterio(rows: unknown[][], nombre: string): HojaMinisterio {
  const layouts = [0, 1, 2, 3].map((col) => detectarLayout(rows, col)).filter(Boolean) as LayoutComparativo[];
  const epigrafes = layouts.flatMap((layout) => extraerEpigrafes(rows, layout, nombre));
  return { nombre, filas: rows.length, epigrafes };
}

// ── Ensamblado ──────────────────────────────────────────────────────────────

export interface LibroCierreParseResult {
  libro: LibroCierre;
  balance: BalanceNormalizado;
  balanceAnterior?: BalanceNormalizado;
}

function buscarEpigrafe(epigrafes: EpigrafeComparativo[], patron: RegExp): EpigrafeComparativo | undefined {
  return epigrafes.find((e) => patron.test(e.etiqueta));
}

function buildBalanceDesdeCierre(
  libro: LibroCierre,
  cuentas: CuentaNormalizada[],
  archivo: string,
  usarAnterior: boolean,
  hojaBalance: string
): BalanceNormalizado {
  const col = (e: EpigrafeComparativo | undefined) => (e ? (usarAnterior ? e.anterior : e.actual) : 0);

  const totalActivo =
    col(buscarEpigrafe(libro.balanceEpigrafes, /^TOTAL ACTIVO$/i)) ||
    col(buscarEpigrafe(libro.balanceEpigrafes, /^ACTIVO$/i));
  const totalPN = col(buscarEpigrafe(libro.balanceEpigrafes, /^A\.?\)? ?PATRIMONIO NETO/i));
  const totalPasivo = totalActivo - totalPN;
  const resultado = col(buscarEpigrafe(libro.balanceEpigrafes, /Resultado del ejercicio/i));

  const partidas = (grupo: CuentaNormalizada["grupoPGC"]) =>
    cuentas
      .filter((c) => c.grupoPGC === grupo)
      .map((c) => ({
        cuenta: c.cuenta,
        descripcion: c.descripcion,
        importe: Math.abs(c.saldo),
        nivel: c.nivel,
        fila: c.fila,
        hoja: c.hoja,
      }));

  return {
    activo: { total: totalActivo, partidas: partidas("activo") },
    pasivo: { total: totalPasivo, partidas: partidas("pasivo") },
    patrimonioNeto: { total: totalPN, partidas: partidas("patrimonio") },
    resultado,
    cuentas,
    metadata: {
      archivo,
      hoja: hojaBalance,
      filasProcesadas: cuentas.length,
      formatoDetectado: "libro_cierre_despacho",
    },
  };
}

export function parseLibroCierre(workbook: XLSX.WorkBook, archivo: string): LibroCierreParseResult {
  const sheetNames = workbook.SheetNames;

  const contabilidadSheet = resolveContabilidadSheet(sheetNames);
  const balanceSheet = resolveSheet(sheetNames, ...ALIASES_BALANCE);
  const pgSheet = resolveSheet(sheetNames, ...ALIASES_PG);

  if (!contabilidadSheet || !balanceSheet) {
    throw new Error(
      "El libro de cierre debe incluir hoja de contabilidad (SYS_4_3_Digitos, SYS_cliente o Sys4_digital) y balance."
    );
  }

  const { detalle, cuentas4 } = parseContabilidad(getRows(workbook, contabilidadSheet), contabilidadSheet);

  const balRows = getRows(workbook, balanceSheet);
  const pgRows = pgSheet ? getRows(workbook, pgSheet) : [];

  const layoutActivo = detectarLayout(balRows, 2);
  const layoutPasivo = detectarLayout(balRows, 10);
  const layoutPg = pgRows.length > 0 ? detectarLayout(pgRows, 2) : null;

  const balanceEpigrafes = [
    ...(layoutActivo ? extraerEpigrafes(balRows, layoutActivo, balanceSheet) : []),
    ...(layoutPasivo ? extraerEpigrafes(balRows, layoutPasivo, balanceSheet) : []),
  ];
  const pygEpigrafes = layoutPg && pgSheet ? extraerEpigrafes(pgRows, layoutPg, pgSheet) : [];

  let cliente: string | undefined;
  for (let r = 0; r < Math.min(balRows.length, 12); r++) {
    const row = balRows[r] ?? [];
    const idx = row.findIndex((c) => /^sociedad:?$/i.test(asText(c)));
    if (idx >= 0) {
      const valor = row.slice(idx + 1).map(asText).find(Boolean);
      if (valor) {
        cliente = valor;
        break;
      }
    }
  }

  const ejercicio = layoutActivo?.ejercicioActual ?? layoutPg?.ejercicioActual;
  const ejercicioAnterior = layoutActivo?.ejercicioAnterior ?? layoutPg?.ejercicioAnterior;
  const fechaCierre = layoutActivo?.fechaCierre ?? layoutPg?.fechaCierre;

  const coreSheets = new Set([contabilidadSheet, balanceSheet, ...(pgSheet ? [pgSheet] : [])]);
  const hojasMinisterio = sheetNames
    .filter((n) => !coreSheets.has(n) && isHojaMinisterioAux(n))
    .map((nombre) => parseHojaMinisterio(getRows(workbook, nombre), nombre));

  const libro: LibroCierre = {
    cliente,
    ejercicio,
    ejercicioAnterior,
    fechaCierre,
    sumasSaldos: detalle,
    cuentas4,
    a3soc: [],
    balanceEpigrafes,
    pygEpigrafes,
    notas: [],
    hojasMinisterio: hojasMinisterio.length > 0 ? hojasMinisterio : undefined,
    hojasDetectadas: sheetNames,
  };

  const balance = buildBalanceDesdeCierre(libro, cuentas4, archivo, false, balanceSheet);
  const balanceAnterior =
    ejercicioAnterior !== undefined
      ? buildBalanceDesdeCierre(libro, [], archivo, true, balanceSheet)
      : undefined;

  return { libro, balance, balanceAnterior };
}
