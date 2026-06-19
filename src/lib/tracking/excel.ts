import type { CuentaNormalizada, EpigrafeComparativo, LibroCierre } from "@/types/domain";
import type { TrackingValue } from "@/types/tracking";
import { trackingValue } from "@/types/tracking";
import { resolveContabilidadSheet } from "@/lib/parsers/excel/sheet-config";

const PATRON_RESERVA_CAPITALIZACION = /reserva.*capitalizaci|capitalizaci.*indispon|1146/i;

function tipoSaldoLabel(saldo: number): string {
  if (saldo < 0) return "Acreedor";
  if (saldo > 0) return "Deudor";
  return "Cero";
}

function hojaContabilidad(cuenta: CuentaNormalizada): string {
  return cuenta.hoja ?? resolveContabilidadSheet([]) ?? "SYS_4_3_Digitos";
}

/** Suma por prefijo de cuenta con ubicación dinámica en el libro de cierre */
export function sumByPrefixTracked(
  accounts: CuentaNormalizada[],
  prefixes: string[],
  hojaDefault?: string
): TrackingValue<number> | undefined {
  const matched = accounts.filter((c) => prefixes.some((p) => c.cuenta.startsWith(p)));
  if (matched.length === 0) return undefined;

  const total = matched.reduce((sum, c) => sum + Math.abs(c.saldo), 0);
  const hoja = matched[0].hoja ?? hojaDefault ?? "SYS_4_3_Digitos";
  const cuentas = [...new Set(matched.map((c) => c.cuenta))];

  const ubicacion =
    cuentas.length === 1
      ? `Hoja: ${hoja} / Cuenta: ${cuentas[0]} / Saldo ${tipoSaldoLabel(matched[0].saldo)}`
      : `Hoja: ${hoja} / Cuenta: ${prefixes.join("")} (Sumatorio subcuentas ${prefixes.join("")}x: ${cuentas.join(", ")})`;

  return trackingValue(total, "excel", ubicacion);
}

/** Localiza una cuenta por prefijo y devuelve su saldo con trazabilidad */
export function cuentaByPrefixTracked(
  accounts: CuentaNormalizada[],
  prefix: string
): TrackingValue<number> | undefined {
  const cuenta = accounts.find((c) => c.cuenta.startsWith(prefix));
  if (!cuenta) return undefined;

  const hoja = hojaContabilidad(cuenta);
  const fila = cuenta.fila !== undefined ? ` / Fila: ${cuenta.fila}` : "";
  const ubicacion = `Hoja: ${hoja} / Cuenta: ${cuenta.cuenta}${fila} / Saldo ${tipoSaldoLabel(cuenta.saldo)}`;

  return trackingValue(Math.abs(cuenta.saldo), "excel", ubicacion, String(cuenta.saldo));
}

function epigrafeCalcisTracked(epigrafe: EpigrafeComparativo): TrackingValue<number> {
  const ubicacion = `Hoja: ${epigrafe.hoja} / Epígrafe: '${epigrafe.etiqueta}' / Fila: ${epigrafe.fila} / Columna: ejercicio actual`;
  return trackingValue(epigrafe.actual, "excel", ubicacion, String(epigrafe.actual));
}

function cuenta1146Tracked(cuenta: CuentaNormalizada): TrackingValue<number> {
  const hoja = hojaContabilidad(cuenta);
  const fila = cuenta.fila !== undefined ? ` / Fila: ${cuenta.fila}` : "";
  const ubicacion = `Hoja: ${hoja} / Cuenta: ${cuenta.cuenta}${fila} / Saldo ${tipoSaldoLabel(cuenta.saldo)}`;
  return trackingValue(Math.abs(cuenta.saldo), "excel", ubicacion, String(cuenta.saldo));
}

/** Saldo del cierre con trazabilidad (A3SOC preferido, fallback SYS) */
export function saldoCierreTracked(
  libro: LibroCierre,
  prefijos: string[]
): TrackingValue<number> | undefined {
  const enA3 = libro.a3soc.filter((c) => prefijos.some((p) => c.cuenta.startsWith(p)));
  if (enA3.length > 0) {
    return sumByPrefixTracked(enA3, prefijos, "A3SOC");
  }
  const hoja = resolveContabilidadSheet(libro.hojasDetectadas) ?? "SYS_4_3_Digitos";
  return sumByPrefixTracked(libro.cuentas4, prefijos, hoja);
}

/** Extrae reserva de capitalización de CALCIS (o fallback 1146) con trazabilidad */
export function mapCalcisReservaTracked(libro?: LibroCierre): TrackingValue<number> | undefined {
  if (!libro) return undefined;

  if (libro.calcis?.reservaCapitalizacion) {
    return libro.calcis.reservaCapitalizacion;
  }

  const hoja = libro.hojasMinisterio?.find((h) => /^calcis$/i.test(h.nombre.trim()));
  if (hoja) {
    const epigrafe = hoja.epigrafes.find((e) => PATRON_RESERVA_CAPITALIZACION.test(e.etiqueta));
    if (epigrafe) return epigrafeCalcisTracked(epigrafe);
  }

  const cuenta1146 = libro.cuentas4.find((c) => c.cuenta.startsWith("1146"));
  if (cuenta1146 && Math.abs(cuenta1146.saldo) > 0) {
    return cuenta1146Tracked(cuenta1146);
  }

  return undefined;
}
