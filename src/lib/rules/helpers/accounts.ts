import type { CaseData } from "@/types/case-data";
import type { CuentaNormalizada } from "@/types/domain";
import { getAccounts } from "@/lib/case/build-case-data";

export function sumByPrefix(accounts: CuentaNormalizada[], prefixes: string[]): number {
  return accounts
    .filter((c) => prefixes.some((p) => c.cuenta.startsWith(p)))
    .reduce((sum, c) => sum + Math.abs(c.saldo), 0);
}

export function accountsByPrefix(
  accounts: CuentaNormalizada[],
  prefixes: string[]
): CuentaNormalizada[] {
  return accounts.filter((c) => prefixes.some((p) => c.cuenta.startsWith(p)));
}

export function compareWithTolerance(a: number, b: number, pct: number): boolean {
  if (a === 0 && b === 0) return true;
  const base = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / base <= pct;
}

export function sumFromCase(data: CaseData, prefixes: string[]): number {
  return sumByPrefix(getAccounts(data), prefixes);
}

export function formatEuro(n: number): string {
  return `${n.toLocaleString("es-ES")} €`;
}
