import { appendFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "fs/promises";
import path from "path";

import { prisma } from "@/lib/db";
import { ensureUploadDir } from "@/lib/files";
import {
  fileFingerprint,
  resolveUniqueDisplayName,
} from "@/lib/files/file-identity";
import { logger } from "@/lib/logger";

import { classifyByExtension } from "./upload-files";

const log = logger.child({ module: "chunk-upload" });

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

function safeName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function chunkPaths(expedienteId: string, uploadKey: string) {
  const dir = path.join(UPLOADS_DIR, expedienteId, ".chunks");
  const key = safeName(uploadKey);
  return {
    dir,
    part: path.join(dir, `${key}.part`),
    meta: path.join(dir, `${key}.meta.json`),
  };
}

interface ChunkMeta {
  fileName: string;
  displayName?: string;
  uploadKey: string;
  totalChunks: number;
  fingerprint?: string;
  size?: number;
  lastModified?: number;
}

export async function receiveFileChunk(
  expedienteId: string,
  fileName: string,
  chunkIndex: number,
  totalChunks: number,
  chunk: File,
  uploadKey?: string,
  fileMeta?: { size: number; lastModified: number }
): Promise<void> {
  const key = uploadKey ?? safeName(fileName);
  const { dir, part, meta } = chunkPaths(expedienteId, key);
  await mkdir(dir, { recursive: true });

  const buffer = Buffer.from(await chunk.arrayBuffer());

  if (chunkIndex === 0) {
    await writeFile(part, buffer);
    const chunkMeta: ChunkMeta = {
      fileName,
      uploadKey: key,
      totalChunks,
      ...(fileMeta
        ? {
            size: fileMeta.size,
            lastModified: fileMeta.lastModified,
            fingerprint: fileFingerprint(fileName, fileMeta.size, fileMeta.lastModified),
          }
        : {}),
    };
    await writeFile(meta, JSON.stringify(chunkMeta));
  } else {
    await appendFile(part, buffer);
  }

  log.debug("chunk recibido", {
    expedienteId,
    fileName,
    uploadKey: key,
    chunkIndex,
    totalChunks,
    chunkBytes: buffer.length,
  });
}

export async function finalizeChunkedFile(
  expedienteId: string,
  fileName: string,
  uploadKey?: string,
  fileMeta?: { size: number; lastModified: number }
) {
  const expediente = await prisma.expediente.findUnique({ where: { id: expedienteId } });
  if (!expediente) {
    throw new Error("Expediente no encontrado");
  }

  const key = uploadKey ?? safeName(fileName);
  const { part, meta: metaPath } = chunkPaths(expedienteId, key);
  const uploadDir = await ensureUploadDir(expedienteId);

  let chunkMeta: ChunkMeta = { fileName, uploadKey: key, totalChunks: 1 };
  try {
    chunkMeta = JSON.parse(await readFile(metaPath, "utf8")) as ChunkMeta;
  } catch {
    // meta ausente: continuar con valores mínimos
  }

  const fingerprint =
    chunkMeta.fingerprint ??
    (fileMeta
      ? `${fileName}|${fileMeta.size}|${fileMeta.lastModified}`
      : undefined);

  const existingArchivos = await prisma.archivo.findMany({
    where: { expedienteId },
    select: { id: true, nombre: true, metadata: true },
  });

  if (fingerprint) {
    const duplicate = existingArchivos.find((a) => {
      try {
        const parsed = JSON.parse(a.metadata) as { fingerprint?: string };
        return parsed.fingerprint === fingerprint;
      } catch {
        return false;
      }
    });
    if (duplicate) {
      await cleanupChunks(expedienteId, key);
      return duplicate;
    }
  }

  const takenNames = new Set(existingArchivos.map((a) => a.nombre));
  const pseudoFile = {
    name: fileName,
    size: fileMeta?.size ?? chunkMeta.size ?? 0,
    lastModified: fileMeta?.lastModified ?? chunkMeta.lastModified ?? Date.now(),
    webkitRelativePath: "",
  } as File;
  const displayName =
    chunkMeta.displayName ?? resolveUniqueDisplayName(pseudoFile, takenNames);
  const finalPath = path.join(uploadDir, `${Date.now()}-${safeName(displayName)}`);

  const fileStat = await stat(part);
  if (fileStat.size === 0) {
    throw new Error(`El archivo "${fileName}" llegó vacío`);
  }

  await rename(part, finalPath);
  await cleanupChunks(expedienteId, key);

  const tipo = classifyByExtension(fileName);

  const archivo = await prisma.archivo.create({
    data: {
      expedienteId,
      tipo,
      nombre: displayName,
      ruta: finalPath,
      metadata: JSON.stringify({
        size: fileStat.size,
        lastModified: pseudoFile.lastModified,
        fingerprint:
          fingerprint ??
          fileFingerprint(fileName, fileStat.size, pseudoFile.lastModified),
        originalName: fileName,
        tipo,
        clasificacion: "extension",
        upload: "chunked",
      }),
    },
  });

  log.info("archivo ensamblado desde chunks", {
    expedienteId,
    fileName,
    displayName,
    sizeBytes: fileStat.size,
    archivoId: archivo.id,
  });

  return archivo;
}

async function cleanupChunks(expedienteId: string, uploadKey: string) {
  const { dir, part, meta } = chunkPaths(expedienteId, uploadKey);
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
