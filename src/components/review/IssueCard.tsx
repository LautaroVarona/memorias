"use client";

import type { ParsedIssue, ValidacionView } from "./types";
import { EvidenceBadge } from "./EvidenceBadge";
import { VinculadasEvidenceFromEvidencia } from "./EvidenceBlock";
import { ComparativeValues } from "./ComparativeValues";
import { ExpandableText } from "./ExpandableText";
import { InterannualTextDiff } from "./InterannualTextDiff";
import { SeverityBadge, severityBorderClass } from "./SeverityBadge";
import { navigateToMemoriaFromValidation } from "./navigate-from-validation";
import {
  enrichIssue,
  extractApartadoFromEvidence,
  extractApartadoInfo,
  isRedundantMeta,
  normalizeEvidenceType,
  supportsInterannualDiff,
} from "./parse-issue";
import type { ApartadoInfo } from "@/lib/evidence/apartado-ref";
import { formatApartadoLabel } from "@/lib/evidence/apartado-ref";
import { evText, extractSearchSnippet } from "./evidence-utils";
import { navigateToMemoriaSection } from "./memoria-navigator";

interface IssueCardProps {
  validacion: ValidacionView;
  variant: "critical" | "warning";
}

function firstMemorySnippet(validacion: ValidacionView): string | undefined {
  for (const ev of validacion.evidencia) {
    if (normalizeEvidenceType(ev) !== "memory") continue;
    const snippet = extractSearchSnippet(evText(ev));
    if (snippet) return snippet;
  }
  return undefined;
}

function ApartadoLink({
  apartado,
  validacion,
  highlightText,
}: {
  apartado: ApartadoInfo;
  validacion: ValidacionView;
  highlightText?: string;
}) {
  const short = apartado.title
    ? `Ap. ${apartado.num} · ${apartado.title.length > 36 ? `${apartado.title.slice(0, 35)}…` : apartado.title}`
    : `Ap. ${apartado.num}`;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigateToMemoriaSection({
          apartado: apartado.num,
          highlightText: highlightText ?? firstMemorySnippet(validacion),
        });
      }}
      className="inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium text-blue-600 transition hover:bg-blue-50 hover:text-blue-700"
      title={`Ir a ${formatApartadoLabel(apartado)}`}
    >
      {short}
      <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path
          fillRule="evenodd"
          d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );
}

function collectMemoryApartados(validacion: ValidacionView): ApartadoInfo[] {
  const seen = new Set<string>();
  const apartados: ApartadoInfo[] = [];

  for (const ev of validacion.evidencia) {
    if (normalizeEvidenceType(ev) !== "memory") continue;
    const info = extractApartadoFromEvidence(ev);
    if (!info || seen.has(info.num)) continue;
    seen.add(info.num);
    apartados.push(info);
  }

  if (apartados.length > 0) return apartados;

  const fallback = extractApartadoInfo(validacion);
  return fallback ? [fallback] : [];
}

function MemoryEvidenceItem({
  evidence,
  showApartado,
  validacion,
  defaultCollapsed = true,
}: {
  evidence: ValidacionView["evidencia"][number];
  showApartado: boolean;
  validacion: ValidacionView;
  defaultCollapsed?: boolean;
}) {
  const narrative = evText(evidence);
  const apartado = extractApartadoFromEvidence(evidence);
  const page = evidence.page;

  if (!narrative) {
    return <EvidenceBadge evidence={evidence} compact />;
  }

  return (
    <div className="space-y-0.5" data-no-navigate>
      {showApartado && apartado && (
        <ApartadoLink
          apartado={apartado}
          validacion={validacion}
          highlightText={extractSearchSnippet(narrative)}
        />
      )}
      {page !== undefined && (
        <span className="text-[10px] text-slate-400">Pág. {page}</span>
      )}
      <ExpandableText
        text={narrative}
        className="text-[11px] leading-snug text-slate-600"
        clampLines={defaultCollapsed ? 2 : 3}
      />
    </div>
  );
}

