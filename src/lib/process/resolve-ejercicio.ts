import type { MemoriaNormalizada } from "@/types/domain";

export interface ResolveEjercicioInput {
  libroEjercicio?: number;
  memoriasEjercicios: number[];
  expedienteEjercicio?: number;
}

/** Año de referencia del expediente: libro de cierre → máximo detectado en memorias → dato manual. */
export function resolveEjercicioActual(input: ResolveEjercicioInput): number {
  const { libroEjercicio, memoriasEjercicios, expedienteEjercicio } = input;
  const maxMemoria =
    memoriasEjercicios.length > 0
      ? Math.max(...memoriasEjercicios.filter((y) => y > 0))
      : undefined;

  return libroEjercicio ?? maxMemoria ?? expedienteEjercicio ?? 0;
}

export interface AssignedMemorias {
  memoria?: MemoriaNormalizada;
  memoriaAnterior?: MemoriaNormalizada;
}

/**
 * Asigna memoria del ejercicio actual (objeto de análisis) y memoria anterior (solo comparación).
 */
export function assignMemorias(
  memorias: MemoriaNormalizada[],
  ejercicio: number
): AssignedMemorias {
  if (memorias.length === 0) return {};

  if (memorias.length === 1) {
    const m = memorias[0];
    const year = m.datosClave.ejercicio;
    if (year === ejercicio - 1) return { memoriaAnterior: m };
    return { memoria: m };
  }

  const ejercicioAnterior = ejercicio - 1;
  const memoria = memorias.find((m) => m.datosClave.ejercicio === ejercicio);
  const memoriaAnterior =
    memorias.find((m) => m.datosClave.ejercicio === ejercicioAnterior) ??
    memorias.find((m) => m.datosClave.ejercicio !== ejercicio);

  if (memoria) return { memoria, memoriaAnterior };

  const ordenadas = [...memorias].sort(
    (a, b) => (b.datosClave.ejercicio ?? 0) - (a.datosClave.ejercicio ?? 0)
  );
  return {
    memoria: ordenadas[0],
    memoriaAnterior: ordenadas.find((m) => m !== ordenadas[0]),
  };
}

export interface DocMeta {
  ejercicio?: number;
}

/** Resolución de documentos para la UI (DocumentsBlock). */
export function resolveDocumentYears(
  excelMeta: DocMeta,
  memoriasMeta: DocMeta[],
  expedienteEjercicio?: number
): { mainYear: number | undefined; priorYear: number | undefined } {
  const mainYear = resolveEjercicioActual({
    libroEjercicio: excelMeta.ejercicio,
    memoriasEjercicios: memoriasMeta.map((m) => m.ejercicio).filter((y): y is number => y !== undefined),
    expedienteEjercicio,
  });

  const validMain = mainYear > 0 ? mainYear : undefined;
  return {
    mainYear: validMain,
    priorYear: validMain !== undefined ? validMain - 1 : undefined,
  };
}
