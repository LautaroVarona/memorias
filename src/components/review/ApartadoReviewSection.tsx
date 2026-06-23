"use client";

import { useState } from "react";
import type { ApartadoReviewGroup } from "./group-by-apartado";
import { formatApartadoHeading } from "./group-by-apartado";
import type { ValidacionView } from "./types";
import { ApartadoMemoriaCompare } from "./ApartadoMemoriaCompare";
import { IssueCard } from "./IssueCard";
import { SeverityBadge, severityBorderClass } from "./SeverityBadge";
import { isCritical, isMemoriaComparisonRule, isPass, isWarning } from "./parse-issue";

interface ApartadoReviewSectionProps {
  group: ApartadoReviewGroup;
  ejercicio?: number;
  ejercicioAnterior?: number;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  highlightText?: string;
  diffsOnly?: boolean;
}

function PassRow({ validacion }: { validacion: ValidacionView }) {
  return (
    <li className="flex items-start gap-2 py-1.5">
      <svg
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-700">{validacion.title ?? validacion.ruleId}</p>
      </div>
    </li>
  );
}

const STATUS_RING: Record<ApartadoReviewGroup["status"], string> = {
  critical: "border-red-200 bg-red-50/20",
  warning: "border-amber-200 bg-amber-50/20",
  ok: "border-emerald-200/80 bg-white",
};

function MemoriaDiffBadge({
  structuralCount,
  expectedCount,
  ejercicioAnterior,
}: {
  structuralCount: number;
  expectedCount: number;
  ejercicioAnterior?: number;
}) {
  if (structuralCount > 0) {
    const year = ejercicioAnterior !== undefined ? ` ${ejercicioAnterior}` : "";
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">
        {structuralCount} ruptura{structuralCount !== 1 ? "s" : ""} vs{year || " N-1"}
      </span>
    );
  }
  if (expectedCount > 0) {
    return (
      <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">
        Solo cifras / años
      </span>
    );
  }
  return null;
}

