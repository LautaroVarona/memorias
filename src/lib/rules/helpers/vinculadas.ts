import { parseImporte } from "@/lib/parsers/memoria/extractors";
import type { CaseData, Evidence } from "@/types/case-data";
import type { ImporteVinculadasFila, VinculadasCategoria, VinculadasMemoria } from "@/types/case-data";
import type { CuentaNormalizada } from "@/types/domain";
import { trackingValue } from "@/types/tracking";
import { fromTrackingValue } from "./evidence";
import { classifyGroupAccount, breakdownGroupAccounts } from "./group-accounts";
import { GROUP_CATEGORY_LABELS, type GroupAccountCategory } from "./group-accounts";
import { formatEuro } from "./accounts";

export interface VinculadasTotals {
  excel: {
    total: number;
    clientesGrupo: number;
    proveedoresGrupo: number;
    prestamos: number;
    participaciones: number;
  };
  memoria: {
    total: number;
    clientesGrupo: number;
    proveedoresGrupo: number;
    prestamos: number;
  };
  diferencia: number;
}

const CLIENTES_PREFIXES = ["433", "434", "43"];
const PROVEEDORES_PREFIXES = ["403", "404", "40"];

/** Filas de saldo de balance en tablas del apartado 09 (excluye naturaleza de operaciones). */
const PATRON_BALANCE_CLIENTES = /clientes?\s+por\s+ventas/i;
const PATRON_BALANCE_PROVEEDORES = /proveedores?\s+(a\s+)?(corto|largo)|^proveedores?$/i;
const PATRON_BALANCE_PRESTAMOS = /inversiones?\s+financieras?\s+a\s+(largo|corto)\s+plazo/i;

export type VinculadasMemoriaGrupo = "clientes" | "proveedores" | "prestamos" | "participaciones";

const GRUPO_BALANCE_PATTERNS: Record<VinculadasMemoriaGrupo, RegExp | null> = {
  clientes: PATRON_BALANCE_CLIENTES,
  proveedores: PATRON_BALANCE_PROVEEDORES,
  prestamos: PATRON_BALANCE_PRESTAMOS,
  participaciones: null,
};

function sumFilasBalancePorPatron(
  filas: ImporteVinculadasFila[],
  patron: RegExp
): number {
  return filas
    .filter((f) => patron.test(f.descripcion))
    .reduce((s, f) => s + Math.abs(f.ejercicioActual?.valor ?? 0), 0);
}

function filasBalancePorPatron(
  filas: ImporteVinculadasFila[],
  patron: RegExp
): ImporteVinculadasFila[] {
  return filas.filter(
    (f) => patron.test(f.descripcion) && f.ejercicioActual && Math.abs(f.ejercicioActual.valor) > 0
  );
}

/** Suma importes de balance del apartado 09 recorriendo el índice de filas trazadas. */
export function computeMemoriaBalanceTotals(
  vinculadas: VinculadasMemoria | undefined
): VinculadasTotals["memoria"] {
  const filas = vinculadas?.filas ?? [];
  const clientesGrupo = sumFilasBalancePorPatron(filas, PATRON_BALANCE_CLIENTES);
  const proveedoresGrupo = sumFilasBalancePorPatron(filas, PATRON_BALANCE_PROVEEDORES);
  const prestamos = sumFilasBalancePorPatron(filas, PATRON_BALANCE_PRESTAMOS);
  return {
    clientesGrupo,
    proveedoresGrupo,
    prestamos,
    total: clientesGrupo + proveedoresGrupo + prestamos,
  };
}

/** Filas de balance con importe en ejercicio actual, ordenadas por magnitud. */
export function filasVinculadasBalance(
  vinculadas: VinculadasMemoria | undefined
): ImporteVinculadasFila[] {
  const filas = vinculadas?.filas ?? [];
  const balance = [
    ...filasBalancePorPatron(filas, PATRON_BALANCE_CLIENTES),
    ...filasBalancePorPatron(filas, PATRON_BALANCE_PROVEEDORES),
    ...filasBalancePorPatron(filas, PATRON_BALANCE_PRESTAMOS),
  ];
  const seen = new Set<string>();
  return balance
    .filter((f) => {
      if (seen.has(f.clave)) return false;
      seen.add(f.clave);
      return true;
    })
    .sort((a, b) => Math.abs(b.ejercicioActual!.valor) - Math.abs(a.ejercicioActual!.valor));
}

