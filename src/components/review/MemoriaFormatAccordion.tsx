"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileText,
  ShieldCheck,
} from "lucide-react";

/** Fragmento de texto en la vista comparativa. */
export type DiffSegmentType = "unchanged" | "removed" | "added" | "expected";

export interface DiffSegment {
  type: DiffSegmentType;
  text: string;
}

export type ApartadoFormatStatus = "ok" | "incidencia";

export interface FormatDiscrepancy {
  id: string;
  severity: "critical" | "warning";
  message: string;
}

export interface DiffLine {
  prior: DiffSegment[];
  current: DiffSegment[];
}

export interface MemoriaApartadoFormat {
  id: string;
  numero: string;
  titulo: string;
  status: ApartadoFormatStatus;
  discrepancies: FormatDiscrepancy[];
  diffLines: DiffLine[];
  priorYearLabel?: string;
  currentYearLabel?: string;
}

export interface MemoriaFormatAccordionProps {
  apartados: MemoriaApartadoFormat[];
  defaultOpenId?: string;
  onViewPriorMemoria?: (apartadoId: string) => void;
  onValidateApartado?: (apartadoId: string) => void;
  className?: string;
}

const SEGMENT_STYLES: Record<DiffSegmentType, string> = {
  unchanged: "text-slate-600",
  removed: "bg-red-50 text-red-800 line-through decoration-red-400/80",
  added: "bg-emerald-50 text-emerald-900",
  expected: "bg-blue-50/90 text-slate-700",
};

function StatusBadge({ status, count }: { status: ApartadoFormatStatus; count: number }) {
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        OK
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      {count} {count === 1 ? "Incidencia" : "Incidencias"}
    </span>
  );
}

function DiffLegend() {
  return (
    <div className="flex flex-wrap gap-3 border-b border-slate-100 px-3 py-2 text-[10px] text-slate-500">
      <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-sm bg-red-100 ring-1 ring-red-200" />
        Eliminado
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-sm bg-emerald-100 ring-1 ring-emerald-200" />
        Añadido
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-sm bg-blue-100 ring-1 ring-blue-200" />
        Cambio esperado (cifra / año)
      </span>
    </div>
  );
}

function DiffColumn({ segments }: { segments: DiffSegment[] }) {
  if (segments.length === 0) {
    return <span className="text-slate-300">—</span>;
  }
  return (
    <>
      {segments.map((s, i) => (
        <span key={i} className={`rounded px-0.5 ${SEGMENT_STYLES[s.type]}`}>
          {s.text}
        </span>
      ))}
    </>
  );
}

