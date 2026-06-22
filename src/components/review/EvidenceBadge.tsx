import type { EvidenceItem } from "./types";
import { normalizeEvidenceType } from "./parse-issue";
import {
  evidenceDisplayValue,
  evText,
  extractSearchSnippet,
  formatEvidenceBadgeLabel,
  formatEvidenceLocator,
  formatMemoryTracingSubtitle,
  isNarrativeEvidence,
  isSimpleStatusEvidence,
} from "./evidence-utils";
import {
  extractApartadoFromEvidence,
  formatApartadoShort,
  textIncludesApartado,
} from "@/lib/evidence/apartado-ref";
import { navigateToMemoriaSection } from "./memoria-navigator";
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
  const memoryTracing = isMemory ? formatMemoryTracingSubtitle(evidence) : undefined;
  const apartado = isMemory ? extractApartadoFromEvidence(evidence) : undefined;
  const apartadoPrefix =
    apartado && !textIncludesApartado(label, apartado.num)
      ? `${formatApartadoShort(apartado)} · `
      : "";

  function navigateToEvidence(e?: React.MouseEvent | React.KeyboardEvent) {
    e?.stopPropagation();
    if (!isMemory || !apartado) return;
    navigateToMemoriaSection({
      apartado: apartado.num,
      highlightText: extractSearchSnippet(evText(evidence)),
    });
  }

  const badgeClass = isMemory
    ? "border-blue-200 bg-blue-50 text-blue-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";

  if (isSimpleStatusEvidence(evidence)) {
    return (
      <div
        role={isMemory && apartado ? "button" : undefined}
        tabIndex={isMemory && apartado ? 0 : undefined}
        onClick={isMemory && apartado ? (e) => navigateToEvidence(e) : undefined}
        onKeyDown={
          isMemory && apartado
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigateToEvidence(e);
                }
              }
            : undefined
        }
        className={`flex items-center justify-between gap-2 rounded border px-2 py-1 ${isMemory ? "border-blue-100 bg-blue-50/50" : "border-emerald-100 bg-emerald-50/50"} ${
          isMemory && apartado ? "cursor-pointer hover:border-blue-200" : ""
        }`}
      >
        <span className={`min-w-0 truncate text-xs font-medium ${isMemory ? "text-blue-800" : "text-emerald-800"}`}>
          {label}
        </span>
      </div>
    );
  }

  if (isNarrative && showNarrative) {
    return (
      <div
        role={isMemory && apartado ? "button" : undefined}
        tabIndex={isMemory && apartado ? 0 : undefined}
        onClick={isMemory && apartado ? (e) => navigateToEvidence(e) : undefined}
        onKeyDown={
          isMemory && apartado
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigateToEvidence(e);
                }
              }
            : undefined
        }
        className={`flex items-start gap-1.5 ${isMemory && apartado ? "cursor-pointer rounded hover:bg-blue-50/40" : ""}`}
      >
        <div className="min-w-0 flex-1">
          {memoryTracing && (
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
              {memoryTracing}
            </p>
          )}
          <ExpandableText text={narrative} className="text-slate-600" clampLines={3} />
        </div>
      </div>
    );
  }

  if (compact) {
    const content = (
      <>
        <span className="truncate">
          {apartadoPrefix}
          {label}
        </span>
        {showSeparateValue && (
          <>
            <span className="text-current/40">·</span>
            <span className="shrink-0 font-mono tabular-nums">{displayValue}</span>
          </>
        )}
      </>
    );

    if (isMemory && apartado) {
      return (
        <button
          type="button"
          onClick={(e) => navigateToEvidence(e)}
          className={`inline-flex max-w-full items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${badgeClass} cursor-pointer hover:opacity-90`}
        >
          {content}
        </button>
      );
    }

    return (
      <span
        className={`inline-flex max-w-full items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${badgeClass}`}
      >
        {content}
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

      {memoryTracing && !prominentLocator && (
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
          {memoryTracing}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`inline-flex max-w-full items-center truncate rounded border px-2 py-0.5 text-xs font-medium ${badgeClass}`}
        >
          {apartadoPrefix}
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