function mapDescripcionAGrupoMemoria(descripcion: string): VinculadasMemoriaGrupo | undefined {
  if (PATRON_BALANCE_CLIENTES.test(descripcion)) return "clientes";
  if (PATRON_BALANCE_PROVEEDORES.test(descripcion)) return "proveedores";
  if (PATRON_BALANCE_PRESTAMOS.test(descripcion)) return "prestamos";
  return undefined;
}

export interface BuildVinculadasMemoriaEvidenceInput {
  vinculadas: VinculadasMemoria | undefined;
  totals: VinculadasTotals["memoria"];
  section: string;
  memoryContext: VinculadasMemoryContext;
}

/** Evidencias de memoria para CROSS_001: total agregado + desglose por grupo + filas de balance. */
export function buildVinculadasMemoriaEvidence(
  input: BuildVinculadasMemoriaEvidenceInput
): Evidence[] {
  const { vinculadas, totals, section, memoryContext } = input;
  const ev: Evidence[] = [];
  const filas = vinculadas?.filas ?? [];

  const totalTracked = trackingValue(
    totals.total,
    "memoria_actual",
    `Apartado ${section.padStart(2, "0")} / Total saldos vinculadas (balance)`
  );
  ev.push(
    fromTrackingValue(totalTracked, "high", undefined, "Total vinculadas memoria", {
      section: memoryContext.section,
      sectionTitle: memoryContext.sectionTitle,
    })
  );

  const grupos: Array<{ key: VinculadasMemoriaGrupo; total: number; label: string }> = [
    { key: "clientes", total: totals.clientesGrupo, label: "Clientes grupo" },
    { key: "proveedores", total: totals.proveedoresGrupo, label: "Proveedores grupo" },
    { key: "prestamos", total: totals.prestamos, label: "Préstamos intragrupo" },
  ];

  for (const grupo of grupos) {
    if (grupo.total <= 0) continue;
    const patron = GRUPO_BALANCE_PATTERNS[grupo.key];
    if (!patron) continue;

    const filasGrupo = filasBalancePorPatron(filas, patron);
    const filaRef = filasGrupo.sort(
      (a, b) => Math.abs(b.ejercicioActual!.valor) - Math.abs(a.ejercicioActual!.valor)
    )[0];

    if (filaRef?.ejercicioActual) {
      const valorGrupo =
        filasGrupo.length > 1
          ? trackingValue(
              grupo.total,
              filaRef.ejercicioActual.origen.documento,
              `Apartado ${section.padStart(2, "0")} / Total saldos vinculadas (${grupo.label})`,
              filaRef.ejercicioActual.origen.detalleRaw
            )
          : filaRef.ejercicioActual;

      ev.push(
        fromTrackingValue(valorGrupo, "medium", undefined, `Memoria — ${grupo.label}`, {
          group: grupo.key,
          section: memoryContext.section,
          sectionTitle: memoryContext.sectionTitle,
        })
      );
    } else {
      ev.push({
        type: "memory",
        reference: `Memoria — ${grupo.label}`,
        value: grupo.total,
        formattedValue: formatEuro(grupo.total),
        importance: "medium",
        group: grupo.key,
        section: memoryContext.section,
        sectionTitle: memoryContext.sectionTitle,
      });
    }
  }

  for (const fila of filasVinculadasBalance(vinculadas)) {
    if (!fila.ejercicioActual) continue;
    const grupo = mapDescripcionAGrupoMemoria(fila.descripcion);
    ev.push(
      fromTrackingValue(
        fila.ejercicioActual,
        "medium",
        undefined,
        `Memoria — ${fila.descripcion}`,
        grupo
          ? {
              group: grupo,
              section: memoryContext.section,
              sectionTitle: memoryContext.sectionTitle,
            }
          : {
              section: memoryContext.section,
              sectionTitle: memoryContext.sectionTitle,
            }
      )
    );
  }

  return ev;
}

function sumByPrefixes(accounts: CuentaNormalizada[], prefixes: string[]): number {
  return accounts
    .filter((c) => prefixes.some((p) => c.cuenta.startsWith(p)))
    .reduce((s, c) => s + Math.abs(c.saldo), 0);
}

function sumTableByPattern(
  data: CaseData,
  rowPattern: RegExp
): number {
  const vinculadas = data.memory?.vinculadas;
  if (vinculadas && vinculadas.filas.length > 0) {
    return vinculadas.filas
      .filter((f) => rowPattern.test(f.descripcion))
      .reduce((s, f) => s + Math.abs(f.ejercicioActual?.valor ?? 0), 0);
  }

  const tablas =
    data.memory?.tables.filter(
      (t) => t.apartado === "09" || /vinculad|dependiente|dominante/i.test(t.titulo ?? "")
    ) ?? [];

  let total = 0;
  for (const tabla of tablas) {
    for (const fila of tabla.filas) {
      if (fila.length < 2) continue;
      const etiqueta = fila[0].replace(/^\d+\.\s*/, "");
      if (!rowPattern.test(etiqueta)) continue;
      for (const celda of fila.slice(1)) {
        const n = parseImporte(celda);
        if (n !== null && Math.abs(n) > 0) total += Math.abs(n);
      }
    }
  }
  return total;
}

