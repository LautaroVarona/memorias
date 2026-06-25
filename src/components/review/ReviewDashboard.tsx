"use client";

import { useState } from "react";
import type { ApartadoMemoria } from "@/types/domain";
import type { ValidacionView } from "./types";
import { ApartadoReviewPanel } from "./ApartadoReviewPanel";
import { DocumentsBlock } from "./DocumentsBlock";
import type { SeverityFilter } from "./group-by-apartado";

interface ArchivoDoc {
  id: string;
  nombre: string;
  tipo: string;
  metadata?: string;
}

interface ReviewDashboardProps {
  ejercicio: number;
  archivos: ArchivoDoc[];
  validaciones: ValidacionView[];
  memoriaSections?: ApartadoMemoria[];
  priorMemoriaSections?: ApartadoMemoria[];
  ejercicioComparativaActual?: number;
  ejercicioComparativaAnterior?: number;
}

export function ReviewDashboard({
  ejercicio,
  archivos,
  validaciones,
  memoriaSections,
  priorMemoriaSections,
  ejercicioComparativaActual,
  ejercicioComparativaAnterior,
}: ReviewDashboardProps) {
  const byApartado = (memoriaSections?.length ?? 0) > 0;
  const [incidentFilter, setIncidentFilter] = useState<SeverityFilter>("all");
  const [scrollTick] = useState(0);

  return (
    <div className="space-y-4">
      <DocumentsBlock archivos={archivos} ejercicio={ejercicio} />

      {byApartado ? (
        <ApartadoReviewPanel
          sections={memoriaSections!}
          priorSections={priorMemoriaSections}
          ejercicio={ejercicioComparativaActual ?? ejercicio}
          ejercicioAnterior={
            ejercicioComparativaAnterior ?? (ejercicio > 0 ? ejercicio - 1 : undefined)
          }
          validaciones={validaciones}
          filter={incidentFilter}
          onFilterChange={setIncidentFilter}
          scrollToFirstTick={scrollTick}
        />
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No se han podido extraer apartados comparables. La revisión se muestra únicamente por apartado cuando la memoria está estructurada por secciones.
        </p>
      )}
    </div>
  );
}
