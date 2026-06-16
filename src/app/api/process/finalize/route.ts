import { NextRequest, NextResponse } from "next/server";
import { finalizeExpedienteCore, type FinalizeInput } from "@/lib/process/expediente-core";
import { logger } from "@/lib/logger";

export const maxDuration = 300;
export const runtime = "nodejs";

const log = logger.child({ module: "api/process/finalize" });

export async function POST(request: NextRequest) {
  try {
    const input = (await request.json()) as FinalizeInput;

    if (!input.expedienteId || !input.archivos?.length) {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    }

    log.info("finalizando expediente", {
      expedienteId: input.expedienteId,
      archivoCount: input.archivos.length,
    });

    const result = finalizeExpedienteCore(input);
    return NextResponse.json(result);
  } catch (err) {
    log.error("finalize falló", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al validar" },
      { status: 500 }
    );
  }
}
