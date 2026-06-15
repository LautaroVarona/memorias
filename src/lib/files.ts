import { createWriteStream } from "fs";
import { mkdir, rm } from "fs/promises";
import { pipeline } from "stream/promises";
import path from "path";
import { Readable } from "stream";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export async function ensureUploadDir(expedienteId: string): Promise<string> {
  const dir = path.join(UPLOADS_DIR, expedienteId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function saveUploadedFile(
  expedienteId: string,
  fileName: string,
  buffer: Buffer
): Promise<string> {
  const dir = await ensureUploadDir(expedienteId);
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = path.join(dir, `${Date.now()}-${safeName}`);
  await pipeline(Readable.from(buffer), createWriteStream(filePath));
  return filePath;
}

/** Guarda un File del navegador por streaming (sin cargar todo en RAM). */
export async function saveUploadedWebFile(
  expedienteId: string,
  fileName: string,
  file: File
): Promise<{ path: string; size: number }> {
  const dir = await ensureUploadDir(expedienteId);
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = path.join(dir, `${Date.now()}-${safeName}`);
  await pipeline(
    Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(filePath)
  );
  return { path: filePath, size: file.size };
}

/** Elimina la carpeta de subidas de un expediente (ignora si no existe). */
export async function deleteUploadDir(expedienteId: string): Promise<void> {
  const dir = path.join(UPLOADS_DIR, expedienteId);
  await rm(dir, { recursive: true, force: true });
}
