"use client";

import type { ParsedIssue, ValidacionView } from "./types";
import { EvidenceBadge } from "./EvidenceBadge";
import { VinculadasEvidenceFromEvidencia } from "./EvidenceBlock";
import { ComparativeValues } from "./ComparativeValues";
import { ExpandableText } from "./ExpandableText";
import { CopyTextButton } from "./CopyTextButton";
import { InterannualTextDiff } from "./InterannualTextDiff";
import { formatEvidenceListForCopy } from "./evidence-utils";
import { SeverityBadge, severityBorderClass } from "./SeverityBadge";
import { scrollToApartado } from "./scroll-to-apartado";
import {
  enrichIssue,
  extractApartadoRef,
  isRedundantMeta,
  supportsInterannualDiff,
} from "./parse-issue";

interface IssueCardProps {
  validacion: ValidacionView;
  variant: "critical" | "warning";
}

function ApartadoLink({ apartadoRef }: { apartadoRef: string }) {
  return (
    <button
      type="button"
      onClick={() => scrollToApartado(apartadoRef)}
      className="inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium text-blue-600 transition hover:bg-blue-50 hover:text-blue-700"
      title={`Ir al apartado ${apartadoRef}`}
    >
      Ap. {apartadoRef}
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

function EvidenceSection({
  evidencia,
  ruleId,
}: {
  evidencia: ValidacionView["evidencia"];
  ruleId: string;
}) {
  if (evidencia.length === 0) return null;

  if (ruleId === "CROSS_001") {
    return (
      <div className="mt-2 border-t border-slate-100 pt-2">
        <VinculadasEvidenceFromEvidencia evidencia={evidencia} />
      </div>
    );
  }

  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      <div className="space-y-1">
        {evidencia.map((ev, i) => (
          <EvidenceBadge key={i} evidence={ev} compact />
        ))}
      </div>
    </div>
  );
}

export function IssueCard({ validacion, variant }: IssueCardProps) {
  const issue: ParsedIssue = enrichIssue(validacion);
  const title = validacion.title ?? validacion.ruleId;
  const hasComparison = !!(issue.excelValue || issue.memoryValue);
  const apartadoRef = extractApartadoRef(validacion);
  const showDiff = supportsInterannualDiff(validacion.ruleId);
  const copyText = formatEvidenceListForCopy(validacion.evidencia);
  const hasCopyableEvidence = copyText.trim().length > 0;

  const severityLevel = variant === "critical" ? "critical" : "warning";
  const showWhat =
    !hasComparison &&
    issue.what &&
    !isRedundantMeta(issue.what, title) &&
    (issue.keyFact || issue.what.length > 0);

  return (
    <article
      className={`rounded-md border border-slate-200 border-l-2 bg-white px-3 py-2 ${severityBorderClass(severityLevel)}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex shrink-0 items-center gap-1">
          <SeverityBadge level={severityLevel} />
          {hasCopyableEvidence && <CopyTextButton text={copyText} variant="icon" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h3 className="text-sm font-semibold leading-tight text-slate-900">{title}</h3>
            {validacion.tags?.includes("riesgo_fiscal") && (
              <span className="inline-flex rounded bg-red-100 px-1.5 py-px text-[10px] font-semibold text-red-700">
                Riesgo fiscal
              </span>
            )}
            {apartadoRef && <ApartadoLink apartadoRef={apartadoRef} />}
          </div>

          {hasComparison && (
            <ComparativeValues
              excelValue={issue.excelValue}
              memoryValue={issue.memoryValue}
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

          <EvidenceSection evidencia={validacion.evidencia} ruleId={validacion.ruleId} />
        </div>
      </div>
    </article>
  );
}
