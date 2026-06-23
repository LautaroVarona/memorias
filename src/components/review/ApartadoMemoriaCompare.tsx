"use client";

import { useMemo } from "react";
import {
  buildLineComparison,
  tokenizeForHighlight,
  type ComparedLine,
  type LineDiffKind,
} from "./apartado-line-diff";

interface ApartadoMemoriaCompareProps {
  priorText?: string;
  currentText?: string;
  ejercicioAnterior?: number;
  ejercicioActual?: number;
  highlightQuery?: string;
}

const ROW_STYLES: Record<LineDiffKind, { prior: string; current: string }> = {
  unchanged: { prior: "bg-white text-slate-600", current: "bg-white text-slate-600" },
  expected: { prior: "bg-blue-50/80 text-slate-700", current: "bg-blue-50/80 text-slate-700" },
  structural: { prior: "bg-red-50 text-red-900", current: "bg-emerald-50 text-emerald-900" },
  removed: { prior: "bg-red-50 text-red-800 line-through decoration-red-300", current: "bg-slate-50 text-slate-300" },
  added: { prior: "bg-slate-50 text-slate-300", current: "bg-emerald-50 text-emerald-900" },
};

function LineCell({
  text,
  kind,
  side,
  highlightQuery,
}: {
  text: string;
  kind: LineDiffKind;
  side: "prior" | "current";
  highlightQuery?: string;
}) {
  const style = ROW_STYLES[kind][side];

  if (!text.trim()) {
    return <span className="text-slate-300">—</span>;
  }

  if (kind === "expected") {
    return (
      <span className={style}>
        {tokenizeForHighlight(text).map((p) =>
          p.expected ? (
            <span key={p.key} className="rounded bg-blue-100/90 px-0.5 font-medium text-blue-900">
              {p.text}
            </span>
          ) : (
            <span key={p.key}>{p.text}</span>
          )
        )}
      </span>
    );
  }

  if (highlightQuery && highlightQuery.length >= 3 && text.toLowerCase().includes(highlightQuery.toLowerCase())) {
    const idx = text.toLowerCase().indexOf(highlightQuery.toLowerCase());
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + highlightQuery.length);
    const after = text.slice(idx + highlightQuery.length);
    return (
      <span className={style}>
        {before}
        <mark className="rounded bg-amber-200 px-0.5">{match}</mark>
        {after}
      </span>
    );
  }

  return <span className={style}>{text}</span>;
}

function CompareLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-slate-100 px-3 py-2 text-[10px] text-slate-500">
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-4 rounded-sm bg-red-100 ring-1 ring-red-200" />
        Eliminado / cambio estructural
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-4 rounded-sm bg-emerald-100 ring-1 ring-emerald-200" />
        Añadido
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-4 rounded-sm bg-blue-100 ring-1 ring-blue-200" />
        Cambio esperado (cifra / año)
      </span>
    </div>
  );
}

function CompareGrid({
  lines,
  priorLabel,
  currentLabel,
  highlightQuery,
}: {
  lines: ComparedLine[];
  priorLabel: string;
  currentLabel: string;
  highlightQuery?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <CompareLegend />
      <div className="grid grid-cols-2 divide-x divide-slate-200 border-b border-slate-100 bg-slate-50/90 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        <div className="px-3 py-2">{priorLabel}</div>
        <div className="px-3 py-2">{currentLabel}</div>
      </div>
      <div className="max-h-[28rem] overflow-y-auto text-[11px] leading-relaxed">
        {lines.map((line, i) => (
          <div
            key={i}
            className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-50 font-mono last:border-0"
          >
            <pre className="whitespace-pre-wrap break-words px-3 py-1.5">
              <LineCell text={line.prior} kind={line.kind} side="prior" highlightQuery={highlightQuery} />
            </pre>
            <pre className="whitespace-pre-wrap break-words px-3 py-1.5">
              <LineCell text={line.current} kind={line.kind} side="current" highlightQuery={highlightQuery} />
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ApartadoMemoriaCompare({
  priorText,
  currentText,
  ejercicioAnterior,
  ejercicioActual,
  highlightQuery,
}: ApartadoMemoriaCompareProps) {
  const lines = useMemo(() => {
    if (!priorText?.trim() || !currentText?.trim()) return [];
    return buildLineComparison(priorText, currentText);
  }, [priorText, currentText]);

  const priorLabel =
    ejercicioAnterior !== undefined ? `Memoria ${ejercicioAnterior}` : "Memoria año anterior";
  const currentLabel =
    ejercicioActual !== undefined ? `Memoria ${ejercicioActual}` : "Memoria actual";

  if (!priorText?.trim()) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
        <p className="text-sm text-slate-600">
          No hay memoria del ejercicio anterior cargada para comparar este apartado.
        </p>
        {currentText?.trim() && (
          <pre className="mt-4 max-h-64 overflow-y-auto whitespace-pre-wrap text-left text-xs text-slate-500">
            {currentText}
          </pre>
        )}
      </div>
    );
  }

  if (!currentText?.trim()) {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm italic text-slate-500">
        Sin contenido detectado en la memoria actual.
      </p>
    );
  }

  const soloEsperado = lines.length > 0 && lines.every((l) => l.kind === "unchanged" || l.kind === "expected");

  return (
    <div className="space-y-2">
      {soloEsperado && (
        <p className="text-xs text-emerald-700">
          Formato coherente con el año anterior — solo cambian cifras o referencias de ejercicio.
        </p>
      )}
      <CompareGrid
        lines={lines}
        priorLabel={priorLabel}
        currentLabel={currentLabel}
        highlightQuery={highlightQuery}
      />
    </div>
  );
}
