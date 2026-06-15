import path from "path";
import { prisma } from "@/lib/db";
import { saveUploadedWebFile } from "@/lib/files";
import { logger } from "@/lib/logger";
import type { TipoArchivo } from "@/types/domain";

const log = logger.child({ module: "upload-files" });

/** Clasificación rápida por extensión — sin parsers pesados (se refinan al procesar). */
export function classifyByExtension(fileName: string): TipoArchivo {
  const ext = path.extname(fileName).toLowerCase();
  if ([".doc", ".docx", ".rtf"].includes(ext)) return "memoria_word";
  if (ext === ".pdf") return "memoria_pdf";
  if (ext === ".xlsm") return "excel_cierre";
  if ([".xlsx", ".xls"].includes(ext)) return "excel_balance";
  throw new Error(`Tipo de archivo no soportado: ${ext || fileName}`);
}

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

  for (const file of files) {
    if (!file.size) {
      log.warn("archivo vacío omitido", { expedienteId, fileName: file.name });
      continue;
    }

    const existing = await prisma.archivo.findFirst({
      where: { expedienteId, nombre: file.name },
    });
    if (existing) {
      log.info("archivo duplicado, se reutiliza registro existente", {
        expedienteId,
        fileName: file.name,
        archivoId: existing.id,
      });
      uploaded.push(existing);
      continue;
    }

    const tipo = classifyByExtension(file.name);
    const saveStarted = Date.now();

    try {
      const { path: ruta, size } = await saveUploadedWebFile(expedienteId, file.name, file);

      const archivo = await prisma.archivo.create({
        data: {
          expedienteId,
          tipo,
          nombre: file.name,
          ruta,
          metadata: JSON.stringify({ size, tipo, clasificacion: "extension" }),
        },
      });

      log.info("archivo guardado en disco y registrado", {
        expedienteId,
        fileName: file.name,
        tipo,
        sizeBytes: size,
        ruta,
        archivoId: archivo.id,
        durationMs: Date.now() - saveStarted,
      });

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
