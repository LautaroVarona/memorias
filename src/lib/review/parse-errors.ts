import type { CaseData } from "@/types/case-data";
import type { TablaMemoria } from "@/types/domain";

export interface ParseErrorItem {
  id: string;
  source: "memoria_actual" | "memoria_anterior" | "archivo";
  documento: string;
  ejercicio?: number;
  mensaje: string;
  apartado?: string;
  tablaTitulo?: string;
  linea?: number;
  pagina?: number;
}

interface ArchivoMeta {
  id: string;
  nombre: string;
  tipo: string;
  metadata?: string;
}

function parseArchivoMeta(metadata?: string): {
  parseError?: string;
  erroresParseo?: string[];
  ejercicio?: number;
} {
  if (!metadata) return {};
  try {
    return JSON.parse(metadata) as {
      parseError?: string;
      erroresParseo?: string[];
      ejercicio?: number;
    };
  } catch {
    return {};
  }
}

function erroresDesdeTablas(
  tablas: TablaMemoria[],
  documento: string,
  ejercicio: number | undefined,
  source: ParseErrorItem["source"]
): ParseErrorItem[] {
  const items: ParseErrorItem[] = [];
  for (const tabla of tablas) {
    if (!tabla.tabla_rota || !tabla.errorParseo) continue;
    items.push({
      id: `${source}-tabla-${tabla.linea}-${items.length}`,
      source,
      documento,
      ejercicio,
      mensaje: tabla.errorParseo,
      apartado: tabla.apartado,
      tablaTitulo: tabla.titulo || undefined,
      linea: tabla.linea,
      pagina: tabla.pagina,
    });
  }
  return items;
}

function erroresDesdeMetadata(
  errores: string[] | undefined,
  documento: string,
  ejercicio: number | undefined,
  source: ParseErrorItem["source"]
): ParseErrorItem[] {
  if (!errores?.length) return [];
  return errores.map((mensaje, idx) => ({
    id: `${source}-meta-${idx}`,
    source,
    documento,
    ejercicio,
    mensaje,
  }));
}

/** Agrupa todos los errores de parseo del expediente (memorias + metadatos de archivo). */
export function collectParseErrors(
  caseData?: CaseData | null,
  archivos?: ArchivoMeta[]
): ParseErrorItem[] {
  const items: ParseErrorItem[] = [];
  const vistos = new Set<string>();

  const push = (item: ParseErrorItem) => {
    const key = `${item.documento}|${item.mensaje}|${item.linea ?? ""}`;
    if (vistos.has(key)) return;
    vistos.add(key);
    items.push(item);
  };

  if (caseData?.memory) {
    const doc = caseData.memory.metadata?.archivo ?? "Memoria actual";
    const ej = caseData.memory.keyData?.ejercicio ?? caseData.metadata.ejercicio;

    for (const e of erroresDesdeMetadata(
      caseData.memory.metadata?.erroresParseo,
      doc,
      ej,
      "memoria_actual"
    )) {
      push(e);
    }
    for (const e of erroresDesdeTablas(
      caseData.memory.tables ?? [],
      doc,
      ej,
      "memoria_actual"
    )) {
      push(e);
    }
  }

  if (caseData?.priorYear?.memory) {
    const py = caseData.priorYear.memory;
    const doc =
      py.metadata?.archivo ??
      archivos?.find((a) => a.tipo === "memoria_word" || a.tipo === "memoria_pdf")?.nombre ??
      "Memoria ejercicio anterior";
    const ej = py.keyData?.ejercicio ?? caseData.priorYear.ejercicio;

    for (const e of erroresDesdeMetadata(py.metadata?.erroresParseo, doc, ej, "memoria_anterior")) {
      push(e);
    }
    for (const e of erroresDesdeTablas(py.tables ?? [], doc, ej, "memoria_anterior")) {
      push(e);
    }
  }

  if (archivos) {
    for (const archivo of archivos) {
      if (archivo.tipo !== "memoria_word" && archivo.tipo !== "memoria_pdf") continue;
      const meta = parseArchivoMeta(archivo.metadata);
      if (meta.parseError) {
        push({
          id: `archivo-${archivo.id}`,
          source: "archivo",
          documento: archivo.nombre,
          ejercicio: meta.ejercicio,
          mensaje: meta.parseError,
        });
      }
      for (const e of erroresDesdeMetadata(
        meta.erroresParseo,
        archivo.nombre,
        meta.ejercicio,
        "archivo"
      )) {
        push(e);
      }
    }
  }

  return items;
}

export function sourceLabel(source: ParseErrorItem["source"]): string {
  switch (source) {
    case "memoria_actual":
      return "Memoria actual";
    case "memoria_anterior":
      return "Memoria anterior";
    default:
      return "Archivo";
  }
}
