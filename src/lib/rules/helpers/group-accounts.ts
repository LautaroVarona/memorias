import type { CuentaNormalizada } from "@/types/domain";

export type GroupAccountCategory = "prestamos" | "participaciones" | "comerciales" | "otro";

export interface GroupAccountBreakdown {
  prestamos: { accounts: CuentaNormalizada[]; total: number };
  participaciones: { accounts: CuentaNormalizada[]; total: number };
  comerciales: { accounts: CuentaNormalizada[]; total: number };
  otro: { accounts: CuentaNormalizada[]; total: number };
}

export function classifyGroupAccount(cuenta: string): GroupAccountCategory {
  if (cuenta.startsWith("552") || cuenta.startsWith("242")) return "prestamos";
  if (cuenta.startsWith("24") || cuenta.startsWith("25")) return "participaciones";
  if (cuenta.startsWith("43") || cuenta.startsWith("40")) return "comerciales";
  return "otro";
}

export function breakdownGroupAccounts(accounts: CuentaNormalizada[]): GroupAccountBreakdown {
  const result: GroupAccountBreakdown = {
    prestamos: { accounts: [], total: 0 },
    participaciones: { accounts: [], total: 0 },
    comerciales: { accounts: [], total: 0 },
    otro: { accounts: [], total: 0 },
  };

  for (const c of accounts) {
    if (Math.abs(c.saldo) === 0) continue;
    const cat = classifyGroupAccount(c.cuenta);
    result[cat].accounts.push(c);
    result[cat].total += Math.abs(c.saldo);
  }

  return result;
}

export function dominantGroupCategory(breakdown: GroupAccountBreakdown): GroupAccountCategory | "mixto" {
  const entries: [GroupAccountCategory, number][] = [
    ["prestamos", breakdown.prestamos.total],
    ["participaciones", breakdown.participaciones.total],
    ["comerciales", breakdown.comerciales.total],
  ];
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] === 0) return "mixto";
  if (sorted[0][1] > 0 && sorted[1][1] > sorted[0][1] * 0.3) return "mixto";
  return sorted[0][0];
}

export function severityByGroupTotal(total: number): "critical" | "error" | "warning" {
  if (total > 1_000_000) return "critical";
  if (total > 100_000) return "error";
  return "warning";
}

export const GROUP_CATEGORY_LABELS: Record<GroupAccountCategory | "mixto", string> = {
  prestamos: "financiación intragrupo",
  participaciones: "estructura societaria / participaciones",
  comerciales: "operaciones comerciales con grupo",
  otro: "operaciones de grupo",
  mixto: "operaciones vinculadas diversas",
};