function EvidenceSection({
  evidencia,
  ruleId,
  validacion,
}: {
  evidencia: ValidacionView["evidencia"];
  ruleId: string;
  validacion: ValidacionView;
}) {
  if (evidencia.length === 0) return null;

  if (ruleId === "CROSS_001") {
    return (
      <div className="mt-2">
        <VinculadasEvidenceFromEvidencia evidencia={evidencia} />
      </div>
    );
  }

  const memoryApartados = collectMemoryApartados({ ...validacion, evidencia });
  const showPerItemApartado = memoryApartados.length > 1;

  return (
    <div className="mt-1 space-y-1.5" data-no-navigate>
      {evidencia.map((ev, i) => {
        const type = normalizeEvidenceType(ev);
        const narrative = evText(ev);

        if (type === "memory" && narrative) {
          return (
            <MemoryEvidenceItem
              key={i}
              evidence={ev}
              showApartado={showPerItemApartado}
              validacion={validacion}
            />
          );
        }

        return <EvidenceBadge key={i} evidence={ev} compact />;
      })}
    </div>
  );
}

export function IssueCard({ validacion, variant }: IssueCardProps) {
  const issue: ParsedIssue = enrichIssue(validacion);
  const title = validacion.title ?? validacion.ruleId;
  const hasComparison = !!(issue.excelValue || issue.memoryValue);
  const memoryApartados = collectMemoryApartados(validacion);
  const apartado = memoryApartados.length === 1 ? memoryApartados[0] : undefined;
  const showDiff = supportsInterannualDiff(validacion.ruleId);
  const hasNarrativeMemoryEvidence = validacion.evidencia.some(
    (ev) => normalizeEvidenceType(ev) === "memory" && evText(ev).length > 0
  );

  const severityLevel = variant === "critical" ? "critical" : "warning";
  const showWhat =
    !hasComparison &&
    !hasNarrativeMemoryEvidence &&
    issue.what &&
    !isRedundantMeta(issue.what, title) &&
    (issue.keyFact || issue.what.length > 0);

  const canNavigateMemoria = memoryApartados.length > 0;

  function goToMemoria(e?: React.MouseEvent) {
    e?.stopPropagation();
    navigateToMemoriaFromValidation(validacion);
  }

  function handleCardClick(e: React.MouseEvent<HTMLElement>) {
    if (!canNavigateMemoria) return;
    if ((e.target as HTMLElement).closest("button, a, [data-no-navigate]")) return;
    navigateToMemoriaFromValidation(validacion);
  }

  return (
    <article
      onClick={handleCardClick}
      className={`rounded-lg border border-slate-200 border-l-2 bg-white px-2.5 py-2 ${severityBorderClass(severityLevel)} ${
        canNavigateMemoria ? "cursor-pointer transition hover:border-slate-300 hover:bg-slate-50/50" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="shrink-0 pt-0.5">
          <SeverityBadge level={severityLevel} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h3 className="text-[13px] font-semibold leading-snug text-slate-900">{title}</h3>
            {validacion.tags?.includes("riesgo_fiscal") && (
              <span className="inline-flex rounded bg-red-100 px-1 py-px text-[9px] font-semibold text-red-700">
                Riesgo fiscal
              </span>
            )}
            {apartado && <ApartadoLink apartado={apartado} validacion={validacion} />}
          </div>

          {canNavigateMemoria && (
            <button
              type="button"
              onClick={goToMemoria}
              className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-medium text-blue-600 hover:text-blue-800"
            >
              Ver en memoria
              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}

          {hasComparison && (
            <ComparativeValues
              excelValue={issue.excelValue}
              memoryValue={issue.memoryValue}
              memoryApartado={apartado ? formatApartadoLabel(apartado) : undefined}
              tone={variant}
            />
          )}

          {showWhat && (
            <div className="mt-1.5">
              {issue.what.length > 100 ? (
                <ExpandableText text={issue.what} className="text-xs text-slate-600" />
              ) : (
                <p className="text-xs text-slate-600">
                  {issue.keyFact ?? issue.what.split(".")[0]}
                </p>
              )}
            </div>
          )}

          {showDiff && <InterannualTextDiff evidencia={validacion.evidencia} />}

          <EvidenceSection
            evidencia={validacion.evidencia}
            ruleId={validacion.ruleId}
            validacion={validacion}
          />
        </div>
      </div>
    </article>
  );
}
