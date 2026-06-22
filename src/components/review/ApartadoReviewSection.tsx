"use client";

import { useEffect, useState } from "react";
import type { ApartadoReviewGroup } from "./group-by-apartado";
import { formatApartadoHeading } from "./group-by-apartado";
import type { ValidacionView } from "./types";
import { HighlightText } from "./HighlightText";
import { IssueCard } from "./IssueCard";
import { SeverityBadge, severityBorderClass } from "./SeverityBadge";
import { isCritical, isPass, isWarning } from "./parse-issue";

interface ApartadoReviewSectionProps {
  group: ApartadoReviewGroup;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  highlightText?: string;
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
        <p className="text-xs font-medium text-slate-800">
          {validacion.title ?? validacion.ruleId}
        </p>
        {(validacion.explanation ?? validacion.mensaje) && (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">
            {validacion.explanation ?? validacion.mensaje}
          </p>
        )}
      </div>
    </li>
  );
}

const STATUS_RING: Record<ApartadoReviewGroup["status"], string> = {
  critical: "border-red-200 bg-red-50/30",
  warning: "border-amber-200 bg-amber-50/30",
  ok: "border-emerald-200 bg-emerald-50/20",
};

export function ApartadoReviewSection({
  group,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  highlightText,
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
  const [showPasses, setShowPasses] = useState(!hasIssues);

  return (
    <article
      id={group.num === "general" ? "apartado-general" : `apartado-${group.num}`}
      data-apartado={group.num === "general" ? undefined : group.num}
      className={`scroll-mt-4 overflow-hidden rounded-xl border ${STATUS_RING[group.status]} ${severityBorderClass(group.status)} border-l-4`}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-white/60"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">{formatApartadoHeading(group)}</h2>
            <SeverityBadge level={group.status} />
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {group.counts.critical > 0 && (
              <span className="text-red-600">{group.counts.critical} error{group.counts.critical !== 1 ? "es" : ""}</span>
            )}
            {group.counts.critical > 0 && group.counts.warning > 0 && " · "}
            {group.counts.warning > 0 && (
              <span className="text-amber-600">
                {group.counts.warning} advertencia{group.counts.warning !== 1 ? "s" : ""}
              </span>
            )}
            {(group.counts.critical > 0 || group.counts.warning > 0) && group.counts.pass > 0 && " · "}
            {group.counts.pass > 0 && (
              <span className="text-emerald-600">
                {group.counts.pass} OK
              </span>
            )}
            {group.validations.length === 0 && (
              <span className="text-emerald-600">Sin incidencias detectadas</span>
            )}
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-medium text-slate-500">
          {open ? "Ocultar" : "Ver"}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-200/80 bg-white/70 px-4 py-3">
          {group.contenido !== undefined && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Contenido de la memoria
              </h3>
              {group.contenido ? (
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                  <HighlightText text={group.contenido} query={highlightText} />
                </p>
              ) : (
                <p className="mt-2 text-xs italic text-slate-400">Sin contenido detectado</p>
              )}
            </section>
          )}

          {hasIssues && (
            <section className="space-y-1.5">
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Análisis
              </h3>
              {criticos.map((v) => (
                <IssueCard key={v.id} validacion={v} variant="critical" />
              ))}
              {advertencias.map((v) => (
                <IssueCard key={v.id} validacion={v} variant="warning" />
              ))}
            </section>
          )}

          {superadas.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setShowPasses(!showPasses)}
                className="flex w-full items-center justify-between text-left"
              >
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                  Validaciones superadas ({superadas.length})
                </h3>
                <span className="text-[11px] font-medium text-emerald-600">
                  {showPasses ? "Ocultar" : "Ver"}
                </span>
              </button>
              {showPasses && (
                <ul className="mt-2 divide-y divide-emerald-100/80 rounded-lg border border-emerald-100 bg-emerald-50/30 px-3">
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
