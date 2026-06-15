import { buildExcelRows, buildHtmlReport, type ReportData } from "@/lib/reports/builder";
import { summarizeResults } from "@/lib/rules/scoring";
import type { RuleCategory, RuleResult, Severidad } from "@/types/domain";
import type { ExpedienteDetail } from "@/lib/expediente-client";

function toReportData(detail: ExpedienteDetail): ReportData {
  const validaciones = detail.validaciones.map((v) => ({
    ruleId: v.ruleId,
    title: v.title,
    categoria: v.categoria,
    severidad: v.severidad,
    mensaje: v.mensaje,
    explanation: v.explanation,
    normativa: v.normativa,
    referencia: v.referencia,
    evidencia: v.evidencia,
    sugerencia: v.sugerencia,
  }));

  const ruleResults = validaciones.map((v) => ({
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
  })) as RuleResult[];

  return {
    expediente: {
      id: detail.id,
      cliente: detail.cliente,
      ejercicio: detail.ejercicio,
      tipoEmpresa: detail.tipoEmpresa,
      estado: detail.estado,
      createdAt: new Date().toISOString(),
    },
    resumen: summarizeResults(ruleResults),
    score: (detail.score ?? null) as ReportData["score"],
    validaciones,
  };
}

export function downloadHtmlReport(detail: ExpedienteDetail): void {
  const html = buildHtmlReport(toReportData(detail));
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `informe-${detail.cliente}-${detail.ejercicio}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadExcelReport(detail: ExpedienteDetail): Promise<void> {
  const XLSX = await import("xlsx");
  const rows = buildExcelRows(toReportData(detail));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Validaciones");
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `informe-${detail.cliente}-${detail.ejercicio}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function openHtmlReport(detail: ExpedienteDetail): void {
  const html = buildHtmlReport(toReportData(detail));
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
