import {
  assignMemoriaArchivos,
  resolveDocumentYears,
  type DocMeta,
} from "@/lib/process/resolve-ejercicio";

export interface ArchivoDocRef {
  id: string;
  nombre: string;
  tipo: string;
  metadata?: string;
}

function parseMeta(metadata?: string): DocMeta {
  if (!metadata) return {};
  try {
    return JSON.parse(metadata) as DocMeta;
  } catch {
    return {};
  }
}

/** Archivo Word/PDF de la memoria del ejercicio en revisión. */
export function resolveMemoriaPrincipalArchivo(
  archivos: ArchivoDocRef[],
  expedienteEjercicio?: number
): ArchivoDocRef | undefined {
  const excel = archivos.find((a) => a.tipo === "excel_cierre" || a.tipo.startsWith("excel"));
  const excelMeta = parseMeta(excel?.metadata);
  const memorias = archivos.filter((a) => a.tipo === "memoria_word" || a.tipo === "memoria_pdf");
  if (!memorias.length) return undefined;

  const memoriasConMeta = memorias.map((m) => ({ ...m, meta: parseMeta(m.metadata) }));
  const { mainYear, priorYear } = resolveDocumentYears(
    excelMeta,
    memoriasConMeta.map((m) => m.meta),
    expedienteEjercicio
  );

  const refs = memoriasConMeta.map((m) => ({ id: m.id, nombre: m.nombre, meta: m.meta }));
  const { principal } = assignMemoriaArchivos(refs, mainYear, priorYear);
  if (!principal) return undefined;
  return memorias.find((m) => m.id === principal.id);
}
