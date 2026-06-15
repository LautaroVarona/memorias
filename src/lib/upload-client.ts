import { clientLogger, setUploadInProgress } from "@/lib/logger/client";
import { addArchivos, createExpediente } from "@/lib/storage/expediente-store";

const log = clientLogger.child({ module: "upload" });

export async function createExpedienteAndUpload(
  files: File[],
  onProgress?: (message: string) => void
): Promise<void> {
  if (!files.length) {
    throw new Error("No se enviaron archivos");
  }

  log.info("iniciando subida", {
    phase: "start",
    fileCount: files.length,
    totalBytes: files.reduce((s, f) => s + f.size, 0),
    files: files.map((f) => ({ name: f.name, sizeBytes: f.size })),
  });

  setUploadInProgress(true);

  try {
    onProgress?.("Creando expediente…");
    const expediente = await createExpediente();

    const sorted = [...files].sort((a, b) => a.size - b.size);
    for (let i = 0; i < sorted.length; i++) {
      const file = sorted[i];
      onProgress?.(`Guardando ${file.name} (${i + 1}/${sorted.length})…`);
      await addArchivos(expediente.id, [file]);
    }

    onProgress?.("Iniciando revisión…");
    log.info("subida completada", { phase: "done", expedienteId: expediente.id });
    window.location.assign(`/expedientes/${expediente.id}?process=1`);
  } finally {
    setUploadInProgress(false);
  }
}

export async function uploadToExpediente(
  expedienteId: string,
  files: File[],
  onProgress?: (message: string) => void
): Promise<void> {
  if (!files.length) {
    throw new Error("No se enviaron archivos");
  }

  setUploadInProgress(true);

  try {
    const sorted = [...files].sort((a, b) => a.size - b.size);

    for (let i = 0; i < sorted.length; i++) {
      const file = sorted[i];
      onProgress?.(`Guardando ${file.name} (${i + 1}/${sorted.length})…`);
      await addArchivos(expedienteId, [file]);
    }

    onProgress?.("Iniciando revisión…");
    window.location.assign(`/expedientes/${expedienteId}?process=1`);
  } finally {
    setUploadInProgress(false);
  }
}
