import {
  finalizeExpedienteCore,
  parseSingleArchivo,
  type ParsedArchivoPayload,
  type ProcessOutput,
} from "@/lib/process/expediente-core";
import { toBuffer } from "@/lib/process/to-buffer";
import { getArchivoBlob } from "@/lib/storage/expediente-store";
import type { StoredArchivo, StoredReglaCustom } from "@/lib/storage/types";

async function parseArchivoLocal(
  archivo: StoredArchivo,
  onProgress?: (message: string) => void
): Promise<ParsedArchivoPayload> {
  const blob = await getArchivoBlob(archivo.id);
  if (!blob) throw new Error(`No se encontró el archivo «${archivo.nombre}» en el navegador`);

  const esMemoria = archivo.tipo === "memoria_word" || archivo.tipo === "memoria_pdf";
  if (esMemoria) {
    onProgress?.(`Memoria ${archivo.nombre}: iniciando lectura…`);
  } else {
    onProgress?.(`Analizando ${archivo.nombre}…`);
  }

  return parseSingleArchivo(
    {
      id: archivo.id,
      nombre: archivo.nombre,
      tipo: archivo.tipo,
      metadata: archivo.metadata,
      buffer: toBuffer(blob),
    },
    undefined,
    onProgress
  );
}

async function parseArchivosList(
  archivos: StoredArchivo[],
  onProgress?: (message: string) => void
): Promise<ParsedArchivoPayload[]> {
  const parsed: ParsedArchivoPayload[] = [];

  for (let i = 0; i < archivos.length; i++) {
    const archivo = archivos[i];
    onProgress?.(`Archivo ${i + 1}/${archivos.length}: ${archivo.nombre}`);
    parsed.push(await parseArchivoLocal(archivo, onProgress));
  }

  return parsed;
}

/** Procesa el expediente en el navegador (sin subir archivos al servidor). */
export async function processExpedienteLocal(input: {
  expedienteId: string;
  cliente: string;
  ejercicio: number;
  archivos: StoredArchivo[];
  reglasCustom: StoredReglaCustom[];
  priorYear?: { ejercicio: number; archivos: StoredArchivo[] };
  onProgress?: (message: string) => void;
}): Promise<ProcessOutput> {
  const parsedArchivos = await parseArchivosList(input.archivos, input.onProgress);

  let priorParsed: ParsedArchivoPayload[] | undefined;
  if (input.priorYear?.archivos.length) {
    input.onProgress?.("Leyendo memorias del ejercicio anterior…");
    priorParsed = await parseArchivosList(input.priorYear.archivos, input.onProgress);
  }

  input.onProgress?.("Comparando memorias y ejecutando validaciones…");

  return finalizeExpedienteCore({
    expedienteId: input.expedienteId,
    cliente: input.cliente,
    ejercicio: input.ejercicio,
    archivos: parsedArchivos,
    reglasCustom: input.reglasCustom,
    priorYear: priorParsed?.length
      ? { ejercicio: input.priorYear!.ejercicio, archivos: priorParsed }
      : undefined,
  });
}
