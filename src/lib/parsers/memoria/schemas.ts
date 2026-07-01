/**
 * Esquemas Zod estrictos para tablas comparativas críticas de la memoria.
 * Fail-fast: detecta columnas fusionadas y asimetrías N / N-1 antes de alimentar reglas.
 */

import { z } from "zod";
import { parseImporte } from "./extractors";

/** Patrón típico de aplanamiento: «IMPORTE 2025IMPORTE 2024» sin separador. */
export const PATRON_COLUMNAS_FUSIONADAS = /IMPORTE\s+\d{4}IMPORTE\s+\d{4}/i;

const PATRON_IMPORTE_ANIO = /^IMPORTE\s+(20\d{2})$/i;
const PATRON_ANIO_AISLADO = /^(20\d{2})$/;

export const filaComparativaSchema = z.object({
  etiqueta: z.string().min(1),
  ejercicio_actual: z.number(),
  ejercicio_anterior: z.number(),
});

export type FilaComparativa = z.infer<typeof filaComparativaSchema>;

export type TipoTablaCritica =
  | "activos_financieros"
  | "pasivos_financieros"
  | "partes_vinculadas";

export interface TablaCrudaValidacion {
  cabecera: string[];
  filas: string[][];
  titulo?: string;
  apartado?: string;
  esComparativaAnual?: boolean;
}

/** Detecta texto con años/importes fusionados en una sola celda. */
export function detectarFusionColumnas(texto: string): boolean {
  const t = texto.trim();
  if (!t) return false;
  if (PATRON_COLUMNAS_FUSIONADAS.test(t)) return true;

  const importes = t.match(/IMPORTE\s+20\d{2}/gi) ?? [];
  if (importes.length > 1) return true;

  // Etiqueta descriptiva con importes embebidos (ej. «INSTRUMENTOS LPIMPORTE 2025…»)
  if (/[A-ZÁÉÍÓÚÑ]{3,}.*IMPORTE\s+20\d{2}/i.test(t) && !PATRON_IMPORTE_ANIO.test(t)) {
    return true;
  }

  return false;
}

export function detectarFusionEnCabecera(cabecera: string[]): boolean {
  return cabecera.some((c) => detectarFusionColumnas(c));
}

export function detectarFusionEnFilas(filas: string[][]): boolean {
  return filas.some((fila) => fila.some((c) => detectarFusionColumnas(c)));
}

/**
 * Localiza una columna de ejercicio de forma estricta: la celda debe ser
 * exactamente «IMPORTE YYYY» o «YYYY», nunca un substring suelto.
 */
export function indiceColumnaEjercicioEstricto(cabecera: string[], ejercicio: number): number | null {
  const y = String(ejercicio);
  for (let i = 0; i < cabecera.length; i++) {
    const celda = cabecera[i].trim();
    if (!celda) continue;
    if (PATRON_IMPORTE_ANIO.test(celda) && celda.toUpperCase().includes(y)) return i;
    if (PATRON_ANIO_AISLADO.test(celda) && celda === y) return i;
  }
  return null;
}

export function clasificarTablaCritica(tabla: TablaCrudaValidacion): TipoTablaCritica | null {
  const texto = [tabla.titulo, tabla.cabecera[0], tabla.apartado].filter(Boolean).join(" ").toLowerCase();

  if (/activos?\s+financieros?/.test(texto) || tabla.apartado === "05") return "activos_financieros";
  if (/pasivos?\s+financieros?/.test(texto) || tabla.apartado === "06") return "pasivos_financieros";
  if (
    /vinculad|dependiente|dominante|partes\s+vinculadas|saldos?\s+pendientes/.test(texto) ||
    tabla.apartado === "09"
  ) {
    return "partes_vinculadas";
  }

  const cabJoin = tabla.cabecera.join(" ");
  if (/dominante|dependiente|vinculadas/i.test(cabJoin) && /descripci[oó]n/i.test(cabJoin)) {
    return "partes_vinculadas";
  }

  return null;
}

function filaEsCabeceraAnual(cells: string[]): boolean {
  const joined = cells.join(" ").toLowerCase();
  return /importe\s+20\d{2}/.test(joined) && cells.filter((c) => parseImporte(c) !== null).length === 0;
}

/**
 * Valida una tabla comparativa cruda contra el ejercicio ancla N.
 * Lanza Error explícito si la estructura está corrupta.
 */
export function validarTablaComparativaCruda(tabla: TablaCrudaValidacion, ejercicioActual: number): void {
  const ejercicioAnterior = ejercicioActual - 1;

  if (detectarFusionEnCabecera(tabla.cabecera) || detectarFusionEnFilas(tabla.filas)) {
    throw new Error("Tabla corrupta: Fusión de columnas detectada");
  }

  const colActual = indiceColumnaEjercicioEstricto(tabla.cabecera, ejercicioActual);
  const colAnterior = indiceColumnaEjercicioEstricto(tabla.cabecera, ejercicioAnterior);

  if (colActual === null || colAnterior === null) {
    throw new Error(
      `Tabla corrupta: no se encontraron columnas aisladas para ${ejercicioActual} y ${ejercicioAnterior}`
    );
  }

  for (const fila of tabla.filas) {
    if (filaEsCabeceraAnual(fila)) continue;

    const etiqueta = (fila[0] ?? "").trim();
    if (!etiqueta || etiqueta.length < 3) continue;

    if (detectarFusionColumnas(etiqueta)) {
      throw new Error("Tabla corrupta: Fusión de columnas detectada");
    }

    const valActual = parseImporte(fila[colActual] ?? "");
    const valAnterior = parseImporte(fila[colAnterior] ?? "");

    const unoConValor = valActual !== null || valAnterior !== null;
    const asimetria = (valActual !== null) !== (valAnterior !== null);

    if (unoConValor && asimetria) {
      const celdaRica = valActual !== null ? (fila[colActual] ?? "") : (fila[colAnterior] ?? "");
      if (detectarFusionColumnas(celdaRica)) {
        throw new Error("Tabla corrupta: Fusión de columnas detectada");
      }
      throw new Error(
        `Tabla corrupta: monto asimétrico en fila «${etiqueta.slice(0, 40)}» (${ejercicioActual}/${ejercicioAnterior})`
      );
    }

    if (valActual !== null && valAnterior !== null) {
      filaComparativaSchema.parse({
        etiqueta,
        ejercicio_actual: valActual,
        ejercicio_anterior: valAnterior,
      });
    }
  }
}

/** Valida tablas críticas y comparativas anuales; ignora tablas puramente textuales. */
export function validarTablaCriticaSiAplica(tabla: TablaCrudaValidacion, ejercicioActual: number): void {
  const tipo = clasificarTablaCritica(tabla);

  if (!tipo) {
    if (tabla.esComparativaAnual) {
      if (detectarFusionEnCabecera(tabla.cabecera) || detectarFusionEnFilas(tabla.filas)) {
        throw new Error("Tabla corrupta: Fusión de columnas detectada");
      }
    }
    return;
  }

  validarTablaComparativaCruda(tabla, ejercicioActual);
}
