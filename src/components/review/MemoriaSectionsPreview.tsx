"use client";

import type { ApartadoMemoria } from "@/types/domain";
import { CollapsibleSection } from "./CollapsibleSection";

interface MemoriaSectionsPreviewProps {
  sections: ApartadoMemoria[];
  ejercicio?: number;
}

export function MemoriaSectionsPreview({ sections, ejercicio }: MemoriaSectionsPreviewProps) {
  if (sections.length === 0) return null;

  return (
    <CollapsibleSection
      title={`Memoria${ejercicio ? ` ${ejercicio}` : ""} — apartados detectados`}
      count={sections.length}
      variant="neutral"
      defaultOpen={false}
    >
      <div id="memoria-apartados" className="scroll-mt-6 space-y-3">
        {sections.map((sec) => {
          const num = sec.numero !== undefined ? String(sec.numero).padStart(2, "0") : sec.id;
          return (
            <section
              key={`${num}-${sec.titulo}`}
              id={`apartado-${num}`}
              data-apartado={num}
              className="scroll-mt-24 rounded-lg border border-slate-100 bg-slate-50/50 p-3 transition"
            >
              <h4 className="text-sm font-semibold text-slate-800">
                {sec.numero !== undefined ? `${String(sec.numero).padStart(2, "0")}. ` : ""}
                {sec.titulo}
              </h4>
              {sec.contenido ? (
                <p className="mt-1 line-clamp-4 text-xs leading-relaxed text-slate-600">
                  {sec.contenido.slice(0, 600)}
                  {sec.contenido.length > 600 ? "…" : ""}
                </p>
              ) : (
                <p className="mt-1 text-xs italic text-slate-400">Sin contenido detectado</p>
              )}
            </section>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
