"use client";

import { useMemo } from "react";
import {
  buildLineComparison,
  filterChangedLines,
  isStructuralDiffKind,
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
  /** Solo filas con cambios (sin líneas idénticas). */
  diffsOnly?: boolean;
  /** Resalta con más fuerza las filas con cambio estructural (texto distinto). */
  emphasizeStructural?: boolean;
}

const TEXT_STYLES: Record<LineDiffKind, { prior: string; current: string }> = {
  unchanged: { prior: "text-slate-600", current: "text-slate-600" },
  expected: { prior: "text-slate-700", current: "text-slate-700" },
  structural: { prior: "text-red-900", current: "text-emerald-900" },
  removed: { prior: "text-red-900", current: "" },
  added: { prior: "", current: "text-emerald-900" },
};

const TEXT_STYLES_EMPHASIZED: Record<LineDiffKind, { prior: string; current: string }> = {
  unchanged: { prior: "text-slate-600", current: "text-slate-600" },
  expected: { prior: "text-slate-700", current: "text-slate-700" },
  structural: { prior: "font-medium text-red-950", current: "font-medium text-emerald-950" },
  removed: { prior: "font-medium text-red-950", current: "" },
  added: { prior: "", current: "font-medium text-emerald-950" },
};

const CELL_BG: Record<LineDiffKind, { prior: string; current: string }> = {
  unchanged: { prior: "bg-white", current: "bg-white" },
  expected: { prior: "bg-blue-50/80", current: "bg-blue-50/80" },
  structural: { prior: "bg-red-50", current: "bg-emerald-50" },
  removed: { prior: "bg-red-50", current: "bg-white" },
  added: { prior: "bg-white", current: "bg-emerald-50" },
};

const CELL_BG_EMPHASIZED: Record<LineDiffKind, { prior: string; current: string }> = {
  unchanged: { prior: "bg-white", current: "bg-white" },
  expected: { prior: "bg-blue-50/80", current: "bg-blue-50/80" },
  structural: {
    prior: "bg-red-100 ring-2 ring-inset ring-red-400/60",
    current: "bg-emerald-100 ring-2 ring-inset ring-emerald-400/60",
  },
  removed: {
    prior: "bg-red-100 border-l-4 border-red-500",
    current: "bg-violet-50/40",
  },
  added: {
    prior: "bg-violet-50/40",
    current: "bg-emerald-100 border-l-4 border-emerald-500",
  },
};

const CELL_BASE = "min-h-[1.75rem] whitespace-pre-wrap break-words px-3 py-1.5 font-mono";

function DiffText({
  text,
  kind,
  side,
  highlightQuery,
  emphasized,
}: {
  text: string;
  kind: LineDiffKind;
  side: "prior" | "current";
  highlightQuery?: string;
  emphasized?: boolean;
}) {
  const palette = emphasized && isStructuralDiffKind(kind) ? TEXT_STYLES_EMPHASIZED : TEXT_STYLES;
  const style = palette[kind][side];
  if (!style || !text.trim()) return null;

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

function DiffRow({
  line,
  highlightQuery,
  emphasizeStructural,
}: {
  line: ComparedLine;
  highlightQuery?: string;
  emphasizeStructural?: boolean;
}) {
  const priorEmpty = line.kind === "added" || !line.prior.trim();
  const currentEmpty = line.kind === "removed" || !line.current.trim();
  const emphasized = Boolean(emphasizeStructural && isStructuralDiffKind(line.kind));
  const bg = emphasized ? CELL_BG_EMPHASIZED : CELL_BG;
  const rowBorder = emphasized ? "border-b border-violet-200/80" : "border-b border-slate-50";

  return (
    <div className="contents">
      <div className={`${CELL_BASE} ${rowBorder} ${bg[line.kind].prior}`}>
        {!priorEmpty && (
          <DiffText
            text={line.prior}
            kind={line.kind}
            side="prior"
            highlightQuery={highlightQuery}
            emphasized={emphasized}
          />
        )}
      </div>
      <div className={`${CELL_BASE} ${rowBorder} ${bg[line.kind].current}`}>
        {!currentEmpty && (
          <DiffText
            text={line.current}
            kind={line.kind}
            side="current"
            highlightQuery={highlightQuery}
            emphasized={emphasized}
          />
        )}
      </div>
    </div>
  );
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
  emptyMessage,
  emphasizeStructural,
}: {
  lines: ComparedLine[];
  priorLabel: string;
  currentLabel: string;
  highlightQuery?: string;
  emptyMessage?: string;
  emphasizeStructural?: boolean;
}) {
  if (lines.length === 0 && emptyMessage) {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-lg border bg-white shadow-sm ${
        emphasizeStructural ? "border-violet-300 ring-2 ring-violet-300/40" : "border-slate-200"
      }`}
    >
      <CompareLegend />
      <div className="grid grid-cols-2 divide-x divide-slate-200 border-b border-slate-100 bg-slate-50/90 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        <div className="px-3 py-2">{priorLabel}</div>
        <div className="px-3 py-2">{currentLabel}</div>
      </div>
      <div className="grid max-h-[28rem] grid-cols-2 auto-rows-min divide-x divide-slate-100 overflow-y-auto text-[11px] leading-relaxed">
        {lines.map((line, i) => (
          <DiffRow
            key={i}
            line={line}
            highlightQuery={highlightQuery}
            emphasizeStructural={emphasizeStructural}
          />
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
  diffsOnly = false,
  emphasizeStructural = false,
}: ApartadoMemoriaCompareProps) {
  const lines = useMemo(() => {
    if (!priorText?.trim() || !currentText?.trim()) return [];
    const all = buildLineComparison(priorText, currentText);
    return diffsOnly ? filterChangedLines(all) : all;
  }, [priorText, currentText, diffsOnly]);

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

  const soloEsperado =
    !diffsOnly && lines.length > 0 && lines.every((l) => l.kind === "unchanged" || l.kind === "expected");

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
        emphasizeStructural={emphasizeStructural}
        emptyMessage={
          diffsOnly ? "Sin diferencias textuales respecto al año anterior." : undefined
        }
      />
    </div>
  );
}