function DiffView({
  lines,
  priorLabel,
  currentLabel,
}: {
  lines: DiffLine[];
  priorLabel: string;
  currentLabel: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <DiffLegend />
      <div className="grid grid-cols-2 divide-x divide-slate-200 text-xs">
        <div className="bg-slate-50/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {priorLabel}
        </div>
        <div className="bg-slate-50/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {currentLabel}
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto font-mono text-[11px] leading-relaxed">
        {lines.map((line, lineIdx) => (
          <div
            key={lineIdx}
            className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-50 last:border-0"
          >
            <div className="whitespace-pre-wrap px-3 py-1.5">
              <DiffColumn segments={line.prior} />
            </div>
            <div className="whitespace-pre-wrap px-3 py-1.5">
              <DiffColumn segments={line.current} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApartadoFormatItem({
  apartado,
  isOpen,
  onToggle,
  onViewPriorMemoria,
  onValidateApartado,
}: {
  apartado: MemoriaApartadoFormat;
  isOpen: boolean;
  onToggle: () => void;
  onViewPriorMemoria?: (id: string) => void;
  onValidateApartado?: (id: string) => void;
}) {
  const hasIssues = apartado.status === "incidencia" && apartado.discrepancies.length > 0;
  const priorLabel = apartado.priorYearLabel ?? "Memoria año anterior";
  const currentLabel = apartado.currentYearLabel ?? "Memoria actual";

  return (
    <article
      className={`overflow-hidden rounded-xl border bg-white shadow-sm transition ${
        hasIssues ? "border-red-200/80" : "border-slate-200"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/80"
        aria-expanded={isOpen}
      >
        <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900">
            {apartado.numero}. {apartado.titulo}
          </h3>
        </div>
        <StatusBadge status={apartado.status} count={apartado.discrepancies.length} />
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {isOpen && (
        <div className="space-y-4 border-t border-slate-100 px-4 py-4">
          {hasIssues ? (
            <ul className="space-y-2">
              {apartado.discrepancies.map((d) => (
                <li
                  key={d.id}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                    d.severity === "critical"
                      ? "border-red-200 bg-red-50/70 text-red-900"
                      : "border-amber-200 bg-amber-50/70 text-amber-900"
                  }`}
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{d.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
              Formato validado — solo se detectaron cambios esperados de cifras y ejercicio.
            </p>
          )}

          <DiffView lines={apartado.diffLines} priorLabel={priorLabel} currentLabel={currentLabel} />

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => onViewPriorMemoria?.(apartado.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Ver memoria anterior
            </button>
            <button
              type="button"
              onClick={() => onValidateApartado?.(apartado.id)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-slate-800"
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Validar apartado
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export function MemoriaFormatAccordion({
  apartados,
  defaultOpenId,
  onViewPriorMemoria,
  onValidateApartado,
  className = "",
}: MemoriaFormatAccordionProps) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? apartados[0]?.id ?? null);

  return (
    <div className={`space-y-2 ${className}`}>
      {apartados.map((apartado) => (
        <ApartadoFormatItem
          key={apartado.id}
          apartado={apartado}
          isOpen={openId === apartado.id}
          onToggle={() => setOpenId((prev) => (prev === apartado.id ? null : apartado.id))}
          onViewPriorMemoria={onViewPriorMemoria}
          onValidateApartado={onValidateApartado}
        />
      ))}
    </div>
  );
}

/** Datos de demostración para desarrollo y Storybook. */
export const MOCK_MEMORIA_FORMAT_APARTADOS: MemoriaApartadoFormat[] = [
  {
    id: "ap-01",
    numero: "01",
    titulo: "Actividad de la empresa",
    status: "ok",
    discrepancies: [],
    priorYearLabel: "Memoria 2024",
    currentYearLabel: "Memoria 2025",
    diffLines: [
      {
        prior: [
          { type: "unchanged", text: "La sociedad desarrolla su actividad principal en el sector inmobiliario durante el ejercicio " },
          { type: "expected", text: "2024" },
          { type: "unchanged", text: "." },
        ],
        current: [
          { type: "unchanged", text: "La sociedad desarrolla su actividad principal en el sector inmobiliario durante el ejercicio " },
          { type: "expected", text: "2025" },
          { type: "unchanged", text: "." },
        ],
      },
      {
        prior: [
          { type: "unchanged", text: "El importe de ingresos asciende a " },
          { type: "expected", text: "1.245.600,00 €" },
          { type: "unchanged", text: "." },
        ],
        current: [
          { type: "unchanged", text: "El importe de ingresos asciende a " },
          { type: "expected", text: "1.387.200,00 €" },
          { type: "unchanged", text: "." },
        ],
      },
      {
        prior: [
          { type: "unchanged", text: "El empleo medio del ejercicio ha sido de " },
          { type: "expected", text: "12" },
          { type: "unchanged", text: " personas." },
        ],
        current: [
          { type: "unchanged", text: "El empleo medio del ejercicio ha sido de " },
          { type: "expected", text: "14" },
          { type: "unchanged", text: " personas." },
        ],
      },
    ],
  },
  {
    id: "ap-05",
    numero: "05",
    titulo: "Inmovilizado material",
    status: "incidencia",
    priorYearLabel: "Memoria 2024",
    currentYearLabel: "Memoria 2025",
    discrepancies: [
      {
        id: "d-1",
        severity: "critical",
        message:
          "Falta el párrafo de política de amortización que sí figuraba en la memoria del ejercicio anterior.",
      },
      {
        id: "d-2",
        severity: "warning",
        message:
          "La tabla de movimientos no incluye la fila «Adquisiciones mediante combinaciones de negocio» presente en N-1.",
      },
    ],
    diffLines: [
      {
        prior: [
          {
            type: "unchanged",
            text: "El inmovilizado material se valora por el coste de adquisición menos la amortización acumulada.",
          },
        ],
        current: [
          {
            type: "unchanged",
            text: "El inmovilizado material se valora por el coste de adquisición menos la amortización acumulada.",
          },
        ],
      },
      {
        prior: [
          {
            type: "removed",
            text: "La política de amortización aplicada consiste en distribuir el importe amortizable de forma lineal a lo largo de la vida útil estimada de cada elemento.",
          },
        ],
        current: [],
      },
      {
        prior: [
          { type: "unchanged", text: "Saldo inicial bruto | " },
          { type: "expected", text: "755.430,89" },
          { type: "unchanged", text: " | 755.430,89" },
        ],
        current: [
          { type: "unchanged", text: "Saldo inicial bruto | " },
          { type: "expected", text: "667.276,98" },
          { type: "unchanged", text: " | " },
          { type: "expected", text: "755.430,89" },
        ],
      },
    ],
  },
];

/** Vista de demostración autocontenida (útil en páginas de prueba). */
export function MemoriaFormatAccordionDemo() {
  return (
    <MemoriaFormatAccordion
      apartados={MOCK_MEMORIA_FORMAT_APARTADOS}
      defaultOpenId="ap-05"
      onViewPriorMemoria={(id) => console.info("Ver memoria anterior:", id)}
      onValidateApartado={(id) => console.info("Validar apartado:", id)}
    />
  );
}
