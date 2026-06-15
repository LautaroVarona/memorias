import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const rule = await prisma.reglaCustom.update({
    where: { id },
    data: {
      ...(body.nombre !== undefined ? { nombre: body.nombre } : {}),
      ...(body.expresion !== undefined ? { expresion: body.expresion } : {}),
      ...(body.severidad !== undefined ? { severidad: body.severidad } : {}),
      ...(body.activa !== undefined ? { activa: body.activa } : {}),
    },
  });

  return NextResponse.json(rule);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.reglaCustom.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
