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
import { EvidenceLocator } from "./EvidenceLocator";

interface EvidenceBadgeProps {
  evidence: EvidenceItem;
  compact?: boolean;
  prominentLocator?: boolean;
}

export function EvidenceBadge({
  evidence,
  compact = false,
  prominentLocator = false,
}: EvidenceBadgeProps) {
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
    <div
      className={`rounded-lg border p-3 ${isMemory ? "border-blue-100 bg-blue-50/40" : "border-emerald-100 bg-emerald-50/40"}`}
    >
      <EvidenceLocator evidence={evidence} prominent={prominentLocator} />

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

interface VinculadasBreakdownProps {
  evidencia: EvidenceItem[];
}

const GROUP_LABELS: Record<string, string> = {
  prestamos: "Préstamos intragrupo",
  participaciones: "Participaciones",
  comerciales: "Operaciones comerciales",
  clientes: "Clientes grupo",
  proveedores: "Proveedores grupo",
  otro: "Otras cuentas",
};

export function VinculadasBreakdown({ evidencia }: VinculadasBreakdownProps) {
  const accountLines = evidencia.filter(
    (e) => e.group && normalizeEvidenceType(e) === "excel" && (e.reference?.startsWith("Cta ") ?? false)
  );

  if (accountLines.length === 0) return null;

  const byGroup = new Map<string, EvidenceItem[]>();
  for (const ev of accountLines) {
    const g = ev.group ?? "otro";
    const list = byGroup.get(g) ?? [];
    list.push(ev);
    byGroup.set(g, list);
  }

  return (
    <div className="mt-4 rounded-lg border border-emerald-200 bg-white p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
        Desglose del cálculo (Excel)
      </h4>
      <div className="mt-3 space-y-4">
        {[...byGroup.entries()].map(([group, items]) => {
          const subtotal = items.reduce((s, e) => {
            const v = typeof e.value === "number" ? e.value : parseFloat(String(e.value ?? 0));
            return s + (Number.isFinite(v) ? v : 0);
          }, 0);
          return (
            <div key={group}>
              <p className="text-xs font-semibold text-slate-700">
                {GROUP_LABELS[group] ?? group}
                <span className="ml-2 font-mono text-emerald-800">
                  {subtotal.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €
                </span>
              </p>
              <div className="mt-2 space-y-2">
                {items.map((ev, i) => (
                  <EvidenceBadge key={i} evidence={ev} prominentLocator />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
