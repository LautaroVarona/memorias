import { NextRequest, NextResponse } from "next/server";
import { deleteUploadDir } from "@/lib/files";
import { prisma } from "@/lib/db";
import { evaluateGlobalClosure } from "@/lib/rules/global-evaluation";
import { filterApartadoOnlyValidaciones } from "@/lib/review/apartado-only";
import { computeCaseScore } from "@/lib/rules/scoring";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  function buildSectionsPayload(caseData: import("@/types/case-data").CaseData | null) {
    if (!caseData?.memory?.sections?.length) return {};
    const out: Record<string, { current?: string; prior?: string; title?: string }> = {};
    const priorByNum = new Map(
      (caseData.priorYear?.memory?.sections ?? [])
        .filter((s) => s.numero !== undefined)
        .map((s) => [String(s.numero).padStart(2, "0"), s])
    );
    for (const sec of caseData.memory.sections) {
      if (sec.numero === undefined) continue;
      const num = String(sec.numero).padStart(2, "0");
      const prior = priorByNum.get(num);
      out[num] = {
        title: sec.titulo,
        current: sec.contenido,
        prior: prior?.contenido,
      };
    }
    return out;
  }

  const { id } = await params;
  const expediente = await prisma.expediente.findUnique({
    where: { id },
    include: {
      archivos: true,
      validaciones: { orderBy: { severidad: "asc" } },
      ejercicioAnterior: { select: { id: true, cliente: true, ejercicio: true } },
    },
  });

  if (!expediente) {
    return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });
  }

  const rawValidaciones = expediente.validaciones.map((v) => {
    const raw = JSON.parse(v.evidencia || "[]") as
      | import("@/types/case-data").Evidence[]
      | { items?: import("@/types/case-data").Evidence[]; diagnosis?: string; tags?: string[] };

    const isWrapped = raw && typeof raw === "object" && !Array.isArray(raw) && "items" in raw;
    const evidencia = isWrapped ? (raw.items ?? []) : (raw as import("@/types/case-data").Evidence[]);
    const diagnosis = isWrapped ? raw.diagnosis : undefined;
    const tags = isWrapped ? raw.tags : undefined;

    return {
      ...v,
      evidencia,
      diagnosis,
      tags,
      explanation: v.explanation ?? v.mensaje,
      title: v.title ?? v.ruleId,
    };
  });
  const validaciones = filterApartadoOnlyValidaciones(rawValidaciones);

  const resumen = {
    critical: validaciones.filter((v) => v.severidad === "critical").length,
    warning: validaciones.filter((v) => v.severidad === "warning").length,
    pass: validaciones.filter((v) => v.severidad === "pass").length,
    total: validaciones.length,
    errores: validaciones.filter((v) => v.severidad === "critical").length,
    warnings: validaciones.filter((v) => v.severidad === "warning").length,
  };

  let score = expediente.scoreSnapshot ? JSON.parse(expediente.scoreSnapshot) : null;
  let sections: Record<string, { current?: string; prior?: string; title?: string }> = {};
  if (!score && validaciones.length > 0) {
    const caseRow = await prisma.datosExtraidos.findFirst({
      where: { expedienteId: id, fuente: "case" },
      orderBy: { createdAt: "desc" },
    });
    const caseData = caseRow?.payload
      ? (JSON.parse(caseRow.payload) as import("@/types/case-data").CaseData)
      : null;
    sections = buildSectionsPayload(caseData);

    const ruleResults = validaciones.map((v) => ({
      ruleId: v.ruleId,
      title: v.title ?? v.ruleId,
      categoria: v.categoria as import("@/types/domain").RuleCategory,
      type: v.categoria as import("@/types/domain").RuleCategory,
      severidad: v.severidad as import("@/types/domain").Severidad,
      severity: (v.severidad === "critical"
        ? "critical"
        : v.severidad === "pass"
          ? "ok"
          : "warning") as import("@/types/domain").RuleResult["severity"],
      mensaje: v.mensaje,
      explanation: v.explanation ?? v.mensaje,
      evidencia: v.evidencia,
      evidence: v.evidencia,
      normativa: v.normativa ?? undefined,
      referencia: v.referencia ?? undefined,
      sugerencia: v.sugerencia ?? undefined,
    })) as unknown as import("@/types/domain").RuleResult[];

    const globalEval = caseData
      ? evaluateGlobalClosure(ruleResults, caseData)
      : { estado: "revisar" as const, bloqueadores: [] };
    score = computeCaseScore(ruleResults, globalEval);
  }

  if (sections && Object.keys(sections).length === 0) {
    const caseRow = await prisma.datosExtraidos.findFirst({
      where: { expedienteId: id, fuente: "case" },
      orderBy: { createdAt: "desc" },
    });
    const caseData = caseRow?.payload
      ? (JSON.parse(caseRow.payload) as import("@/types/case-data").CaseData)
      : null;
    sections = buildSectionsPayload(caseData);
  }

  return NextResponse.json({ ...expediente, validaciones, resumen, score, sections });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const expediente = await prisma.expediente.findUnique({ where: { id } });
    if (!expediente) {
      return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });
    }

    await prisma.expediente.delete({ where: { id } });
    await deleteUploadDir(id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE expediente:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al eliminar expediente" },
      { status: 500 }
    );
  }
}