export function computeVinculadasTotals(data: CaseData, groupAccounts: CuentaNormalizada[]): VinculadasTotals {
  const breakdown = breakdownGroupAccounts(groupAccounts);

  const excel = {
    total: groupAccounts.reduce((s, c) => s + Math.abs(c.saldo), 0),
    clientesGrupo: sumByPrefixes(groupAccounts, CLIENTES_PREFIXES),
    proveedoresGrupo: sumByPrefixes(groupAccounts, PROVEEDORES_PREFIXES),
    prestamos: breakdown.prestamos.total,
    participaciones: breakdown.participaciones.total,
  };

  const vinculadas = data.memory?.vinculadas;
  const memoria =
    vinculadas && vinculadas.filas.length > 0
      ? computeMemoriaBalanceTotals(vinculadas)
      : {
          clientesGrupo: sumTableByPattern(data, /clientes?.*(grupo|vinculad|dependiente)/i),
          proveedoresGrupo: sumTableByPattern(data, /proveedores?.*(grupo|vinculad|dependiente)/i),
          prestamos: sumTableByPattern(
            data,
            /inversiones?\s+financieras?\s+a\s+(largo|corto)\s+plazo/i
          ),
          total: 0,
        };

  if (!vinculadas || vinculadas.filas.length === 0) {
    memoria.total = memoria.clientesGrupo + memoria.proveedoresGrupo + memoria.prestamos;
  }

  return {
    excel,
    memoria,
    diferencia: Math.abs(excel.total - memoria.total),
  };
}

export type VinculadasDiagnosis =
  | "memoria_desactualizada"
  | "reclasificacion_no_trasladada"
  | "afirmacion_incorrecta"
  | "descuadre_parcial";

export function diagnoseVinculadasMismatch(
  totals: VinculadasTotals,
  memorySaysNo: boolean
): VinculadasDiagnosis {
  if (memorySaysNo && totals.excel.total > 10_000) return "afirmacion_incorrecta";
  if (totals.memoria.total < totals.excel.total * 0.9) return "memoria_desactualizada";
  if (totals.memoria.total > totals.excel.total * 1.1) return "reclasificacion_no_trasladada";
  return "descuadre_parcial";
}

export const DIAGNOSIS_LABELS: Record<VinculadasDiagnosis, string> = {
  memoria_desactualizada: "Posible memoria desactualizada respecto al cierre definitivo",
  reclasificacion_no_trasladada: "Posible reclasificación contable no trasladada a la memoria",
  afirmacion_incorrecta: "La memoria niega vinculadas pero la contabilidad muestra saldos relevantes",
  descuadre_parcial: "Descuadre parcial entre totales de vinculadas en memoria y Excel",
};

export interface VinculadasBreakdownLine {
  cuenta: string;
  descripcion: string;
  saldo: number;
  categoria: GroupAccountCategory;
  hoja?: string;
  fila?: number;
  columna?: number;
}

/** Líneas de desglose Excel listas para generar evidencias de CROSS_001. */
export function buildVinculadasExcelBreakdown(accounts: CuentaNormalizada[]): VinculadasBreakdownLine[] {
  return accounts
    .filter((c) => Math.abs(c.saldo) > 0)
    .map((c) => ({
      cuenta: c.cuenta,
      descripcion: c.descripcion,
      saldo: Math.abs(c.saldo),
      categoria: classifyGroupAccount(c.cuenta),
      hoja: c.hoja,
      fila: c.fila,
      columna: c.columna,
    }))
    .sort((a, b) => b.saldo - a.saldo);
}

export function categoryLabel(cat: GroupAccountCategory): string {
  return GROUP_CATEGORY_LABELS[cat] ?? GROUP_CATEGORY_LABELS.otro;
}

export interface VinculadasMemoryContext {
  section: string;
  sectionTitle: string;
  page?: number;
  rowLabel?: string;
  documentName?: string;
}

const VINCULADAS_SECTION_TITLE = "Operaciones con partes vinculadas";

