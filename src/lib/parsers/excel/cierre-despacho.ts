import * as XLSX from "xlsx";
import type {
  BalanceNormalizado,
  CalcisData,
  CuentaNormalizada,
  EpigrafeComparativo,
  HojaMinisterio,
  LibroCierre,
} from "@/types/domain";
import { trackingValue } from "@/types/tracking";
import type { TrackingValue } from "@/types/tracking";
import { logger } from "@/lib/logger";
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

// ── SYS_4_3_Digitos / contabilidad ───────────────────────────────────────────

interface ColumnasDebeHaber {
  colDebe: number;
  colHaber: number;
  seccion: string;
}

/** Localiza el par debe/haber del ejercicio en curso (saldos ajustados o balance final). */
function resolverColumnasDebeHaber(header: string[], labelRow: unknown[] | undefined): ColumnasDebeHaber {
  const debeCols = header
    .map((h, i) => ({ i, h: h.toLowerCase().trim() }))
    .filter(({ h }) => h === "debe")
    .map(({ i }) => i);

  if (debeCols.length <= 1) {
    const colDebe = debeCols[0] ?? header.findIndex((h) => h.toLowerCase().trim() === "debe");
    const colHaber =
      colDebe >= 0
        ? header.findIndex((h, idx) => idx > colDebe && h.toLowerCase().trim() === "haber")
        : header.findIndex((h) => h.toLowerCase().trim() === "haber");
    return { colDebe, colHaber, seccion: "simple" };
  }

  const labels = (labelRow ?? []).map((c) => asText(c).toLowerCase());
  const pairs = debeCols.map((colDebe) => {
    const colHaber = header.findIndex(
      (h, idx) => idx > colDebe && h.toLowerCase().trim() === "haber"
    );
    let seccion = "";
    for (let c = colDebe; c >= 0; c--) {
      const t = labels[c]?.trim();
      if (t && t.length > 2) {
        seccion = t;
        break;
      }
    }
    return { colDebe, colHaber, seccion };
  });

  const preferidos = [/saldos?\s*ajustados/i, /balance\s*final/i];
  for (const patron of preferidos) {
    const found = pairs.find((p) => patron.test(p.seccion));
    if (found && found.colHaber >= 0) {
      return { colDebe: found.colDebe, colHaber: found.colHaber, seccion: found.seccion };
    }
  }

  const last = pairs[pairs.length - 1];
  return {
    colDebe: last.colDebe,
    colHaber: last.colHaber >= 0 ? last.colHaber : last.colDebe + 1,
    seccion: last.seccion || "ultimo_bloque",
  };
}

