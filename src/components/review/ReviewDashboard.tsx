"use client";

import type { ApartadoMemoria } from "@/types/domain";
import type { GlobalEstado } from "@/types/case-data";
import type { ValidacionView } from "./types";
import { ApartadoReviewPanel } from "./ApartadoReviewPanel";
import { CollapsibleSection } from "./CollapsibleSection";
import { DocumentsBlock } from "./DocumentsBlock";
import { ExpedienteHeader } from "./ExpedienteHeader";
import { IssueCard } from "./IssueCard";
import {
  filterConflictingPasses,
  isCritical,
  isInterannualStatOnly,
  isPass,
  isWarning,
} from "./parse-issue";

interface ArchivoDoc {
  id: string;
  nombre: string;
  tipo: string;
  metadata?: string;
}

interface ReviewDashboardProps {
  cliente: string;
  ejercicio: number;
  tipoEmpresa?: string | null;
  archivos: ArchivoDoc[];
  validaciones: ValidacionView[];
  memoriaSections?: ApartadoMemoria[];
  score?: number;
  estado?: GlobalEstado | "critico";
  motivoGlobal?: string;
  errores: number;
  warnings: number;
}

export function ReviewDashboard({
  cliente,
  ejercicio,
  tipoEmpresa,
  archivos,
  validaciones,
  memoriaSections,
  score,
  estado,
  motivoGlobal,
  errores,
  warnings,
}: ReviewDashboardProps) {
  const filtered = filterConflictingPasses(validaciones);
  const criticos = filtered.filter(isCritical).filter((v) => !isInterannualStatOnly(v.ruleId));
  const advertencias = filtered.filter(isWarning).filter((v) => !isInterannualStatOnly(v.ruleId));
  const superadas = filtered.filter(isPass).filter((v) => !isInterannualStatOnly(v.ruleId));
  const byApartado = (memoriaSections?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <ExpedienteHeader
        cliente={cliente}
        ejercicio={ejercicio}
        tipoEmpresa={tipoEmpresa}
        score={score}
        estado={estado}
        motivoGlobal={motivoGlobal}
        errores={errores}
        warnings={warnings}
      />

      <DocumentsBlock archivos={archivos} ejercicio={ejercicio} />

      {byApartado ? (
        <>
          <p className="text-[11px] text-slate-500">
            Revisión organizada por apartado. Cada bloque muestra el contenido de la memoria y el
            análisis correspondiente. Use los filtros para ver solo apartados con errores,
            advertencias o sin incidencias.
          </p>
          <ApartadoReviewPanel sections={memoriaSections!} validaciones={validaciones} />
        </>
      ) : (
        <>
          {(criticos.length > 0 || advertencias.length > 0) && (
            <p className="text-[11px] text-slate-500">
              Cada incidencia enlaza al apartado en la memoria cuando está disponible.
            </p>
          )}

          {criticos.length > 0 && (
            <section id="errores-criticos" className="scroll-mt-4 space-y-1.5">
              <h2 className="text-[10px] font-semibold uppercase tracking-wide text-red-600/90">
                Errores ({criticos.length})
              </h2>
              <div className="space-y-1.5">
                {criticos.map((v) => (
                  <IssueCard key={v.id} validacion={v} variant="critical" />
                ))}
              </div>
            </section>
          )}

          {advertencias.length > 0 && (
            <section id="advertencias" className="scroll-mt-4 space-y-1.5">
              <h2 className="text-[10px] font-semibold uppercase tracking-wide text-amber-600/90">
                Advertencias ({advertencias.length})
              </h2>
              <div className="space-y-1.5">
                {advertencias.map((v) => (
                  <IssueCard key={v.id} validacion={v} variant="warning" />
                ))}
              </div>
            </section>
          )}

          {superadas.length > 0 && (
            <CollapsibleSection
              title={`${superadas.length} validaciones superadas`}
              count={superadas.length}
              variant="ok"
            >
              <ul className="divide-y divide-emerald-100/80">
                {superadas.map((v) => (
                  <li key={v.id} className="flex items-center gap-2 py-1">
                    <svg
                      className="h-3.5 w-3.5 shrink-0 text-emerald-600"
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
                    <span className="truncate text-xs text-slate-700">
                      {v.title ?? v.ruleId}
                    </span>
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}

          {criticos.length === 0 && advertencias.length === 0 && superadas.length > 0 && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-8 text-center">
              <p className="text-lg font-semibold text-emerald-800">Revisión sin incidencias</p>
              <p className="mt-1 text-sm text-emerald-600">
                Todas las validaciones aplicables han superado la revisión.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
