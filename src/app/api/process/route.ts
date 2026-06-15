import { NextRequest, NextResponse } from "next/server";
import {
  processExpedienteCore,
  type ArchivoInput,
  type ProcessInput,
  type ReglaCustomInput,
} from "@/lib/process/expediente-core";
import { logger } from "@/lib/logger";

export const maxDuration = 300;
export const runtime = "nodejs";

const log = logger.child({ module: "api/process" });

interface ProcessPayload {
  expedienteId: string;
  cliente: string;
  ejercicio: number;
  archivos: { id: string; nombre: string; tipo: string; metadata?: string }[];
  reglasCustom: ReglaCustomInput[];
  priorYear?: {
    ejercicio: number;
    archivos: { nombre: string; tipo: string }[];
  };
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const formData = await request.formData();
    const payloadRaw = formData.get("payload");
    if (!payloadRaw || typeof payloadRaw !== "string") {
      return NextResponse.json({ error: "Falta el campo payload" }, { status: 400 });
    }

    const payload = JSON.parse(payloadRaw) as ProcessPayload;
    const files = formData.getAll("files") as File[];

    if (!payload.expedienteId || !payload.archivos?.length) {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    }

    if (files.length < payload.archivos.length) {
      return NextResponse.json(
        { error: "Faltan archivos en la petición" },
        { status: 400 }
      );
    }

    const archivos: ArchivoInput[] = [];
    for (let i = 0; i < payload.archivos.length; i++) {
      const meta = payload.archivos[i];
      const file = files[i];
      const buffer = Buffer.from(await file.arrayBuffer());
      archivos.push({
        id: meta.id,
        nombre: meta.nombre,
        tipo: meta.tipo,
        metadata: meta.metadata,
        buffer,
      });
    }

    let priorArchivos: ArchivoInput[] | undefined;
    if (payload.priorYear?.archivos.length) {
      const offset = payload.archivos.length;
      priorArchivos = [];
      for (let i = 0; i < payload.priorYear.archivos.length; i++) {
        const meta = payload.priorYear.archivos[i];
        const file = files[offset + i];
        if (!file) break;
        const buffer = Buffer.from(await file.arrayBuffer());
        priorArchivos.push({
          id: `prior-${i}`,
          nombre: meta.nombre,
          tipo: meta.tipo,
          buffer,
        });
      }
    }

    const input: ProcessInput = {
      expedienteId: payload.expedienteId,
      cliente: payload.cliente,
      ejercicio: payload.ejercicio,
      archivos,
      reglasCustom: payload.reglasCustom ?? [],
      priorYear: priorArchivos?.length
        ? { ejercicio: payload.priorYear!.ejercicio, archivos: priorArchivos }
        : undefined,
    };

    log.info("procesando expediente (stateless)", {
      expedienteId: payload.expedienteId,
      archivoCount: archivos.length,
      priorCount: priorArchivos?.length ?? 0,
    });

    const result = await processExpedienteCore(input);

    log.info("procesamiento completado", {
      expedienteId: payload.expedienteId,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(result);
  } catch (err) {
    log.error("procesamiento falló", err, { durationMs: Date.now() - startedAt });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al procesar" },
      { status: 500 }
    );
  }
}
