import type { CaseScore } from "@/types/case-data";
import type { ResumenValidacion } from "@/types/domain";

export interface ReportData {
  expediente: {
    id: string;
    cliente: string;
    ejercicio: number;
    tipoEmpresa: string | null;
    estado: string;
    createdAt: string;
  };
  resumen: ResumenValidacion;
  score?: CaseScore | null;
  validaciones: {
    ruleId: string;
    title?: string | null;
    categoria: string;
    severidad: string;
    mensaje: string;
    explanation?: string | null;
    normativa?: string | null;
    referencia?: string | null;
    evidencia: unknown[];
    sugerencia: string | null;
  }[];
}

function formatEvidence(ev: unknown[]): string {
  if (!Array.isArray(ev) || ev.length === 0) return "-";
  return ev
    .map((e) => {
      const item = e as Record<string, unknown>;
      const ref = item.reference ?? item.referencia ?? "";
      const val = item.formattedValue ?? item.value ?? item.valor ?? "";
      const text = item.text ?? item.detalle ?? "";
      const imp = item.importance ? `[${item.importance}]` : "";
      return `${imp} ${item.type ?? item.tipo}: ${ref} ${val} ${text}`.trim();
    })
    .join(" | ");
}

export function buildHtmlReport(data: ReportData): string {
  const { expediente, resumen, score, validaciones } = data;

  const byCategory = validaciones.reduce(
    (acc, v) => {
      if (!acc[v.categoria]) acc[v.categoria] = [];
      acc[v.categoria].push(v);
      return acc;
    },
    {} as Record<string, typeof validaciones>
  );

  const categorySections = Object.entries(byCategory)
    .map(([cat, items]) => {
      const rows = items
        .map(
          (v) => `
        <tr class="row-${v.severidad}">
          <td>${escapeHtml(v.title ?? v.ruleId)}</td>
          <td>${v.normativa ? escapeHtml(v.normativa) : "-"}</td>
          <td style="white-space:pre-wrap">${escapeHtml(v.explanation ?? v.mensaje)}</td>
          <td>${escapeHtml(formatEvidence(v.evidencia))}</td>
          <td>${v.sugerencia ? escapeHtml(v.sugerencia) : "-"}</td>
        </tr>`
        )
        .join("");
      return `<h3>${cat}</h3><table><thead><tr><th>Regla</th><th>Normativa</th><th>Explicación</th><th>Evidencia</th><th>Sugerencia</th></tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join("");

  const scoreBlock = score
    ? `<div class="score">Score: <strong>${score.score}/100</strong> — Estado: ${score.estado} — Errores: ${score.errores} — Advertencias: ${score.warnings}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Informe de revisión - ${escapeHtml(expediente.cliente)} ${expediente.ejercicio}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
    h1 { font-size: 1.5rem; }
    .summary { display: flex; gap: 1rem; margin: 1.5rem 0; flex-wrap: wrap; }
    .badge { padding: 0.5rem 1rem; border-radius: 6px; font-weight: 600; }
    .score { margin: 1rem 0; padding: 1rem; background: #eff6ff; border-radius: 6px; }
    .badge.critical { background: #fee2e2; color: #991b1b; }
    .badge.warning { background: #fef3c7; color: #92400e; }
    .badge.pass { background: #d1fae5; color: #065f46; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; font-size: 0.875rem; }
    th, td { border: 1px solid #e5e7eb; padding: 0.5rem; text-align: left; }
    th { background: #f9fafb; }
    tr.row-critical { background: #fef2f2; }
    tr.row-warning { background: #fffbeb; }
    tr.row-pass { background: #f0fdf4; }
    .meta { color: #6b7280; font-size: 0.875rem; }
  </style>
</head>
<body>
  <h1>Informe de revisión contable</h1>
  <p class="meta">${escapeHtml(expediente.cliente)} — Ejercicio ${expediente.ejercicio} — Tipo: ${expediente.tipoEmpresa || "N/D"}</p>
  ${scoreBlock}
  <div class="summary">
    <span class="badge critical">${resumen.critical} errores</span>
    <span class="badge warning">${resumen.warning} advertencias</span>
    <span class="badge pass">${resumen.pass} superadas</span>
  </div>
  ${categorySections}
  <p class="meta">Generado el ${new Date().toLocaleString("es-ES")}</p>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildExcelRows(data: ReportData): Record<string, string | number>[] {
  return data.validaciones.map((v) => ({
    Categoría: v.categoria,
    Regla: v.title ?? v.ruleId,
    Normativa: v.normativa || "",
    Referencia: v.referencia || "",
    Explicación: v.explanation ?? v.mensaje,
    Evidencia: formatEvidence(v.evidencia),
    Sugerencia: v.sugerencia || "",
  }));
}
