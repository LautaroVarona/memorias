import type { ParsedArchivoPayload, ProcessOutput } from "@/lib/process/expediente-core";
import { getArchivoBlob } from "@/lib/storage/expediente-store";
import type { StoredArchivo, StoredReglaCustom } from "@/lib/storage/types";

/** Vercel limita el body de cada request a ~4,5 MB; dejamos margen para el multipart. */
const VERCEL_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024;
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const MAX_FILE_BYTES = VERCEL_BODY_LIMIT_BYTES - MULTIPART_OVERHEAD_BYTES;

async function parseArchivoRemote(archivo: StoredArchivo, blob: ArrayBuffer): Promise<ParsedArchivoPayload> {
  if (blob.byteLength > MAX_FILE_BYTES) {
    throw new Error(
      `«${archivo.nombre}» pesa ${(blob.byteLength / 1024 / 1024).toFixed(1)} MB. ` +
        "Vercel no admite archivos mayores a ~4,5 MB por petición. Comprima el archivo o revíselo en local (npm run dev)."
    );
  }

  const formData = new FormData();
  formData.append(
    "metadata",
    JSON.stringify({
      id: archivo.id,
      nombre: archivo.nombre,
      tipo: archivo.tipo,
      metadata: archivo.metadata,
    })
  );
  formData.append("file", new File([blob], archivo.nombre));

  const response = await fetch("/api/process/parse", { method: "POST", body: formData });
  const data = (await response.json().catch(() => ({}))) as ParsedArchivoPayload & { error?: string };

  if (response.status === 413) {
    throw new Error(
      `«${archivo.nombre}» supera el límite de Vercel (~4,5 MB por petición). ` +
        "Pruebe en local o reduzca el tamaño del archivo."
    );
  }
  if (!response.ok) {
    throw new Error(data.error || `Error al procesar «${archivo.nombre}»`);
  }

  return data;
}

async function parseArchivosList(
  archivos: StoredArchivo[],
  onProgress?: (message: string) => void
): Promise<ParsedArchivoPayload[]> {
  const parsed: ParsedArchivoPayload[] = [];

  for (let i = 0; i < archivos.length; i++) {
    const archivo = archivos[i];
    onProgress?.(`Analizando ${archivo.nombre} (${i + 1}/${archivos.length})…`);

    const blob = await getArchivoBlob(archivo.id);
    if (!blob) throw new Error(`No se encontró el archivo «${archivo.nombre}» en el navegador`);

    parsed.push(await parseArchivoRemote(archivo, blob));
  }

  return parsed;
}

export async function processExpedienteRemote(input: {
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
    input.onProgress?.("Analizando ejercicio anterior…");
    priorParsed = await parseArchivosList(input.priorYear.archivos, input.onProgress);
  }

  input.onProgress?.("Ejecutando validaciones…");

  const response = await fetch("/api/process/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      expedienteId: input.expedienteId,
      cliente: input.cliente,
      ejercicio: input.ejercicio,
      archivos: parsedArchivos,
      reglasCustom: input.reglasCustom,
      priorYear: priorParsed?.length
        ? { ejercicio: input.priorYear!.ejercicio, archivos: priorParsed }
        : undefined,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as ProcessOutput & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Error al validar expediente");
  }

  return data;
}
