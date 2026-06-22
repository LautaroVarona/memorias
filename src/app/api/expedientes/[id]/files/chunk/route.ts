import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { finalizeChunkedFile, receiveFileChunk } from "@/lib/process/chunk-upload";

export const maxDuration = 300;

const log = logger.child({ module: "api/files-chunk" });

/** Precalienta la ruta en desarrollo. */
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const formData = await request.formData();
    const fileName = String(formData.get("fileName") ?? "");
    const uploadKey = String(formData.get("uploadKey") ?? "").trim() || undefined;
    const chunkIndex = parseInt(String(formData.get("chunkIndex") ?? ""), 10);
    const totalChunks = parseInt(String(formData.get("totalChunks") ?? ""), 10);
    const fileSize = parseInt(String(formData.get("fileSize") ?? ""), 10);
    const lastModified = parseInt(String(formData.get("lastModified") ?? ""), 10);
    const chunk = formData.get("chunk") as File | null;
    const fileMeta =
      Number.isFinite(fileSize) && Number.isFinite(lastModified)
        ? { size: fileSize, lastModified }
        : undefined;

    if (!fileName || !chunk || Number.isNaN(chunkIndex) || Number.isNaN(totalChunks)) {
      return NextResponse.json({ error: "Datos de chunk inválidos" }, { status: 400 });
    }

    await receiveFileChunk(
      id,
      fileName,
      chunkIndex,
      totalChunks,
      chunk,
      uploadKey,
      fileMeta
    );

    const isLast = chunkIndex === totalChunks - 1;
    if (isLast) {
      await finalizeChunkedFile(id, fileName, uploadKey, fileMeta);
      log.info("chunk upload completado", { expedienteId: id, fileName, totalChunks });
    }

    return NextResponse.json({ ok: true, chunkIndex, done: isLast });
  } catch (err) {
    log.error("chunk upload falló", err, { expedienteId: id });
    const message = err instanceof Error ? err.message : "Error al subir chunk";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
