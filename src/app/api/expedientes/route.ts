import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createExpedienteFromFormUpload } from "@/lib/expediente-upload";
import { logger } from "@/lib/logger";

export const maxDuration = 300;

const log = logger.child({ module: "api/expedientes" });

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cliente = searchParams.get("cliente");
  const ejercicio = searchParams.get("ejercicio");
  const estado = searchParams.get("estado");

  const expedientes = await prisma.expediente.findMany({
    where: {
      ...(cliente ? { cliente: { contains: cliente } } : {}),
      ...(ejercicio ? { ejercicio: parseInt(ejercicio) } : {}),
      ...(estado ? { estado } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { archivos: true, validaciones: true } },
    },
  });

  return NextResponse.json(expedientes);
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    return createExpedienteFromFormUpload(request);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { cliente, ejercicio } = body as { cliente?: string; ejercicio?: number };

    const expediente = await prisma.expediente.create({
      data: {
        cliente: cliente?.trim() || "Pendiente de identificar",
        ejercicio: ejercicio ? parseInt(String(ejercicio), 10) : 0,
      },
    });

    return NextResponse.json(expediente, { status: 201 });
  } catch (err) {
    log.error("POST expedientes (JSON) falló", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al crear expediente" },
      { status: 500 }
    );
  }
}
