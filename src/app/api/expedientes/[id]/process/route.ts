import { NextRequest, NextResponse } from "next/server";
import { processExpediente } from "@/lib/process/expediente";
import { logger } from "@/lib/logger";

export const maxDuration = 300;

const log = logger.child({ module: "api/process" });

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();
  const { id } = await params;

  log.info("iniciando procesamiento de expediente", { expedienteId: id });

  try {
    const result = await processExpediente(id);
    log.info("procesamiento completado", {
      expedienteId: id,
      tipoEmpresa: result.tipoEmpresa,
      resumen: result.resumen,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error("procesamiento falló", err, {
      expedienteId: id,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al procesar" },
      { status: 500 }
    );
  }
}
