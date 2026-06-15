import { clientLogger, setUploadInProgress } from "@/lib/logger/client";

const log = clientLogger.child({ module: "upload" });

const CHUNK_SIZE = 256 * 1024;
const DIRECT_MAX_BYTES = 800 * 1024;
const DEV_QUIET_MS = 1200;
const CHUNK_GAP_MS = 80;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDevQuiet() {
  if (process.env.NODE_ENV === "production") return;
  await delay(DEV_QUIET_MS);
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    throw new Error(
      err instanceof Error && err.message.includes("fetch")
        ? "Error de conexión. Si está en desarrollo, espere a que termine Fast Refresh e intente de nuevo."
        : "Error de conexión. Compruebe que el servidor está en marcha."
    );
  }

  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Error en la solicitud");
  }
  return data;
}

async function prewarmRoutes(expedienteId: string) {
  await Promise.allSettled([
    fetch(`/api/expedientes/${expedienteId}/files`),
    fetch(`/api/expedientes/${expedienteId}/files/chunk`),
  ]);
  await waitForDevQuiet();
}

async function uploadFileDirect(expedienteId: string, file: File): Promise<void> {
  const formData = new FormData();
  formData.append("files", file);

  const response = await fetch(`/api/expedientes/${expedienteId}/files?api=1`, {
    method: "POST",
    body: formData,
  });

  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Error al subir "${file.name}"`);
  }
}

async function uploadFileChunked(
  expedienteId: string,
  file: File,
  onProgress?: (message: string) => void
): Promise<void> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  log.info("subida por chunks", {
    expedienteId,
    fileName: file.name,
    sizeBytes: file.size,
    totalChunks,
    chunkSize: CHUNK_SIZE,
  });

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const blob = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));

    const formData = new FormData();
    formData.append("fileName", file.name);
    formData.append("chunkIndex", String(i));
    formData.append("totalChunks", String(totalChunks));
    formData.append("chunk", blob, `${file.name}.part`);

    onProgress?.(`Subiendo ${file.name} (${i + 1}/${totalChunks} fragmentos)…`);

    let response: Response;
    try {
      response = await fetch(`/api/expedientes/${expedienteId}/files/chunk`, {
        method: "POST",
        body: formData,
      });
    } catch {
      throw new Error(
        `Conexión interrumpida al subir "${file.name}". En desarrollo, no recargue la página durante la subida.`
      );
    }

    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      throw new Error(data.error || `Error al subir "${file.name}" (fragmento ${i + 1})`);
    }

    if (i < totalChunks - 1) {
      await delay(CHUNK_GAP_MS);
    }
  }
}

async function uploadFile(
  expedienteId: string,
  file: File,
  onProgress?: (message: string) => void
): Promise<void> {
  if (file.size <= DIRECT_MAX_BYTES) {
    await uploadFileDirect(expedienteId, file);
    return;
  }
  await uploadFileChunked(expedienteId, file, onProgress);
}

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
    const { id } = await fetchJson<{ id: string }>("/api/expedientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    onProgress?.("Preparando subida…");
    await prewarmRoutes(id);

    const sorted = [...files].sort((a, b) => a.size - b.size);

    for (let i = 0; i < sorted.length; i++) {
      const file = sorted[i];
      onProgress?.(`Subiendo ${file.name} (${i + 1}/${sorted.length})…`);
      await uploadFile(id, file, onProgress);
      if (i < sorted.length - 1) {
        await delay(200);
      }
    }

    onProgress?.("Iniciando revisión…");
    log.info("subida completada", { phase: "done", expedienteId: id });
    window.location.assign(`/expedientes/${id}?process=1`);
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
    onProgress?.("Preparando subida…");
    await prewarmRoutes(expedienteId);

    const sorted = [...files].sort((a, b) => a.size - b.size);

    for (let i = 0; i < sorted.length; i++) {
      const file = sorted[i];
      onProgress?.(`Subiendo ${file.name} (${i + 1}/${sorted.length})…`);
      await uploadFile(expedienteId, file, onProgress);
      if (i < sorted.length - 1) {
        await delay(200);
      }
    }

    onProgress?.("Iniciando revisión…");
    window.location.assign(`/expedientes/${expedienteId}?process=1`);
  } finally {
    setUploadInProgress(false);
  }
}
