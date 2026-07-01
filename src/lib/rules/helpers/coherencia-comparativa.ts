import { parseImporte } from "@/lib/parsers/memoria/extractors";
import {
  detectarFusionEnCabecera,
  indiceColumnaEjercicioEstricto,
} from "@/lib/parsers/memoria/schemas";
import { compareWithTolerance } from "@/lib/rules/helpers/accounts";
import { celdaImporteTieneValor } from "@/lib/rules/helpers/tablas-interanual";
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

export interface ResultadoColumnaEjercicio {
  indice: number | null;
  tabla_rota?: boolean;
  vacia?: boolean;
  error?: string;
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

/**
 * Localiza la columna cuyo encabezado referencia un ejercicio (p. ej. «IMPORTE 2024»).
 * Ultra estricta: rechaza cabeceras aplanadas o fusionadas.
 */
export function encontrarColumnaEjercicio(
  cabecera: string[],
  ejercicio: number
): ResultadoColumnaEjercicio {
  const columnasConTexto = cabecera.filter((c) => c.trim().length > 0);

  if (columnasConTexto.length < 2) {
    return {
      indice: null,
      vacia: true,
      error: "Cabecera sin columnas de datos",
    };
  }

  if (detectarFusionEnCabecera(cabecera)) {
    return {
      indice: null,
      tabla_rota: true,
      error: "Fusión de columnas en cabecera",
    };
  }

  const idx = indiceColumnaEjercicioEstricto(cabecera, ejercicio);
  if (idx === null) {
    return {
      indice: null,
      tabla_rota: true,
      error: `Columna IMPORTE ${ejercicio} no aislada en cabecera`,
    };
  }

  return { indice: idx };
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
): Map<
  string,
  {
    valor: number | null;
    tieneValor: boolean;
    filaEtiqueta: string;
    apartado?: string;
    tablaTitulo?: string;
    pagina?: number;
  }
> {
  const map = new Map<
    string,
    {
      valor: number | null;
      tieneValor: boolean;
      filaEtiqueta: string;
      apartado?: string;
      tablaTitulo?: string;
      pagina?: number;
    }
  >();

  for (const tabla of tablas) {
    if (tabla.tabla_rota) continue;

    const col = encontrarColumnaEjercicio(tabla.cabecera, ejercicioObjetivo);
    if (col.indice === null) continue;

    for (const fila of tabla.filas) {
      if (esFilaCabeceraAnual(fila)) continue;
      const etiqueta = normalizarEtiquetaFila(fila[0] ?? "");
      if (!etiqueta || etiqueta.length < 3) continue;
      const celda = fila[col.indice] ?? "";
      const valor = parseImporte(celda);
      const tieneValor = celdaImporteTieneValor(celda);
      if (!tieneValor) continue;

      const clave = claveFila(tabla.apartado, etiqueta);
      map.set(clave, {
        valor,
        tieneValor,
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
    if (tabla.tabla_rota) continue;

    const col = encontrarColumnaEjercicio(tabla.cabecera, ejercicioAnterior);
    if (col.indice === null) continue;

    for (const fila of tabla.filas) {
      if (esFilaCabeceraAnual(fila)) continue;
      const etiqueta = normalizarEtiquetaFila(fila[0] ?? "");
      if (!etiqueta || etiqueta.length < 3) continue;

      const celdaComparativa = fila[col.indice] ?? "";
      const valorComparativa = parseImporte(celdaComparativa);
      const tieneComparativa = celdaImporteTieneValor(celdaComparativa);

      const clave = claveFila(tabla.apartado, etiqueta);
      if (vistos.has(clave)) continue;

      const ref = referencia.get(clave);
      if (!ref) {
        if (tieneComparativa) {
          vistos.add(clave);
          descuadres.push({
            apartado: tabla.apartado,
            filaEtiqueta: fila[0]?.trim() || etiqueta,
            ejercicioReferencia: ejercicioAnterior,
            valorMemoriaAnterior: 0,
            valorColumnaComparativa: valorComparativa ?? 0,
            tablaTitulo: tabla.titulo,
            pagina: tabla.pagina,
          });
        }
        continue;
      }

      vistos.add(clave);

      if (!tieneComparativa) {
        descuadres.push({
          apartado: tabla.apartado ?? ref.apartado,
          filaEtiqueta: fila[0]?.trim() || ref.filaEtiqueta,
          ejercicioReferencia: ejercicioAnterior,
          valorMemoriaAnterior: ref.valor ?? 0,
          valorColumnaComparativa: 0,
          tablaTitulo: tabla.titulo || ref.tablaTitulo,
          pagina: tabla.pagina ?? ref.pagina,
        });
        continue;
      }

      if (
        ref.valor !== null &&
        valorComparativa !== null &&
        compareWithTolerance(valorComparativa, ref.valor, tolerancia)
      ) {
        continue;
      }

      descuadres.push({
        apartado: tabla.apartado ?? ref.apartado,
        filaEtiqueta: fila[0]?.trim() || ref.filaEtiqueta,
        ejercicioReferencia: ejercicioAnterior,
        valorMemoriaAnterior: ref.valor ?? 0,
        valorColumnaComparativa: valorComparativa ?? 0,
        tablaTitulo: tabla.titulo || ref.tablaTitulo,
        pagina: tabla.pagina ?? ref.pagina,
      });
    }
  }

  return descuadres;
}
