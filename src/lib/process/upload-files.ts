import { prisma } from "@/lib/db";
import { saveUploadedWebFile } from "@/lib/files";
import {
  buildUploadMeta,
  fingerprintFromFile,
  matchesStoredFile,
  resolveUniqueDisplayName,
} from "@/lib/files/file-identity";
import { classifyByExtension } from "@/lib/process/classify-extension";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "upload-files" });

export { classifyByExtension };

export async function uploadFilesToExpediente(expedienteId: string, files: File[]) {
  const startedAt = Date.now();

  if (!files.length) {
    throw new Error("No se enviaron archivos");
  }

  log.info("recibida petición de subida", {
    expedienteId,
    fileCount: files.length,
    files: files.map((f) => ({ name: f.name, sizeBytes: f.size })),
  });

  const expediente = await prisma.expediente.findUnique({ where: { id: expedienteId } });
  if (!expediente) {
    log.warn("expediente no encontrado", { expedienteId });
    throw new Error("Expediente no encontrado");
  }

  const uploaded = [];
  const existingArchivos = await prisma.archivo.findMany({
    where: { expedienteId },
    select: { id: true, nombre: true, metadata: true },
  });
  const takenNames = new Set(existingArchivos.map((a) => a.nombre));

  for (const file of files) {
    if (!file.size) {
      log.warn("archivo vacío omitido", { expedienteId, fileName: file.name });
      continue;
    }

    const duplicate = existingArchivos.find((a) => matchesStoredFile(a.metadata, file));
    if (duplicate) {
      log.info("archivo idéntico, se reutiliza registro existente", {
        expedienteId,
        fileName: file.name,
        archivoId: duplicate.id,
        fingerprint: fingerprintFromFile(file),
      });
      uploaded.push(duplicate);
      continue;
    }

    const displayName = resolveUniqueDisplayName(file, takenNames);
    takenNames.add(displayName);
    const tipo = classifyByExtension(file.name);
    const saveStarted = Date.now();

    try {
      const { path: ruta, size } = await saveUploadedWebFile(expedienteId, displayName, file);
      const uploadMeta = buildUploadMeta(file);

      const archivo = await prisma.archivo.create({
        data: {
          expedienteId,
          tipo,
          nombre: displayName,
          ruta,
          metadata: JSON.stringify({
            ...uploadMeta,
            size,
            tipo,
            clasificacion: "extension",
          }),
        },
      });

      log.info("archivo guardado en disco y registrado", {
        expedienteId,
        fileName: file.name,
        displayName,
        tipo,
        sizeBytes: size,
        ruta,
        archivoId: archivo.id,
        durationMs: Date.now() - saveStarted,
      });

      existingArchivos.push({ id: archivo.id, nombre: archivo.nombre, metadata: archivo.metadata });
      uploaded.push(archivo);
    } catch (err) {
      log.error("error al guardar archivo", err, {
        expedienteId,
        fileName: file.name,
        tipo,
        sizeBytes: file.size,
        durationMs: Date.now() - saveStarted,
      });
      throw err;
    }
  }

  if (!uploaded.length) {
    throw new Error("No se enviaron archivos");
  }

  log.info("subida completada", {
    expedienteId,
    uploadedCount: uploaded.length,
    durationMs: Date.now() - startedAt,
  });

  return uploaded;
}
