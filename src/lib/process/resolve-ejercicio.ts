import type { MemoriaNormalizada } from "@/types/domain";

export interface ResolveEjercicioInput {
  libroEjercicio?: number;
  memoriasEjercicios: number[];
  expedienteEjercicio?: number;
}

/** Año de referencia del expediente: el más reciente entre libro, memorias y dato manual. */
export function resolveEjercicioActual(input: ResolveEjercicioInput): number {
  const { libroEjercicio, memoriasEjercicios, expedienteEjercicio } = input;
  const maxMemoria =
    memoriasEjercicios.length > 0
      ? Math.max(...memoriasEjercicios.filter((y) => y > 0))
      : undefined;

  const signals = [libroEjercicio, maxMemoria, expedienteEjercicio].filter(
    (y): y is number => y !== undefined && y > 0
  );
  if (signals.length === 0) return 0;
  return Math.max(...signals);
}

export interface AssignedMemorias {
  memoria?: MemoriaNormalizada;
  memoriaAnterior?: MemoriaNormalizada;
}

function memoriaYear(m: MemoriaNormalizada): number | undefined {
  const y = m.datosClave.ejercicio;
  return y !== undefined && y > 0 ? y : undefined;
}

function ensureChronologicalOrder(assigned: AssignedMemorias): AssignedMemorias {
  const { memoria, memoriaAnterior } = assigned;
  if (!memoria || !memoriaAnterior) return assigned;
  const yAct = memoriaYear(memoria);
  const yAnt = memoriaYear(memoriaAnterior);
  if (yAct !== undefined && yAnt !== undefined && yAct < yAnt) {
    return { memoria: memoriaAnterior, memoriaAnterior: memoria };
  }
  return assigned;
}

function assignByConsecutiveYears(memorias: MemoriaNormalizada[]): AssignedMemorias | undefined {
  const years = [
    ...new Set(memorias.map(memoriaYear).filter((y): y is number => y !== undefined)),
  ].sort((a, b) => b - a);
  if (years.length < 2 || years[0] !== years[1] + 1) return undefined;

  const memoria = memorias.find((m) => memoriaYear(m) === years[0]);
  const memoriaAnterior = memorias.find((m) => memoriaYear(m) === years[1]);
  if (!memoria) return undefined;
  return { memoria, memoriaAnterior };
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
    const year = memoriaYear(m);
    // Solo como anterior si el año detectado coincide con ejercicio-1 del libro
    if (year !== undefined && year === ejercicio - 1 && ejercicio > 0) {
      return { memoriaAnterior: m };
    }
    return { memoria: m };
  }

  const byYears = assignByConsecutiveYears(memorias);
  if (byYears) return byYears;

  const ejercicioAnterior = ejercicio - 1;
  const memoria = memorias.find((m) => memoriaYear(m) === ejercicio);
  const memoriaAnterior =
    memorias.find((m) => memoriaYear(m) === ejercicioAnterior) ??
    memorias.find((m) => memoriaYear(m) !== ejercicio);

  if (memoria) return ensureChronologicalOrder({ memoria, memoriaAnterior });

  const ordenadas = [...memorias].sort(
    (a, b) => (memoriaYear(b) ?? 0) - (memoriaYear(a) ?? 0)
  );
  return ensureChronologicalOrder({
    memoria: ordenadas[0],
    memoriaAnterior: ordenadas.find((m) => m !== ordenadas[0]),
  });
}

export interface DocMeta {
  ejercicio?: number;
  parseError?: string;
  erroresParseo?: string[];
}

export interface ArchivoMemoriaRef {
  id: string;
  nombre: string;
  meta: DocMeta;
}

/** Asigna archivos de memoria a los slots actual/anterior para la UI. */
export function assignMemoriaArchivos(
  memorias: ArchivoMemoriaRef[],
  mainYear: number | undefined,
  priorYear: number | undefined
): { principal?: ArchivoMemoriaRef; anterior?: ArchivoMemoriaRef } {
  if (!memorias.length) return {};

  if (memorias.length === 1) {
    const m = memorias[0];
    if (priorYear && m.meta.ejercicio === priorYear && m.meta.ejercicio !== mainYear) {
      return { anterior: m };
    }
    return { principal: m };
  }

  const metaYears = [
    ...new Set(
      memorias.map((m) => m.meta.ejercicio).filter((y): y is number => y !== undefined && y > 0)
    ),
  ].sort((a, b) => b - a);
  if (metaYears.length >= 2 && metaYears[0] === metaYears[1] + 1) {
    return {
      principal: memorias.find((m) => m.meta.ejercicio === metaYears[0]),
      anterior: memorias.find((m) => m.meta.ejercicio === metaYears[1]),
    };
  }

  const byYear = (y: number) => memorias.find((m) => m.meta.ejercicio === y);

  let principal = mainYear ? byYear(mainYear) : undefined;
  let anterior = priorYear ? byYear(priorYear) : undefined;

  const used = new Set([principal?.id, anterior?.id].filter(Boolean));
  const unassigned = memorias.filter((m) => !used.has(m.id));

  if (!principal && unassigned.length > 0) {
    const candidates = unassigned.filter(
      (m) => !(priorYear && m.meta.ejercicio === priorYear && unassigned.length > 1)
    );
    const pool = candidates.length > 0 ? candidates : unassigned;
    principal = [...pool].sort((a, b) => {
      const errA = a.meta.parseError ? 1 : 0;
      const errB = b.meta.parseError ? 1 : 0;
      if (errA !== errB) return errA - errB;
      return (b.meta.ejercicio ?? 0) - (a.meta.ejercicio ?? 0);
    })[0];
  }

  if (!anterior) {
    anterior = memorias.find(
      (m) =>
        m.id !== principal?.id &&
        (priorYear ? m.meta.ejercicio === priorYear || m.meta.ejercicio !== mainYear : true)
    );
    if (!anterior) {
      anterior = memorias.find((m) => m.id !== principal?.id);
    }
  }

  return { principal, anterior };
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
