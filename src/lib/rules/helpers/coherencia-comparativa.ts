import { parseImporte } from "@/lib/parsers/memoria/extractors";
import {
  detectarFusionEnCabecera,
  indiceColumnaEjercicioEstricto,
} from "@/lib/parsers/memoria/schemas";
import { etiquetaFilaParaAlineacion } from "@/lib/parsers/memoria/table-parser";
import { compareWithTolerance } from "@/lib/rules/helpers/accounts";
import { celdaImporteTieneValor } from "@/lib/rules/helpers/tablas-interanual";
import type { TablaMemoria } from "@/types/domain";
import { normalizarTextoApartado } from "./text-normalize";

export type MotivoDescuadreComparativa = "descuadre_cifra" | "falta_elemento";

export interface DescuadreComparativa {
  apartado?: string;
  filaEtiqueta: string;
  ejercicioReferencia: number;
  valorMemoriaAnterior: number;
  valorColumnaComparativa: number;
  motivo: MotivoDescuadreComparativa;
  tablaTitulo?: string;
  pagina?: number;
}

interface FilaEtiquetada {
  etiqueta: string;
  etiquetaDisplay: string;
  valor: number | null;
  tieneValor: boolean;
  apartado?: string;
  tablaTitulo?: string;
  pagina?: number;
}

export interface ResultadoColumnaEjercicio {
  indice: number | null;
  tabla_rota?: boolean;
  vacia?: boolean;
  error?: string;
}

function normalizarEtiquetaFila(label: string, cabecera?: string[]): string {
  if (cabecera) {
    return etiquetaFilaParaAlineacion([label], cabecera);
  }
  return normalizarTextoApartado(label)
    .replace(/\bimporte\s+20\d{2}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Empareja filas por etiqueta (LCS) aunque el orden o el número de filas difiera. */
function alinearFilasPorEtiqueta(
  priorFilas: FilaEtiquetada[],
  currentFilas: FilaEtiquetada[]
): { prior?: FilaEtiquetada; current?: FilaEtiquetada }[] {
  const priorLabels = priorFilas.map((f) => f.etiqueta);
  const currentLabels = currentFilas.map((f) => f.etiqueta);
  const n = priorLabels.length;
  const m = currentLabels.length;
  const dp = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const match = priorLabels[i] === currentLabels[j] && priorLabels[i].length > 0;
      dp[i][j] = match ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const pairs: { prior?: FilaEtiquetada; current?: FilaEtiquetada }[] = [];
  let i = 0;
  let j = 0;

  while (i < n || j < m) {
    if (i < n && j < m && priorLabels[i] === currentLabels[j] && priorLabels[i].length > 0) {
      pairs.push({ prior: priorFilas[i], current: currentFilas[j] });
      i++;
      j++;
    } else if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) {
      pairs.push({ prior: priorFilas[i] });
      i++;
    } else {
      pairs.push({ current: currentFilas[j] });
      j++;
    }
  }

  return pairs;
}

function filasEtiquetadasDeTabla(tabla: TablaMemoria, colIdx: number): FilaEtiquetada[] {
  const filas: FilaEtiquetada[] = [];

  for (const fila of tabla.filas) {
    if (esFilaCabeceraAnual(fila)) continue;
    const etiqueta = normalizarEtiquetaFila(fila[0] ?? "", tabla.cabecera);
    if (!etiqueta || etiqueta.length < 3) continue;
    const celda = fila[colIdx] ?? "";
    const valor = parseImporte(celda);
    const tieneValor = celdaImporteTieneValor(celda);
    if (!tieneValor) continue;

    filas.push({
      etiqueta,
      etiquetaDisplay: fila[0]?.trim() || etiqueta,
      valor,
      tieneValor,
      apartado: tabla.apartado,
      tablaTitulo: tabla.titulo,
      pagina: tabla.pagina,
    });
  }

  return filas;
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
    const col = encontrarColumnaEjercicio(tabla.cabecera, ejercicioObjetivo);
    if (col.indice === null) continue;

    for (const fila of tabla.filas) {
      if (esFilaCabeceraAnual(fila)) continue;
      const etiqueta = normalizarEtiquetaFila(fila[0] ?? "", tabla.cabecera);
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

  const priorPorApartado = new Map<string, FilaEtiquetada[]>();
  for (const tabla of tablasAnterior) {
    const col = encontrarColumnaEjercicio(tabla.cabecera, ejercicioAnterior);
    if (col.indice === null) continue;
    const ap = tabla.apartado?.replace(/\D/g, "").padStart(2, "0") ?? "";
    const filas = filasEtiquetadasDeTabla(tabla, col.indice);
    if (filas.length === 0) continue;
    priorPorApartado.set(ap, [...(priorPorApartado.get(ap) ?? []), ...filas]);
  }

  for (const tabla of tablasActual) {
    const col = encontrarColumnaEjercicio(tabla.cabecera, ejercicioAnterior);
    if (col.indice === null) continue;

    const apartado = tabla.apartado?.replace(/\D/g, "").padStart(2, "0") ?? "";
    const currentFilas = filasEtiquetadasDeTabla(tabla, col.indice);
    const priorFilas = priorPorApartado.get(apartado) ?? [];

    const pares = alinearFilasPorEtiqueta(priorFilas, currentFilas);

    for (const par of pares) {
      const { prior, current } = par;

      if (prior && !current) {
        const clave = claveFila(prior.apartado ?? tabla.apartado, prior.etiqueta);
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        descuadres.push({
          apartado: prior.apartado ?? tabla.apartado,
          filaEtiqueta: prior.etiquetaDisplay,
          ejercicioReferencia: ejercicioAnterior,
          valorMemoriaAnterior: prior.valor ?? 0,
          valorColumnaComparativa: 0,
          motivo: "falta_elemento",
          tablaTitulo: prior.tablaTitulo ?? tabla.titulo,
          pagina: prior.pagina ?? tabla.pagina,
        });
        continue;
      }

      if (!prior && current) {
        const clave = claveFila(current.apartado ?? tabla.apartado, current.etiqueta);
        vistos.add(clave);
        continue;
      }

      if (!prior || !current) continue;

      const clave = claveFila(tabla.apartado, current.etiqueta);
      if (vistos.has(clave)) continue;
      vistos.add(clave);

      const ref = referencia.get(clave);
      const valorComparativa = current.valor;
      const valorReferencia = ref?.valor ?? prior.valor;

      if (
        valorReferencia !== null &&
        valorComparativa !== null &&
        compareWithTolerance(valorComparativa, valorReferencia, tolerancia)
      ) {
        continue;
      }

      descuadres.push({
        apartado: tabla.apartado ?? ref?.apartado,
        filaEtiqueta: current.etiquetaDisplay,
        ejercicioReferencia: ejercicioAnterior,
        valorMemoriaAnterior: valorReferencia ?? 0,
        valorColumnaComparativa: valorComparativa ?? 0,
        motivo: "descuadre_cifra",
        tablaTitulo: tabla.titulo || ref?.tablaTitulo,
        pagina: tabla.pagina ?? ref?.pagina,
      });
    }
  }

  for (const [clave, ref] of referencia) {
    if (vistos.has(clave)) continue;
    descuadres.push({
      apartado: ref.apartado,
      filaEtiqueta: ref.filaEtiqueta,
      ejercicioReferencia: ejercicioAnterior,
      valorMemoriaAnterior: ref.valor ?? 0,
      valorColumnaComparativa: 0,
      motivo: "falta_elemento",
      tablaTitulo: ref.tablaTitulo,
      pagina: ref.pagina,
    });
  }

  return descuadres;
}
