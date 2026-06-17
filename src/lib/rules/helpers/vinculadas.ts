import { parseImporte } from "@/lib/parsers/memoria/extractors";
import type { CaseData } from "@/types/case-data";
import type { CuentaNormalizada } from "@/types/domain";
import { classifyGroupAccount, breakdownGroupAccounts } from "./group-accounts";
import { GROUP_CATEGORY_LABELS, type GroupAccountCategory } from "./group-accounts";

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

function sumByPrefixes(accounts: CuentaNormalizada[], prefixes: string[]): number {
  return accounts
    .filter((c) => prefixes.some((p) => c.cuenta.startsWith(p)))
    .reduce((s, c) => s + Math.abs(c.saldo), 0);
}

function sumTableByPattern(
  data: CaseData,
  rowPattern: RegExp
): number {
  const tablas =
    data.memory?.tables.filter(
      (t) => t.apartado === "09" || /vinculad|dependiente/i.test(t.titulo)
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

  const memoria = {
    clientesGrupo: sumTableByPattern(data, /clientes?.*(grupo|vinculad|dependiente)/i),
    proveedoresGrupo: sumTableByPattern(data, /proveedores?.*(grupo|vinculad|dependiente)/i),
    prestamos: sumTableByPattern(
      data,
      /pr[eé]stamo|cr[eé]dito|inversiones?\s+financieras/i
    ),
    total: 0,
  };
  memoria.total = memoria.clientesGrupo + memoria.proveedoresGrupo + memoria.prestamos;

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