export function ApartadoReviewSection({
  group,
  ejercicio,
  ejercicioAnterior,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  highlightText,
  diffsOnly = false,
}: ApartadoReviewSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = controlledOpen ?? internalOpen;

  function setOpen(next: boolean) {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }

  const criticos = group.validations.filter(isCritical);
  const advertencias = group.validations.filter(isWarning);
  const superadas = group.validations.filter(isPass);
  const hasIssues = criticos.length > 0 || advertencias.length > 0;
  const [showPasses, setShowPasses] = useState(false);
  const hasCompare =
    Boolean(group.contenido?.trim()) || Boolean(group.contenidoAnterior?.trim());

  const { hasStructuralDiff, structuralCount, expectedCount } = group.memoriaDiff;
  const hasMemoriaRuleIssue = group.validations.some(
    (v) => (isCritical(v) || isWarning(v)) && isMemoriaComparisonRule(v.ruleId)
  );
  const emphasizeMemoriaDiff = hasStructuralDiff || hasMemoriaRuleIssue;

  const articleRing = emphasizeMemoriaDiff
    ? "ring-1 ring-red-300/60"
    : group.memoriaDiff.hasDiff
      ? "ring-1 ring-blue-200/80"
      : "";

  return (
    <article
      id={group.num === "general" ? "apartado-general" : `apartado-${group.num}`}
      data-apartado={group.num === "general" ? undefined : group.num}
      data-memoria-diff={emphasizeMemoriaDiff ? "structural" : group.memoriaDiff.hasDiff ? "expected" : undefined}
      className={`scroll-mt-4 overflow-hidden rounded-xl border ${STATUS_RING[group.status]} ${severityBorderClass(group.status)} border-l-4 ${articleRing}`}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex w-full items-start gap-3 px-4 py-3 text-left ${
          emphasizeMemoriaDiff ? "bg-red-50/30 hover:bg-red-50/50" : "hover:bg-white/60"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">{formatApartadoHeading(group)}</h2>
            <SeverityBadge level={group.status} />
            {group.memoriaDiff.hasDiff && (
              <MemoriaDiffBadge
                structuralCount={structuralCount}
                expectedCount={expectedCount}
                ejercicioAnterior={ejercicioAnterior}
              />
            )}
          </div>
          {hasIssues ? (
            <p className="mt-1 text-[11px] text-slate-500">
              {group.counts.critical > 0 && (
                <span className="font-medium text-red-600">
                  {group.counts.critical} crítico{group.counts.critical !== 1 ? "s" : ""}
                </span>
              )}
              {group.counts.critical > 0 && group.counts.warning > 0 && " · "}
              {group.counts.warning > 0 && (
                <span className="font-medium text-amber-600">
                  {group.counts.warning} advertencia{group.counts.warning !== 1 ? "s" : ""}
                </span>
              )}
              {emphasizeMemoriaDiff && (
                <>
                  {(group.counts.critical > 0 || group.counts.warning > 0) && " · "}
                  <span className="font-medium text-red-800">Ruptura lógica entre memorias</span>
                </>
              )}
            </p>
          ) : emphasizeMemoriaDiff ? (
            <p className="mt-1 text-[11px] font-medium text-red-800">
              Ruptura lógica respecto a la memoria del año anterior
            </p>
          ) : group.memoriaDiff.hasDiff ? (
            <p className="mt-1 text-[11px] text-blue-600">Solo cambian cifras o referencias de ejercicio</p>
          ) : (
            <p className="mt-1 text-[11px] text-emerald-600">Sin incidencias</p>
          )}
        </div>
        <span className="shrink-0 text-[11px] font-medium text-slate-500">
          {open ? "Ocultar" : "Ver"}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-200/80 bg-white px-4 py-4">
          {hasIssues && !diffsOnly && (
            <section className="space-y-2">
              {criticos.length > 0 && (
                <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/60 p-2.5">
                  {criticos.map((v) => (
                    <IssueCard key={v.id} validacion={v} variant="critical" embedded />
                  ))}
                </div>
              )}
              {advertencias.length > 0 && (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5">
                  {advertencias.map((v) => (
                    <IssueCard key={v.id} validacion={v} variant="warning" embedded />
                  ))}
                </div>
              )}
            </section>
          )}

          {hasCompare && (
            <section
              className={
                emphasizeMemoriaDiff
                  ? "rounded-xl border border-red-200/80 bg-red-50/20 p-3"
                  : undefined
              }
            >
              <h3
                className={`mb-2 text-[10px] font-semibold uppercase tracking-wide ${
                  emphasizeMemoriaDiff ? "text-red-900" : "text-slate-500"
                }`}
              >
                Comparativa con memoria anterior
                {emphasizeMemoriaDiff && structuralCount > 0 && (
                  <span className="ml-2 normal-case font-bold text-red-700">
                    · {structuralCount} ruptura{structuralCount !== 1 ? "s" : ""} lógica{structuralCount !== 1 ? "s" : ""}
                  </span>
                )}
              </h3>
              <ApartadoMemoriaCompare
                priorText={group.contenidoAnterior}
                currentText={group.contenido}
                ejercicioAnterior={ejercicioAnterior}
                ejercicioActual={ejercicio}
                highlightQuery={highlightText}
                diffsOnly={diffsOnly}
                emphasizeStructural={emphasizeMemoriaDiff}
              />
            </section>
          )}

          {superadas.length > 0 && !diffsOnly && (
            <section className="border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={() => setShowPasses(!showPasses)}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/80">
                  Validaciones OK ({superadas.length})
                </span>
                <span className="text-[11px] font-medium text-emerald-600">
                  {showPasses ? "Ocultar" : "Ver"}
                </span>
              </button>
              {showPasses && (
                <ul className="mt-2 divide-y divide-emerald-100/80">
                  {superadas.map((v) => (
                    <PassRow key={v.id} validacion={v} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </article>
  );
}
