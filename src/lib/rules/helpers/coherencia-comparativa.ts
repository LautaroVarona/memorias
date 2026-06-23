import { parseImporte } from "@/lib/parsers/memoria/extractors";
import { compareWithTolerance } from "@/lib/rules/helpers/accounts";
import type { TablaMemoria } from "@/types/domain";
import { normalizarTextoApartado } from "./text-normalize";

export interface DescuadreComparativa {
  apartado?: string;
  filaEtiqueta: string;
  ejercicioReferencia: number;
  valorMemoriaAnterior: number;
  valorColumnaComparativa: number;
  tablaTitulo?: string;
  pagina?: number;
}

function normalizarEtiquetaFila(label: string): string {
  return normalizarTextoApartado(label)
    .replace(/\bimporte\s+20\d{2}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function esFilaCabeceraAnual(cells: string[]): boolean {
  const joined = cells.join(" ").toLowerCase();
  if (/importe\s+20\d{2}/.test(joined) && cells.filter((c) => parseImporte(c) !== null).length === 0) {
    return true;
  }
  const label = (cells[0] ?? "").toLowerCase();
  return /^movimientos\s/.test(label) && /importe\s+20\d{2}/.test(joined);
}

/** Localiza la columna cuyo encabezado referencia un ejercicio (p. ej. «importe 2024»). */
export function encontrarColumnaEjercicio(cabecera: string[], ejercicio: number): number | null {
  const y = String(ejercicio);
  for (let i = 0; i < cabecera.length; i++) {
    if (cabecera[i].toLowerCase().includes(y)) return i;
  }
  return null;
}

function claveFila(apartado: string | undefined, etiqueta: string): string {
  const ap = apartado?.replace(/\D/g, "").padStart(2, "0") ?? "";
  return `${ap}|${etiqueta}`;
}

/**
 * Extrae cifras de un ejercicio concreto desde las tablas de una memoria.
 * Clave: apartado|etiqueta de fila normalizada.
 */
export function extraerCifrasEjercicio(
  tablas: TablaMemoria[],
  ejercicioObjetivo: number
): Map<string, { valor: number; filaEtiqueta: string; apartado?: string; tablaTitulo?: string; pagina?: number }> {
  const map = new Map<
    string,
    { valor: number; filaEtiqueta: string; apartado?: string; tablaTitulo?: string; pagina?: number }
  >();

  for (const tabla of tablas) {
    const colIdx = encontrarColumnaEjercicio(tabla.cabecera, ejercicioObjetivo);
    if (colIdx === null) continue;

    for (const fila of tabla.filas) {
      if (esFilaCabeceraAnual(fila)) continue;
      const etiqueta = normalizarEtiquetaFila(fila[0] ?? "");
      if (!etiqueta || etiqueta.length < 3) continue;
      const valor = parseImporte(fila[colIdx] ?? "");
      if (valor === null) continue;

      const clave = claveFila(tabla.apartado, etiqueta);
      map.set(clave, {
        valor,
        filaEtiqueta: fila[0]?.trim() || etiqueta,
        apartado: tabla.apartado,
        tablaTitulo: tabla.titulo,
        pagina: tabla.pagina,
      });
    }
  }

  return map;
}

/**
 * Compara la columna del ejercicio anterior en la memoria actual con las cifras
 * publicadas en la memoria del ejercicio anterior para ese mismo ejercicio.
 */
export function detectarDescuadresComparativa(
  tablasActual: TablaMemoria[],
  tablasAnterior: TablaMemoria[],
  ejercicioActual: number,
  ejercicioAnterior: number,
  tolerancia = 0.005
): DescuadreComparativa[] {
  const referencia = extraerCifrasEjercicio(tablasAnterior, ejercicioAnterior);
  const descuadres: DescuadreComparativa[] = [];
  const vistos = new Set<string>();

  for (const tabla of tablasActual) {
    const colIdx = encontrarColumnaEjercicio(tabla.cabecera, ejercicioAnterior);
    if (colIdx === null) continue;

    for (const fila of tabla.filas) {
      if (esFilaCabeceraAnual(fila)) continue;
      const etiqueta = normalizarEtiquetaFila(fila[0] ?? "");
      if (!etiqueta || etiqueta.length < 3) continue;

      const valorComparativa = parseImporte(fila[colIdx] ?? "");
      if (valorComparativa === null) continue;

      const clave = claveFila(tabla.apartado, etiqueta);
      if (vistos.has(clave)) continue;

      const ref = referencia.get(clave);
      if (!ref) continue;

      vistos.add(clave);
      if (compareWithTolerance(valorComparativa, ref.valor, tolerancia)) continue;

      descuadres.push({
        apartado: tabla.apartado ?? ref.apartado,
        filaEtiqueta: fila[0]?.trim() || ref.filaEtiqueta,
        ejercicioReferencia: ejercicioAnterior,
        valorMemoriaAnterior: ref.valor,
        valorColumnaComparativa: valorComparativa,
        tablaTitulo: tabla.titulo || ref.tablaTitulo,
        pagina: tabla.pagina ?? ref.pagina,
      });
    }
  }

  return descuadres;
}
