import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

import { uploadFilesToExpediente } from "@/lib/process/upload-files";

export const maxDuration = 300;

const log = logger.child({ module: "api/files" });

function redirect(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

/** Lista ligera de archivos (para verificar subidas sin cargar todo el expediente). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();
  const { id } = await params;
  const verify = request.nextUrl.searchParams.has("verify");

  const archivos = await prisma.archivo.findMany({
    where: { expedienteId: id },
    select: { nombre: true },
    orderBy: { id: "asc" },
  });

  if (verify) {
    log.debug("listado de archivos (verificación cliente)", {
      expedienteId: id,
      count: archivos.length,
      durationMs: Date.now() - startedAt,
    });
  }

  return NextResponse.json(archivos);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();
  const { id } = await params;
  const apiMode = new URL(request.url).searchParams.get("api") === "1";

  log.info("POST /files iniciado", { expedienteId: id, apiMode });

  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    await uploadFilesToExpediente(id, files);

    log.info("POST /files completado", {
      expedienteId: id,
      apiMode,
      durationMs: Date.now() - startedAt,
    });

    if (apiMode) {
      return NextResponse.json({ ok: true });
    }

    return redirect(request, `/expedientes/${id}?process=1`);
  } catch (err) {
    log.error("POST /files falló", err, {
      expedienteId: id,
      apiMode,
      durationMs: Date.now() - startedAt,
    });
    const message = err instanceof Error ? err.message : "Error al subir archivos";

    if (apiMode) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return redirect(request, `/expedientes/${id}?error=${encodeURIComponent(message)}`);
  }
}
