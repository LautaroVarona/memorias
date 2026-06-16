import { NextRequest, NextResponse } from "next/server";
import { parseSingleArchivo } from "@/lib/process/expediente-core";
import { logger } from "@/lib/logger";

export const maxDuration = 300;
export const runtime = "nodejs";

const log = logger.child({ module: "api/process/parse" });

interface ParseMetadata {
  id: string;
  nombre: string;
  tipo: string;
  metadata?: string;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const metadataRaw = formData.get("metadata");

    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
    }
    if (!metadataRaw || typeof metadataRaw !== "string") {
      return NextResponse.json({ error: "Falta metadata" }, { status: 400 });
    }

    const metadata = JSON.parse(metadataRaw) as ParseMetadata;
    const buffer = Buffer.from(await file.arrayBuffer());

    log.info("parseando archivo", {
      archivoId: metadata.id,
      fileName: metadata.nombre,
      sizeBytes: buffer.length,
    });

    const parsed = await parseSingleArchivo({
      id: metadata.id,
      nombre: metadata.nombre,
      tipo: metadata.tipo,
      metadata: metadata.metadata,
      buffer,
    });

    return NextResponse.json(parsed);
  } catch (err) {
    log.error("parse falló", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al parsear archivo" },
      { status: 500 }
    );
  }
}
