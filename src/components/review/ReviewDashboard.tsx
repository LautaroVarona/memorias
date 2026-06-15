"use client";

import { useRef } from "react";
import type { GlobalEstado } from "@/types/case-data";
import type { ValidacionView } from "./types";
import { CollapsibleSection } from "./CollapsibleSection";
import { DocumentsBlock } from "./DocumentsBlock";
import { ExpedienteHeader } from "./ExpedienteHeader";
import { InterannualBars } from "./InterannualBars";
import { IssueCard } from "./IssueCard";
import {
  filterConflictingPasses,
  isCritical,
  isPass,
  isWarning,
} from "./parse-issue";
import { SummaryTiles } from "./SummaryTiles";

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
  score,
  estado,
  motivoGlobal,
  errores,
  warnings,
}: ReviewDashboardProps) {
  const criticalRef = useRef<HTMLElement>(null);
  const warningsRef = useRef<HTMLElement>(null);

  const filtered = filterConflictingPasses(validaciones);
  // Las reglas INTER_* se muestran solo en el bloque interanual
  const criticos = filtered.filter(isCritical).filter((v) => !v.ruleId.startsWith("INTER_"));
  const advertencias = filtered.filter(isWarning).filter((v) => !v.ruleId.startsWith("INTER_"));
  const superadas = filtered.filter(isPass).filter((v) => !v.ruleId.startsWith("INTER_"));

  function scrollTo(section: "critical" | "warnings") {
    const ref = section === "critical" ? criticalRef : warningsRef;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-6">
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

      <SummaryTiles
        criticos={criticos.length}
        warnings={advertencias.length}
        onScrollTo={scrollTo}
      />

      <DocumentsBlock archivos={archivos} ejercicio={ejercicio} />

      {criticos.length > 0 && (
        <section ref={criticalRef} id="errores-criticos" className="scroll-mt-6 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-red-600">
            Errores críticos ({criticos.length})
          </h2>
          <div className="space-y-4">
            {criticos.map((v) => (
              <IssueCard key={v.id} validacion={v} variant="critical" />
            ))}
          </div>
        </section>
      )}

      {advertencias.length > 0 && (
        <section ref={warningsRef} id="advertencias" className="scroll-mt-6 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-600">
            Advertencias ({advertencias.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {advertencias.map((v) => (
              <IssueCard key={v.id} validacion={v} variant="warning" />
            ))}
          </div>
        </section>
      )}

      <InterannualBars validaciones={validaciones} />

      {superadas.length > 0 && (
        <CollapsibleSection
          title={`✅ ${superadas.length} validaciones superadas`}
          count={superadas.length}
          variant="ok"
        >
          <ul className="space-y-2">
            {superadas.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50/30 px-4 py-2.5 text-sm"
              >
                <span className="font-medium text-emerald-900">
                  {v.title ?? v.ruleId}
                </span>
                <span className="text-xs text-emerald-600">Superada</span>
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
    </div>
  );
}
