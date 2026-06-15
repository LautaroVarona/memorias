import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const expedienteId = new URL(request.url).searchParams.get("expedienteId");

  const rules = await prisma.reglaCustom.findMany({
    where: expedienteId
      ? { OR: [{ expedienteId }, { expedienteId: null }] }
      : {},
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(rules);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { nombre, expresion, severidad, activa, expedienteId } = body;

  if (!nombre || !expresion) {
    return NextResponse.json({ error: "Nombre y expresión son obligatorios" }, { status: 400 });
  }

  try {
    JSON.parse(typeof expresion === "string" ? expresion : JSON.stringify(expresion));
  } catch {
    return NextResponse.json({ error: "Expresión JSON inválida" }, { status: 400 });
  }

  const rule = await prisma.reglaCustom.create({
    data: {
      nombre,
      expresion: typeof expresion === "string" ? expresion : JSON.stringify(expresion),
      severidad: severidad || "warning",
      activa: activa !== false,
      expedienteId: expedienteId || null,
    },
  });

  return NextResponse.json(rule, { status: 201 });
}
