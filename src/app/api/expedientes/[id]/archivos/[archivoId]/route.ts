import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "api/archivo-download" });

function contentTypeForName(nombre: string): string {
  const ext = path.extname(nombre).toLowerCase();
  switch (ext) {
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".doc":
      return "application/msword";
    case ".rtf":
      return "application/rtf";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; archivoId: string }> }
) {
  const { id, archivoId } = await params;

  try {
    const archivo = await prisma.archivo.findFirst({
      where: { id: archivoId, expedienteId: id },
    });

    if (!archivo) {
      return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
    }

    const buffer = await readFile(archivo.ruta);
    const contentType = contentTypeForName(archivo.nombre);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(archivo.nombre)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    log.error("error sirviendo archivo", err, { expedienteId: id, archivoId });
    return NextResponse.json({ error: "No se pudo leer el archivo" }, { status: 500 });
  }
}
