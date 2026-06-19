import type { EvidenceItem } from "./types";
import { normalizeEvidenceType } from "./parse-issue";
import {
  evidenceDisplayValue,
  evText,
  formatEvidenceBadgeLabel,
  formatEvidenceLocator,
  isNarrativeEvidence,
  isSimpleStatusEvidence,
} from "./evidence-utils";
import { CopyLocatorButton } from "./CopyLocatorButton";
import { ExpandableText } from "./ExpandableText";
import { EvidenceLocator } from "./EvidenceLocator";

interface EvidenceBadgeProps {
  evidence: EvidenceItem;
  compact?: boolean;
  prominentLocator?: boolean;
}

function locatorMatchesLabel(locator: string | undefined, label: string): boolean {
  if (!locator) return false;
  if (locator === label) return true;
  const stripped = label.replace(/^(Memoria|Excel)\s*➔\s*/i, "").trim();
  return locator.includes(stripped) || stripped.includes(locator.replace(/^Memoria ➔ /i, ""));
}

export function EvidenceBadge({
  evidence,
  compact = false,
  prominentLocator = false,
}: EvidenceBadgeProps) {
  const type = normalizeEvidenceType(evidence);
  const label = formatEvidenceBadgeLabel(evidence);
  const locator = formatEvidenceLocator(evidence);
  const displayValue = evidenceDisplayValue(evidence);
  const hasOrigen = !!(evidence.origen?.ubicacion);
  const narrative = evText(evidence);
  const valueInLabel = !!(displayValue && label.includes(displayValue));
  const showSeparateValue = displayValue && !hasOrigen && !valueInLabel;
  const showNarrative = narrative && !(valueInLabel && narrative === displayValue);
  const isMemory = type === "memory";
  const isNarrative = isNarrativeEvidence(evidence);
  const redundantLocator = locatorMatchesLabel(locator, label);

  const badgeClass = isMemory
    ? "border-blue-200 bg-blue-50 text-blue-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";

  if (isSimpleStatusEvidence(evidence)) {
    return (
      <div
        className={`flex items-center justify-between gap-2 rounded border px-2 py-1 ${isMemory ? "border-blue-100 bg-blue-50/50" : "border-emerald-100 bg-emerald-50/50"}`}
      >
        <span className={`min-w-0 truncate text-xs font-medium ${isMemory ? "text-blue-800" : "text-emerald-800"}`}>
          {label}
        </span>
        {isMemory && <CopyLocatorButton text={label} />}
      </div>
    );
  }

  if (isNarrative && showNarrative) {
    return (
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <ExpandableText text={narrative} className="text-slate-600" clampLines={3} />
        </div>
        {isMemory && <CopyLocatorButton text={narrative} />}
      </div>
    );
  }

  if (compact) {
    return (
      <span
        className={`inline-flex max-w-full items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${badgeClass}`}
      >
        <span className="truncate">{label}</span>
        {showSeparateValue && (
          <>
            <span className="text-current/40">·</span>
            <span className="shrink-0 font-mono tabular-nums">{displayValue}</span>
          </>
        )}
      </span>
    );
  }

  return (
    <div
      className={`rounded border px-2 py-1.5 ${isMemory ? "border-blue-100 bg-blue-50/30" : "border-emerald-100 bg-emerald-50/30"}`}
    >
      {prominentLocator && locator && !redundantLocator && (
        <EvidenceLocator evidence={evidence} prominent={prominentLocator} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`inline-flex max-w-full items-center truncate rounded border px-2 py-0.5 text-xs font-medium ${badgeClass}`}
        >
          {label}
        </span>
        {showSeparateValue && (
          <span className="font-mono text-xs font-semibold tabular-nums text-slate-900">
            {displayValue}
          </span>
        )}
      </div>
    </div>
  );
}