/** Contexto de localización en memoria para apartado 09 / vinculadas. */
export function resolveVinculadasMemoryContext(data: CaseData): VinculadasMemoryContext {
  const sectionDef = data.memory?.sections.find(
    (s) => s.id === "09" || s.numero === 9 || /vinculad/i.test(s.titulo)
  );

  const section = sectionDef?.numero
    ? String(sectionDef.numero).padStart(2, "0")
    : sectionDef?.id ?? "09";
  const sectionTitle = sectionDef?.titulo ?? VINCULADAS_SECTION_TITLE;

  const tablas =
    data.memory?.tables.filter(
      (t) =>
        t.apartado === "09" ||
        /vinculad|dependiente|dominante|saldos?\s+pendientes/i.test(t.titulo ?? "")
    ) ?? [];

  let page: number | undefined;
  let rowLabel: string | undefined;

  const vinculadas = data.memory?.vinculadas;
  if (vinculadas && vinculadas.filas.length > 0) {
    const conValor = vinculadas.filas.find((f) => f.ejercicioActual);
    rowLabel = conValor?.ejercicioActual?.origen.ubicacion;
  }

  for (const tabla of tablas) {
    if (tabla.pagina && !page) page = tabla.pagina;
    if (rowLabel) break;
    for (const fila of tabla.filas) {
      if (fila.length < 1) continue;
      const etiqueta = fila[0].replace(/^\d+\.\s*/, "").trim();
      if (!etiqueta) continue;
      if (/clientes?|proveedores?|pr[eé]stamo|participaciones?|cr[eé]ditos?/i.test(etiqueta)) {
        rowLabel = etiqueta;
        break;
      }
    }
    if (rowLabel) break;
  }

  if (!page) {
    const idx =
      data.memory?.fullText.toLowerCase().search(/vinculad|operaciones con partes vinculadas/i) ?? -1;
    if (idx >= 0 && data.memory) {
      page = Math.max(1, (data.memory.fullText.slice(0, idx).match(/\f/g) || []).length + 1);
    }
  }

  return {
    section,
    sectionTitle,
    page,
    rowLabel,
    documentName: data.memory?.metadata.archivo,
  };
}

export const EXCEL_GROUP_SUMMARY: Record<
  string,
  { accounts: string; label: string }
> = {
  clientes: { accounts: "433/434", label: "Suma de saldos de cierre" },
  proveedores: { accounts: "403/404", label: "Suma de saldos de cierre" },
  prestamos: { accounts: "24x/552", label: "Préstamos intragrupo" },
  participaciones: { accounts: "25x/242", label: "Participaciones" },
  comerciales: { accounts: "43/40", label: "Operaciones comerciales" },
  otro: { accounts: "vinculadas", label: "Otras cuentas" },
};

export function excelGroupSummaryLabel(
  group: string,
  sheet?: string
): string {
  const meta = EXCEL_GROUP_SUMMARY[group] ?? EXCEL_GROUP_SUMMARY.otro;
  const accounts =
    meta.accounts.length > 0 ? ` (Cuentas ${meta.accounts})` : "";
  const hoja = sheet ? ` - Hoja: ${sheet}` : "";
  return `${meta.label}${accounts}${hoja}`;
}

/** Clave de grupo UI para desglose Excel (clientes, proveedores, etc.). */
export function vinculadasEvidenceGroup(
  cuenta: string,
  categoria: GroupAccountCategory
): string {
  if (categoria === "comerciales") {
    if (/^43[34]/.test(cuenta)) return "clientes";
    if (/^40[34]/.test(cuenta)) return "proveedores";
    return "comerciales";
  }
  return categoria;
}

/** Fila trazada con mayor importe para una categoría cruzable (clientes, proveedores, préstamos). */
export function mejorFilaVinculadasPorCategoria(
  vinculadas: VinculadasMemoria | undefined,
  categoria: VinculadasCategoria
): ImporteVinculadasFila | undefined {
  const filas = vinculadas?.filas ?? [];
  return filas
    .filter((f) => f.categoria === categoria && f.ejercicioActual)
    .sort((a, b) => Math.abs(b.ejercicioActual!.valor) - Math.abs(a.ejercicioActual!.valor))[0];
}

/** Filas trazadas con importe en ejercicio actual, ordenadas por magnitud. */
export function filasVinculadasTrazadas(vinculadas: VinculadasMemoria | undefined): ImporteVinculadasFila[] {
  return (vinculadas?.filas ?? [])
    .filter((f) => f.ejercicioActual && Math.abs(f.ejercicioActual.valor) > 0)
    .sort((a, b) => Math.abs(b.ejercicioActual!.valor) - Math.abs(a.ejercicioActual!.valor));
}
