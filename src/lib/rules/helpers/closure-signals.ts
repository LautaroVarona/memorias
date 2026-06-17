import { getAccounts } from "@/lib/case/build-case-data";
import type { CaseData } from "@/types/case-data";
import type { CuentaNormalizada } from "@/types/domain";

export const PENDIENTES_UMBRAL_WARNING = 3;

export function countPendientes(data: CaseData): number {
  const notas = data.financials.libroCierre?.notas ?? [];
  return notas.filter((n) => n.pendiente).length;
}

export function hasSysA3Differences(data: CaseData): { has: boolean; count: number } {
  const libro = data.financials.libroCierre;
  if (!libro || libro.a3soc.length === 0 || libro.cuentas4.length === 0) {
    return { has: false, count: 0 };
  }

  const agregar = (cuentas: CuentaNormalizada[]) => {
    const m = new Map<string, number>();
    for (const c of cuentas) {
      const clave = c.cuenta.substring(0, 3);
      m.set(clave, (m.get(clave) ?? 0) + c.saldo);
    }
    return m;
  };

  const sys = agregar(libro.cuentas4);
  const a3 = agregar(libro.a3soc);
  const claves = new Set([...sys.keys(), ...a3.keys()]);

  let count = 0;
  for (const clave of claves) {
    if (clave.startsWith("6") || clave.startsWith("7") || clave.startsWith("129")) continue;
    const vSys = sys.get(clave) ?? 0;
    const vA3 = a3.get(clave) ?? 0;
    if (Math.abs(vSys - vA3) > 1) count++;
  }

  return { has: count > 0, count };
}
