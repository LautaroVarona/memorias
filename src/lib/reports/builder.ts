import type { CaseScore } from "@/types/case-data";
import type { ResumenValidacion } from "@/types/domain";
import {
  assignControlPoint,
  buildChecklistPath,
  CONTROL_POINTS,
  controlPointStatusLabel,
  getActiveReviewBlock,
  resolveControlPointStatus,
  type ControlPointStatus,
  type ReportValidation,
  type TipoMemoria,
} from "./checklist";
import { buildFindingLine, buildHallazgoAccion, humanProblemDescription } from "./format-issue";

export interface ReportData {
  expediente: {
    id: string;
    cliente: string;
    ejercicio: number;
    tipoEmpresa: string | null;
    tipoMemoria?: TipoMemoria | null;
    estado: string;
    createdAt: string;
  };
  resumen: ResumenValidacion;
  score?: CaseScore | null;
  validaciones: ReportValidation[];
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusClass(status: ControlPointStatus): string {
  switch (status) {
    case "ok":
      return "point-ok";
    case "issues":
      return "point-issues";
    case "pending":
      return "point-pending";
    case "no_aplica":
    case "no_aplica_section":
      return "point-na";
  }
}

function renderControlPoint(
  pointTitle: string,
  status: ControlPointStatus,
  issues: ReportValidation[]
): string {
  const label = controlPointStatusLabel(status);

  if (status === "no_aplica") {
    return `
    <li class="control-point ${statusClass(status)}">
      <span class="point-status na">No aplica</span>
      <span class="point-title">${escapeHtml(pointTitle)}</span>
    </li>`;
  }

  if (status === "pending") {
    return `
    <li class="control-point ${statusClass(status)}">
      <span class="point-status pending">${label}</span>
      <span class="point-title">${escapeHtml(pointTitle)}</span>
      <p class="point-note">Pendiente de auditoría automatizada.</p>
    </li>`;
  }

  if (status === "ok") {
    return `
    <li class="control-point ${statusClass(status)}">
      <span class="point-status ok">${label}</span>
      <span class="point-title">${escapeHtml(pointTitle)}</span>
    </li>`;
  }

  const findings = issues
    .map((v) => `<li class="finding">${escapeHtml(buildFindingLine(v))}</li>`)
    .join("");

  const hasCritical = issues.some((v) => v.severidad === "critical");
  const headerBadge = hasCritical ? "[X]" : "[!]";

  return `
    <li class="control-point ${statusClass(status)}">
      <div class="point-header">
        <span class="point-status issues">${headerBadge}</span>
        <span class="point-title">${escapeHtml(pointTitle)}</span>
      </div>
      <ul class="findings">${findings}</ul>
    </li>`;
}

function renderMemoryBlock(
  blockTitle: string,
  blockId: ReturnType<typeof getActiveReviewBlock>["id"],
  validaciones: ReportValidation[]
): string {
  const points = CONTROL_POINTS.map((point) => {
    const { status, issues } = resolveControlPointStatus(point, blockId, true, validaciones);
    return renderControlPoint(point.title, status, issues);
  }).join("");

  return `
  <section class="memory-block">
    <h2>${escapeHtml(blockTitle)}</h2>
    <ol class="control-checklist">${points}</ol>
  </section>`;
}

export function buildHtmlReport(data: ReportData): string {
  const { expediente, resumen, score, validaciones } = data;
  const tipoMemoria = expediente.tipoMemoria ?? null;
  const activeBlock = getActiveReviewBlock(tipoMemoria);
  const memorySection = renderMemoryBlock(activeBlock.title, activeBlock.id, validaciones);

  const scoreBlock = score
    ? `<div class="score">Score: <strong>${score.score}/100</strong> — Estado: ${escapeHtml(score.estado)} — Errores: ${score.errores} — Advertencias: ${score.warnings}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Informe de revisión - ${escapeHtml(expediente.cliente)} ${expediente.ejercicio}</title>
  <style>
    :root {
      --ok: #065f46;
      --ok-bg: #d1fae5;
      --warn: #92400e;
      --warn-bg: #fef3c7;
      --crit: #991b1b;
      --crit-bg: #fee2e2;
      --na: #6b7280;
      --na-bg: #f3f4f6;
      --border: #e5e7eb;
      --muted: #6b7280;
    }
    body { font-family: system-ui, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; line-height: 1.5; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.05rem; margin: 0 0 0.75rem; color: #111827; }
    .meta { color: var(--muted); font-size: 0.875rem; }
    .score { margin: 1rem 0; padding: 1rem; background: #eff6ff; border-radius: 8px; font-size: 0.9rem; }
    .summary { display: flex; gap: 0.75rem; margin: 1.25rem 0 1.75rem; flex-wrap: wrap; }
    .badge { padding: 0.45rem 0.9rem; border-radius: 6px; font-weight: 600; font-size: 0.875rem; }
    .badge.critical { background: var(--crit-bg); color: var(--crit); }
    .badge.warning { background: var(--warn-bg); color: var(--warn); }
    .badge.pass { background: var(--ok-bg); color: var(--ok); }
    .revision-badge { display: inline-block; margin: 0.5rem 0 1rem; padding: 0.4rem 0.85rem; border-radius: 6px; font-weight: 600; font-size: 0.875rem; background: #dbeafe; color: #1e40af; }
    .memory-block { border: 1px solid #93c5fd; border-radius: 8px; padding: 1rem 1.1rem 1.1rem; margin-bottom: 1.25rem; background: #f8fbff; }
    .control-checklist { list-style: none; margin: 0; padding: 0; }
    .control-point { border-top: 1px solid var(--border); padding: 0.65rem 0; font-size: 0.9rem; }
    .control-point:first-child { border-top: none; padding-top: 0; }
    .point-header, .control-point:not(.point-issues) { display: flex; align-items: flex-start; gap: 0.65rem; }
    .point-status { font-family: ui-monospace, monospace; font-size: 0.78rem; padding: 0.15rem 0.45rem; border-radius: 4px; flex-shrink: 0; margin-top: 0.1rem; }
    .point-status.ok { background: var(--ok-bg); color: var(--ok); }
    .point-status.issues { background: var(--warn-bg); color: var(--warn); }
    .point-status.pending { background: var(--warn-bg); color: var(--warn); }
    .point-status.na { background: var(--na-bg); color: var(--na); font-family: inherit; font-size: 0.75rem; }
    .point-title { font-weight: 600; }
    .point-note { margin: 0.35rem 0 0 3.5rem; color: var(--muted); font-size: 0.8125rem; }
    .findings { margin: 0.45rem 0 0 0; padding-left: 1.25rem; list-style: disc; }
    .finding { margin-bottom: 0.35rem; font-size: 0.8125rem; color: #374151; }
    .point-issues .findings { margin-left: 0.5rem; }
    .footer { margin-top: 2rem; }
  </style>
</head>
<body>
  <h1>Informe de revisión contable</h1>
  <p class="revision-badge">${escapeHtml(activeBlock.title)}</p>
  <p class="meta">${escapeHtml(expediente.cliente)} — Ejercicio ${expediente.ejercicio} — Tipo empresa: ${escapeHtml(expediente.tipoEmpresa || "N/D")}</p>
  ${scoreBlock}
  <div class="summary">
    <span class="badge critical">${resumen.critical} errores</span>
    <span class="badge warning">${resumen.warning} advertencias</span>
    <span class="badge pass">${resumen.pass} superadas</span>
  </div>
  ${memorySection}
  <p class="meta footer">Generado el ${new Date().toLocaleString("es-ES")}</p>
</body>
</html>`;
}

function formatEvidence(ev: unknown[]): string {
  if (!Array.isArray(ev) || ev.length === 0) return "";
  return ev
    .map((e) => {
      const item = e as Record<string, unknown>;
      const ref = item.reference ?? item.referencia ?? "";
      const val = item.formattedValue ?? item.value ?? item.valor ?? "";
      const text = item.text ?? item.detalle ?? "";
      return `${ref} ${val} ${text}`.trim();
    })
    .filter(Boolean)
    .join(" | ");
}

export function buildExcelRows(data: ReportData): Record<string, string | number>[] {
  const tipoMemoria = data.expediente.tipoMemoria ?? null;

  return data.validaciones.map((v) => {
    const point = assignControlPoint(v.ruleId);
    const blockTitle = getActiveReviewBlock(tipoMemoria).title;

    return {
      Revisión: blockTitle,
      Punto: point.title,
      Problema: humanProblemDescription(v),
      Severidad: v.severidad,
      "Hallazgo y Acción": buildHallazgoAccion(v),
      Evidencia: formatEvidence(v.evidencia),
      Ruta: buildChecklistPath(blockTitle, point.title),
    };
  });
}
