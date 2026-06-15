import type { EvidenceItem } from "./types";
import { normalizeEvidenceType } from "./parse-issue";
import {
  evidenceDisplayValue,
  evText,
  formatEvidenceBadgeLabel,
  isNarrativeEvidence,
} from "./evidence-utils";
import { CopyLocatorButton } from "./CopyLocatorButton";
import { ExpandableText } from "./ExpandableText";

interface EvidenceBadgeProps {
  evidence: EvidenceItem;
  compact?: boolean;
}

export function EvidenceBadge({ evidence, compact = false }: EvidenceBadgeProps) {
  const type = normalizeEvidenceType(evidence);
  const label = formatEvidenceBadgeLabel(evidence);
  const displayValue = evidenceDisplayValue(evidence);
  const narrative = evText(evidence);
  const isMemory = type === "memory";
  const isNarrative = isNarrativeEvidence(evidence);

  const badgeClass = isMemory
    ? "border-blue-200 bg-blue-50 text-blue-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";

  if (compact && !isNarrative) {
    return (
      <span
        className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${badgeClass}`}
      >
        <span className="truncate">{label}</span>
        {displayValue && (
          <>
            <span className="text-current/40">·</span>
            <span className="shrink-0 font-mono tabular-nums">{displayValue}</span>
          </>
        )}
      </span>
    );
  }

  return (
    <div className={`rounded-lg border p-3 ${isMemory ? "border-blue-100 bg-blue-50/40" : "border-emerald-100 bg-emerald-50/40"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${badgeClass}`}
        >
          {label}
        </span>
        {displayValue && !isNarrative && (
          <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
            {displayValue}
          </span>
        )}
      </div>

      {narrative && (
        <div className="mt-2 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <ExpandableText text={narrative} className="text-slate-700" />
          </div>
          {isMemory && <CopyLocatorButton text={narrative} />}
        </div>
      )}
    </div>
  );
}
