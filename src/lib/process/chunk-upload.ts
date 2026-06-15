import { appendFile, mkdir, readdir, rename, rm, stat, writeFile } from "fs/promises";
import path from "path";

import { prisma } from "@/lib/db";
import { ensureUploadDir } from "@/lib/files";
import { logger } from "@/lib/logger";

import { classifyByExtension } from "./upload-files";

const log = logger.child({ module: "chunk-upload" });

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

function safeName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function chunkPaths(expedienteId: string, fileName: string) {
  const dir = path.join(UPLOADS_DIR, expedienteId, ".chunks");
  const key = safeName(fileName);
  return {
    dir,
    part: path.join(dir, `${key}.part`),
    meta: path.join(dir, `${key}.meta.json`),
  };
}

export async function receiveFileChunk(
  expedienteId: string,
  fileName: string,
  chunkIndex: number,
  totalChunks: number,
  chunk: File
): Promise<void> {
  const { dir, part, meta } = chunkPaths(expedienteId, fileName);
  await mkdir(dir, { recursive: true });

  const buffer = Buffer.from(await chunk.arrayBuffer());

  if (chunkIndex === 0) {
    await writeFile(part, buffer);
    await writeFile(meta, JSON.stringify({ fileName, totalChunks }));
  } else {
    await appendFile(part, buffer);
  }

  log.debug("chunk recibido", {
    expedienteId,
    fileName,
    chunkIndex,
    totalChunks,
    chunkBytes: buffer.length,
  });
}

export async function finalizeChunkedFile(expedienteId: string, fileName: string) {
  const expediente = await prisma.expediente.findUnique({ where: { id: expedienteId } });
  if (!expediente) {
    throw new Error("Expediente no encontrado");
  }

  const existing = await prisma.archivo.findFirst({
    where: { expedienteId, nombre: fileName },
  });
  if (existing) {
    await cleanupChunks(expedienteId, fileName);
    return existing;
  }

  const { dir, part } = chunkPaths(expedienteId, fileName);
  const uploadDir = await ensureUploadDir(expedienteId);
  const finalPath = path.join(uploadDir, `${Date.now()}-${safeName(fileName)}`);

  const fileStat = await stat(part);
  if (fileStat.size === 0) {
    throw new Error(`El archivo "${fileName}" llegó vacío`);
  }

  await rename(part, finalPath);
  await cleanupChunks(expedienteId, fileName);

  const tipo = classifyByExtension(fileName);

  const archivo = await prisma.archivo.create({
    data: {
      expedienteId,
      tipo,
      nombre: fileName,
      ruta: finalPath,
      metadata: JSON.stringify({
        size: fileStat.size,
        tipo,
        clasificacion: "extension",
        upload: "chunked",
      }),
    },
  });

  log.info("archivo ensamblado desde chunks", {
    expedienteId,
    fileName,
    sizeBytes: fileStat.size,
    archivoId: archivo.id,
  });

  return archivo;
}

async function cleanupChunks(expedienteId: string, fileName: string) {
  const { dir, part, meta } = chunkPaths(expedienteId, fileName);
  await rm(part, { force: true });
  await rm(meta, { force: true });
  try {
    const remaining = await readdir(dir);
    if (remaining.length === 0) {
      await rm(dir, { recursive: true, force: true });
    }
  } catch {
    // ignorar
  }
}
