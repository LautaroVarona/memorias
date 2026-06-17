import cuentasPGC from "../../../data/pgc/cuentas.json";
import type { CuentaNormalizada } from "@/types/domain";

type GrupoPGC = CuentaNormalizada["grupoPGC"];

export function inferirNivel(cuenta: string): number {
  if (cuenta.length <= 1) return 1;
  if (cuenta.length === 2) return 2;
  if (cuenta.length === 3) return 3;
  return 4;
}

export function clasificarGrupoPGC(cuenta: string): GrupoPGC {
  const grupo = cuenta.charAt(0);
  const subgrupo = cuenta.substring(0, 2);
  const especial = (cuentasPGC.cuentasEspeciales as Record<string, { grupo: string }>)[
    cuenta.substring(0, 3)
  ] || (cuentasPGC.cuentasEspeciales as Record<string, { grupo: string }>)[cuenta];

  if (especial) {
    return especial.grupo as GrupoPGC;
  }

  if (grupo === "6" || grupo === "8") return "gasto";
  if (grupo === "7" || grupo === "9") return "ingreso";

  if ((cuentasPGC.subgruposPatrimonio as string[]).includes(subgrupo) && parseInt(grupo) <= 1) {
    return "patrimonio";
  }
  if ((cuentasPGC.subgruposActivos as string[]).includes(subgrupo)) return "activo";
  if ((cuentasPGC.subgruposPasivos as string[]).includes(subgrupo)) return "pasivo";

  if (grupo === "1") return "patrimonio";
  if (grupo === "2" || grupo === "3" || grupo === "5") return "activo";
  if (grupo === "4") return "pasivo";

  return "otro";
}

export function esCuentaValida(valor: string): boolean {
  return /^\d{4,6}$/.test(valor.trim());
}

export function normalizarCuenta(
  cuenta: string,
  descripcion: string,
  debe: number,
  haber: number,
  saldo?: number,
  fila?: number,
  hoja?: string,
  columna?: number
): CuentaNormalizada {
  const saldoFinal = saldo ?? debe - haber;
  return {
    cuenta: cuenta.trim(),
    descripcion: descripcion.trim(),
    debe,
    haber,
    saldo: saldoFinal,
    nivel: inferirNivel(cuenta.trim()),
    grupoPGC: clasificarGrupoPGC(cuenta.trim()),
    fila,
    hoja,
    columna,
  };
}

export function sumarPorPrefijo(cuentas: CuentaNormalizada[], prefijos: string[]): number {
  return cuentas
    .filter((c) => prefijos.some((p) => c.cuenta.startsWith(p)))
    .reduce((sum, c) => sum + Math.abs(c.saldo), 0);
}

export function obtenerSaldoCuenta(cuentas: CuentaNormalizada[], prefijos: string[]): number {
  return cuentas
    .filter((c) => prefijos.some((p) => c.cuenta.startsWith(p)))
    .reduce((sum, c) => sum + c.saldo, 0);
}

export function esActivoFinanciero(cuenta: string): boolean {
  return (cuentasPGC.activosFinancieros as string[]).some(
    (p) => cuenta.startsWith(p) || cuenta === p
  );
}

export function esDeuda(cuenta: string): boolean {
  return (cuentasPGC.deuda as string[]).some((p) => cuenta.startsWith(p) || cuenta === p);
}
