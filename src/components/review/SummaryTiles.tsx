"use client";

interface SummaryTilesProps {
  criticos: number;
  warnings: number;
  onScrollTo?: (section: "critical" | "warnings") => void;
}

export function SummaryTiles({ criticos, warnings, onScrollTo }: SummaryTilesProps) {
  if (criticos === 0 && warnings === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => onScrollTo?.("critical")}
        disabled={criticos === 0}
        className="group rounded-xl border border-red-100 bg-red-50/50 p-5 text-left transition hover:border-red-200 hover:bg-red-50 disabled:cursor-default disabled:opacity-40"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-red-600">
          Errores críticos
        </p>
        <p className="mt-2 text-4xl font-bold tabular-nums text-red-700">{criticos}</p>
        {criticos > 0 && (
          <p className="mt-2 text-xs text-red-500 opacity-0 transition group-hover:opacity-100">
            Ver detalle ↓
          </p>
        )}
      </button>

      <button
        type="button"
        onClick={() => onScrollTo?.("warnings")}
        disabled={warnings === 0}
        className="group rounded-xl border border-amber-100 bg-amber-50/50 p-5 text-left transition hover:border-amber-200 hover:bg-amber-50 disabled:cursor-default disabled:opacity-40"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
          Advertencias
        </p>
        <p className="mt-2 text-4xl font-bold tabular-nums text-amber-700">{warnings}</p>
        {warnings > 0 && (
          <p className="mt-2 text-xs text-amber-500 opacity-0 transition group-hover:opacity-100">
            Ver detalle ↓
          </p>
        )}
      </button>
    </div>
  );
}
