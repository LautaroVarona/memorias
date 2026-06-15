import { getAccounts } from "@/lib/case/build-case-data";
import { sumByPrefix } from "@/lib/rules/helpers/accounts";
import type { CaseData } from "@/types/case-data";
import type { CuentaNormalizada } from "@/types/domain";

export const PENDIENTES_UMBRAL_WARNING = 3;

/** Modelos fiscales que pueden ser obligatorios según operaciones detectadas */
const FISCAL_MODEL_RULES: {
  modelo: string;
  label: string;
  detect: (data: CaseData) => boolean;
}[] = [
  {
    modelo: "349",
    label: "Modelo 349 (operaciones intracomunitarias/vinculadas)",
    detect: (data) => {
      const accounts = getAccounts(data);
      const vinculadas = sumByPrefix(accounts, ["433", "434", "403", "404", "242", "552", "24", "25"]);
      return Math.abs(vinculadas) > 10_000;
    },
  },
  {
    modelo: "115",
    label: "Modelo 115 (retenciones e ingresos a cuenta)",
    detect: (data) => {
      const accounts = getAccounts(data);
      const retenciones = sumByPrefix(accounts, ["473", "4751", "4752"]);
      return Math.abs(retenciones) > 1_000;
    },
  },
  {
    modelo: "347",
    label: "Modelo 347 (operaciones con terceros)",
    detect: (data) => {
      const accounts = getAccounts(data);
      const terceros = sumByPrefix(accounts, ["400", "410", "430", "440"]);
      return Math.abs(terceros) > 500_000;
    },
  },
  {
    modelo: "180",
    label: "Modelo 180 (resumen anual IRPF)",
    detect: (data) => {
      const empleo = data.memory?.keyData.empleoMedio ?? 0;
      return empleo > 0;
    },
  },
];

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

/** Modelos fiscales probablemente obligatorios pero no confirmados en el expediente */
export function detectMissingFiscalModels(data: CaseData): string[] {
  const textoNotas = (data.financials.libroCierre?.notas ?? [])
    .map((n) => `${n.concepto} ${n.detalle ?? ""}`)
    .join(" ")
    .toLowerCase();

  const textoMemoria = data.memory?.fullText.toLowerCase() ?? "";
  const textoCompleto = `${textoNotas} ${textoMemoria}`;

  const faltantes: string[] = [];
  for (const regla of FISCAL_MODEL_RULES) {
    if (!regla.detect(data)) continue;
    const patron = new RegExp(`modelo\\s*${regla.modelo}|mod\\.?\\s*${regla.modelo}|\\b${regla.modelo}\\b.*presentad`, "i");
    const mencionado = patron.test(textoCompleto);
    const pendienteModelo = new RegExp(`${regla.modelo}.*pendiente|pendiente.*${regla.modelo}|falta.*${regla.modelo}`, "i").test(
      textoCompleto
    );
    if (!mencionado || pendienteModelo) {
      faltantes.push(regla.label);
    }
  }
  return faltantes;
}

export function hasElevatedVinculadas(data: CaseData): boolean {
  const accounts = getAccounts(data);
  const total = accounts
    .filter(
      (c) =>
        Math.abs(c.saldo) > 0 &&
        ["24", "25", "242", "552", "433", "434", "403", "404"].some((p) => c.cuenta.startsWith(p))
    )
    .reduce((s, c) => s + Math.abs(c.saldo), 0);
  return total > 50_000;
}

export function hasElevatedResultado(data: CaseData): boolean {
  const resultado = data.financials.balance?.resultado ?? 0;
  return Math.abs(resultado) > 100_000;
}

export function hasVinculadasExplanation(data: CaseData): boolean {
  const texto = data.memory?.fullText.toLowerCase() ?? "";
  if (/operaciones?\s+(con\s+)?partes?\s+vinculadas|saldos?\s+con\s+vinculadas/i.test(texto)) return true;
  const tablas = data.memory?.tables.filter((t) => t.apartado === "09" || /vinculad/i.test(t.titulo)) ?? [];
  return tablas.some((t) => !t.vacia && t.filas.length > 0);
}
