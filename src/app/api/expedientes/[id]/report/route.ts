import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { buildExcelRows, buildHtmlReport, type ReportData } from "@/lib/reports/builder";
import { summarizeResults } from "@/lib/rules/scoring";
import type { CaseData } from "@/types/case-data";
import type { RuleCategory, RuleResult, Severidad } from "@/types/domain";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const format = new URL(request.url).searchParams.get("format") || "json";

  const expediente = await prisma.expediente.findUnique({
    where: { id },
    include: { validaciones: true },
  });

  if (!expediente) {
    return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });
  }

  const validaciones = expediente.validaciones.map((v) => ({
    ruleId: v.ruleId,
    title: v.title,
    categoria: v.categoria,
    severidad: v.severidad,
    mensaje: v.mensaje,
    explanation: v.explanation ?? v.mensaje,
    normativa: v.normativa,
    referencia: v.referencia,
    evidencia: JSON.parse(v.evidencia || "[]"),
    sugerencia: v.sugerencia,
  }));

  const ruleResults: RuleResult[] = validaciones.map((v) => ({
    ruleId: v.ruleId,
    title: v.title ?? v.ruleId,
    categoria: v.categoria as RuleCategory,
    type: v.categoria as RuleCategory,
    severidad: v.severidad as Severidad,
    severity: v.severidad === "critical" ? "critical" : v.severidad === "pass" ? "ok" : "warning",
    mensaje: v.mensaje,
    explanation: v.explanation ?? v.mensaje,
    evidencia: v.evidencia,
    evidence: v.evidencia,
    normativa: v.normativa ?? undefined,
    referencia: v.referencia ?? undefined,
    sugerencia: v.sugerencia ?? undefined,
  }));

  const resumen = summarizeResults(ruleResults);
  const score = expediente.scoreSnapshot ? JSON.parse(expediente.scoreSnapshot) : null;

  let tipoMemoria = null as ReportData["expediente"]["tipoMemoria"];
  if (expediente.caseDataSnapshot) {
    try {
      const caseData = JSON.parse(expediente.caseDataSnapshot) as CaseData;
      tipoMemoria = caseData.memory?.keyData?.tipoMemoria ?? null;
    } catch {
      tipoMemoria = null;
    }
  }

  const reportData = {
    expediente: {
      id: expediente.id,
      cliente: expediente.cliente,
      ejercicio: expediente.ejercicio,
      tipoEmpresa: expediente.tipoEmpresa,
      tipoMemoria,
      estado: expediente.estado,
      createdAt: expediente.createdAt.toISOString(),
    },
    resumen,
    score,
    validaciones,
  };

  if (format === "html") {
    const html = buildHtmlReport(reportData);
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (format === "xlsx") {
    const rows = buildExcelRows(reportData);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Validaciones");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="informe-${expediente.cliente}-${expediente.ejercicio}.xlsx"`,
      },
    });
  }

  return NextResponse.json(reportData);
}