function parseContabilidad(
  rows: unknown[][],
  hojaLabel: string
): { detalle: CuentaNormalizada[]; cuentas4: CuentaNormalizada[] } {
  const detalle: CuentaNormalizada[] = [];

  let headerRow = -1;
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const row = rows[r] ?? [];
    const texts = row.map(asText).map((t) => t.toLowerCase());
    if (texts.includes("cuenta") && texts.includes("debe") && texts.includes("haber")) {
      headerRow = r;
      break;
    }
  }
  if (headerRow === -1) return { detalle: [], cuentas4: [] };

  const header = (rows[headerRow] ?? []).map(asText).map((t) => t.toLowerCase());
  const labelRow = headerRow > 0 ? rows[headerRow - 1] : undefined;
  const { colDebe, colHaber } = resolverColumnasDebeHaber(header, labelRow);

  const colCuenta = header.indexOf("cuenta");
  const colTitulo = header.findIndex((t) => t === "título" || t === "titulo");
  const colCuenta4 = header.findIndex((t) => /cuenta\s*4\s*d[ií]gitos|^4\s*d[ií]gitos$/.test(t));
  const colSaldoCuenta = header.findIndex((t) => /^saldo\s+cuenta$|^saldo\s+final$/.test(t));

  if (colCuenta < 0 || colDebe < 0 || colHaber < 0) return { detalle: [], cuentas4: [] };

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const cuentaRaw = asText(row[colCuenta]);
    if (!/^\d{3,10}$/.test(cuentaRaw)) continue;

    const debe = asNumber(row[colDebe]) ?? 0;
    const haber = asNumber(row[colHaber]) ?? 0;
    const saldoExplicito =
      colSaldoCuenta >= 0 ? asNumber(row[colSaldoCuenta]) : null;
    const saldo =
      saldoExplicito !== null ? saldoExplicito : debe - haber;

    if (debe === 0 && haber === 0 && saldo === 0) continue;

    detalle.push(
      normalizarCuenta(
        cuentaRaw,
        asText(row[colTitulo >= 0 ? colTitulo : colCuenta + 1]),
        debe,
        haber,
        saldo,
        r + 1,
        hojaLabel,
        colHaber >= 0 ? colHaber : colDebe
      )
    );
  }

  const agregado = new Map<
    string,
    { descripcion: string; debe: number; haber: number; saldo: number; fila: number }
  >();

  if (colCuenta4 >= 0 && colSaldoCuenta >= 0) {
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const cuenta4Raw = asText(row[colCuenta4]);
      if (!/^\d{4}$/.test(cuenta4Raw)) continue;
      const saldo = asNumber(row[colSaldoCuenta]);
      if (saldo === null || saldo === 0) continue;
      const titulo = asText(row[colTitulo >= 0 ? colTitulo : colCuenta + 1]);
      const debe = asNumber(row[colDebe]) ?? 0;
      const haber = asNumber(row[colHaber]) ?? 0;
      const existente = agregado.get(cuenta4Raw);
      if (existente) {
        existente.debe += debe;
        existente.haber += haber;
        existente.saldo += saldo;
      } else {
        agregado.set(cuenta4Raw, { descripcion: titulo, debe, haber, saldo, fila: r + 1 });
      }
    }
  } else {
    for (const c of detalle) {
      const clave = c.cuenta.substring(0, 4);
      const existente = agregado.get(clave);
      if (existente) {
        existente.debe += c.debe;
        existente.haber += c.haber;
        existente.saldo += c.saldo;
      } else {
        agregado.set(clave, {
          descripcion: c.descripcion,
          debe: c.debe,
          haber: c.haber,
          saldo: c.saldo,
          fila: c.fila ?? 0,
        });
      }
    }
  }

  const cuentas4 = [...agregado.entries()].map(([cuenta, v]) =>
    normalizarCuenta(cuenta, v.descripcion, v.debe, v.haber, v.saldo, v.fila, hojaLabel)
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
    const columnasFecha: { col: number; anio: number }[] = [];
    for (let c = colEtiqueta + 1; c < colEtiqueta + 10; c++) {
      const anio = cellToYear(row[c]);
      if (anio !== undefined) columnasFecha.push({ col: c, anio });
    }
    if (columnasFecha.length >= 2) {
      columnasFecha.sort((a, b) => b.anio - a.anio);
      const colActual = columnasFecha[0].col;
      const colAnterior = columnasFecha[1].col;
      return {
        colEtiqueta,
        colActual,
        colAnterior,
        filaInicio: r + 1,
        ejercicioActual: columnasFecha[0].anio,
        ejercicioAnterior: columnasFecha[1].anio,
        fechaCierre: cellToFecha(row[colActual]),
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

// ── CALCIS (buscador semántico por etiquetas) ───────────────────────────────

const logCalcis = logger.child({ module: "cierre-despacho", hoja: "CALCIS" });

/** Columnas A y B: etiquetas */
const CALCIS_COLS_ETIQUETA = [0, 1];
/** Columnas C en adelante: importes (saltando vacíos por celdas combinadas) */
const CALCIS_COL_IMPORTE_MIN = 2;
const CALCIS_MAX_COLS_IMPORTE = 12;

interface CalcisCampoDef {
  campo: keyof Omit<CalcisData, "hoja" | "reservaCapitalizacion">;
  labels: string[];
  critico: boolean;
  /** Filtro extra sobre texto compactado de la fila (evita falsos positivos) */
  filtroFila?: (compacto: string) => boolean;
}

const CALCIS_CAMPOS: CalcisCampoDef[] = [
  { campo: "resultadoContable", labels: ["RESULTADO CONTABLE"], critico: true },
  { campo: "ajustes", labels: ["AJUSTES"], critico: true },
  { campo: "baseImponible", labels: ["BASE IMPONIBLE"], critico: true },
  { campo: "cuotaIntegra", labels: ["CUOTA ÍNTEGRA", "CUOTA INTEGRA"], critico: true },
  { campo: "retenciones", labels: ["RETENCIONES"], critico: true },
  {
    campo: "cuotaDiferencial",
    labels: ["CUOTA DIFERENCIAL", "A INGRESAR", "A INGRESAR O A DEVOLVER"],
    critico: true,
  },
  {
    campo: "tipoImpositivo",
    labels: ["TIPO"],
    critico: false,
    filtroFila: (c) =>
      c.includes("tipo") &&
      !c.includes("cuota") &&
      !c.includes("diferencial") &&
      !c.includes("integra") &&
      !c.includes("retencion"),
  },
];

const CALCIS_RESERVA_LABELS = ["RESERVA CAPITALIZACION", "CAPITALIZACION INDISPONIBLE", "1146"];

/** Compacta texto: minúsculas, sin acentos, sin espacios/tabs/saltos de línea */
function compactarTextoCalcis(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s/g, "");
}

function etiquetaLegibleCalcis(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function celdaVaciaCalcis(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === "string" && val.trim() === "") return true;
  return false;
}

function etiquetaContieneLabel(textoCelda: string, label: string): boolean {
  const celda = compactarTextoCalcis(textoCelda);
  const busqueda = compactarTextoCalcis(label);
  if (!celda || !busqueda) return false;
  return celda.includes(busqueda);
}

function textoEtiquetaFila(row: unknown[], colEtiqueta: number): string {
  return etiquetaLegibleCalcis(asText(row[colEtiqueta]));
}

function textoEtiquetaConcatenadaAB(row: unknown[]): string {
  const partes = [asText(row[0]), asText(row[1])].filter((t) => t.trim() !== "");
  return etiquetaLegibleCalcis(partes.join(" "));
}

function importeAdyacenteCalcis(
  row: unknown[],
  colEtiqueta: number
): { valor: number; raw?: string } {
  const inicio = Math.max(colEtiqueta + 1, CALCIS_COL_IMPORTE_MIN);
  const limite = Math.min(row.length, inicio + CALCIS_MAX_COLS_IMPORTE);
  for (let c = inicio; c < limite; c++) {
    const celda = row[c];
    if (celdaVaciaCalcis(celda)) continue;
    const n = asNumber(celda);
    if (n !== null) return { valor: n, raw: asText(celda) };
  }
  return { valor: 0 };
}

function trackingCalcis(
  hoja: string,
  etiquetaDetectada: string,
  importe: { valor: number; raw?: string }
): TrackingValue<number> {
  const ubicacion = `Hoja: ${hoja} / Etiqueta: ${etiquetaDetectada}`;
  return trackingValue(importe.valor, "excel", ubicacion, importe.raw);
}

/**
 * Escanea columnas A–B buscando una etiqueta semántica y devuelve el primer
 * importe numérico en C, D, E… (saltando celdas vacías por combinaciones).
 */
function extractFromCalcisByLabel(
  data: unknown[][],
  hoja: string,
  label: string,
  filtroFila?: (compacto: string) => boolean
): TrackingValue<number> | null {
  const labelCompact = compactarTextoCalcis(label);
  if (!labelCompact) return null;

  for (let r = 0; r < data.length; r++) {
    const row = data[r] ?? [];

    const candidatos: { col: number; display: string; compacto: string }[] = [];

    for (const col of CALCIS_COLS_ETIQUETA) {
      const texto = asText(row[col]);
      if (!texto || !etiquetaContieneLabel(texto, label)) continue;
      candidatos.push({
        col,
        display: textoEtiquetaFila(row, col),
        compacto: compactarTextoCalcis(texto),
      });
    }

    const concatAB = textoEtiquetaConcatenadaAB(row);
    if (concatAB && etiquetaContieneLabel(concatAB, label)) {
      candidatos.push({
        col: 1,
        display: concatAB,
        compacto: compactarTextoCalcis(concatAB),
      });
    }

    for (const { col, display, compacto } of candidatos) {
      if (filtroFila && !filtroFila(compacto)) continue;
      const importe = importeAdyacenteCalcis(row, col);
      return trackingCalcis(hoja, display, importe);
    }
  }

  return null;
}

function extraerCampoCalcis(
  data: unknown[][],
  hoja: string,
  def: CalcisCampoDef
): TrackingValue<number> | null {
  for (const label of def.labels) {
    const valor = extractFromCalcisByLabel(data, hoja, label, def.filtroFila);
    if (valor) return valor;
  }
  return null;
}

function advertirEtiquetasCalcisFaltantes(hoja: string, faltantes: string[]): void {
  if (faltantes.length === 0) return;
  logCalcis.warn(
    `Hoja ${hoja}: no se localizaron etiquetas críticas de CALCIS — ${faltantes.join(", ")}`
  );
}

/** Extrae la estructura fiscal completa de CALCIS por búsqueda semántica */
export function parseCalcisHoja(rows: unknown[][], hoja: string): CalcisData {
  const datos: CalcisData = {
    hoja,
    resultadoContable: null,
    ajustes: null,
    baseImponible: null,
    cuotaIntegra: null,
    retenciones: null,
    cuotaDiferencial: null,
    tipoImpositivo: null,
    reservaCapitalizacion: null,
  };

  const faltantesCriticos: string[] = [];

  for (const def of CALCIS_CAMPOS) {
    const valor = extraerCampoCalcis(rows, hoja, def);
    datos[def.campo] = valor;
    if (def.critico && !valor) {
      faltantesCriticos.push(`${def.campo} (${def.labels[0]})`);
    }
  }

  for (const label of CALCIS_RESERVA_LABELS) {
    const reserva = extractFromCalcisByLabel(rows, hoja, label);
    if (reserva) {
      datos.reservaCapitalizacion = reserva;
      break;
    }
  }

  advertirEtiquetasCalcisFaltantes(hoja, faltantesCriticos);

  return datos;
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
      "El libro de cierre debe incluir hoja de contabilidad (SYS_4_3_Digitos) y balance."
    );
  }

  const { detalle, cuentas4 } = parseContabilidad(getRows(workbook, contabilidadSheet), contabilidadSheet);

  const balRows = getRows(workbook, balanceSheet);
  const pgRows = pgSheet ? getRows(workbook, pgSheet) : [];
  const calcisSheet = resolveSheet(sheetNames, "calcis");
  const calcisRows = calcisSheet ? getRows(workbook, calcisSheet) : [];
  const calcisParsed =
    calcisSheet && calcisRows.length > 0 ? parseCalcisHoja(calcisRows, calcisSheet) : undefined;
  const calcis = calcisParsed;

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
    calcis,
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
