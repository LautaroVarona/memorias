/**
 * Validación numérica memoria ↔ Excel.
 *
 * REGLA DE ORO: el Excel solo valida cifras ya extraídas del Word.
 * Este módulo no construye estructura, títulos ni texto para la vista.
 */

import { compareWithTolerance } from "@/lib/rules/helpers/accounts";
import { cuentaByPrefixTracked, sumByPrefixTracked } from "@/lib/tracking/excel";
import type { CaseData, PropuestaAplicacion } from "@/types/case-data";
import type { CuentaNormalizada } from "@/types/domain";
import type { TrackingValue } from "@/types/tracking";
import { unwrapValue } from "@/types/tracking";

export interface ValidacionNumerica {
  cuadra: boolean;
  valorMemoria?: number;
  valorExcel?: number;
  diferencia?: number;
  comparable: boolean;
}

export interface ValidacionPropuestaExcel {
  resultadoEjercicio?: ValidacionNumerica;
  reservaCapitalizacion?: ValidacionNumerica;
  reservasVoluntarias?: ValidacionNumerica;
}

function normalizeTrackedNumber(value: number | null | undefined): number | undefined {
  return value ?? undefined;
}

function compararCifras(
  memoria: TrackingValue<number> | null | undefined,
  excel: TrackingValue<number> | null | undefined,
  tolerancia = 1
): ValidacionNumerica {
  const valorMemoria = normalizeTrackedNumber(unwrapValue(memoria));
  const valorExcel = normalizeTrackedNumber(unwrapValue(excel));

  if (valorMemoria === undefined || valorExcel === undefined) {
    return { cuadra: true, valorMemoria, valorExcel, comparable: false };
  }

  const cuadra = compareWithTolerance(valorMemoria, valorExcel, tolerancia);
  return {
    cuadra,
    valorMemoria,
    valorExcel,
    diferencia: Math.abs(valorMemoria - valorExcel),
    comparable: true,
  };
}

/** Cruza cifras de propuesta de aplicación (Word) con CALCIS / cuentas (Excel). */
export function validatePropuestaWithExcel(
  propuesta: PropuestaAplicacion | undefined,
  accounts: CuentaNormalizada[],
  calcisReserva?: TrackingValue<number> | null,
  tolerancia = 1
): ValidacionPropuestaExcel {
  const cuenta129 = cuentaByPrefixTracked(accounts, "129");
  const cuenta113 = sumByPrefixTracked(accounts, ["113"]);

  return {
    resultadoEjercicio: compararCifras(propuesta?.resultadoEjercicio, cuenta129, tolerancia),
    reservaCapitalizacion: compararCifras(
      propuesta?.reservaIndisponible,
      calcisReserva,
      tolerancia
    ),
    reservasVoluntarias: compararCifras(propuesta?.reservasVoluntarias, cuenta113, tolerancia),
  };
}

/** Punto de entrada para validaciones numéricas sin mezclar fuentes en la estructura. */
export function validateNumbersWithExcel(data: CaseData, tolerancia = 1): ValidacionPropuestaExcel {
  const accounts = data.financials.accounts.length
    ? data.financials.accounts
    : data.financials.sumasSaldos ?? [];

  return validatePropuestaWithExcel(
    data.memory?.propuestaAplicacion,
    accounts,
    data.excel?.calcis?.reservaCapitalizacion,
    tolerancia
  );
}

export function validacionFallida(v: ValidacionNumerica | undefined): boolean {
  return Boolean(v?.comparable && !v.cuadra);
}
