"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApartadoMemoria } from "@/types/domain";
import { HighlightText } from "./HighlightText";
import { subscribeMemoriaNavigate, type MemoriaNavigateTarget } from "./memoria-navigator";

interface MemoriaViewerProps {
  sections: ApartadoMemoria[];
  ejercicio?: number;
  fileName?: string;
  downloadUrl?: string;
  paginas?: number;
}

function apartadoId(sec: ApartadoMemoria): string {
  return sec.numero !== undefined ? String(sec.numero).padStart(2, "0") : sec.id;
}

function focusApartado(
  container: HTMLElement | null,
  apartado: string,
  highlightText?: string
): void {
  const normalized = apartado.replace(/\D/g, "").padStart(2, "0");
  const selectors = [
    `#apartado-${normalized}`,
    `[data-apartado="${normalized}"]`,
    `#apartado-${parseInt(normalized, 10)}`,
  ];

  let target: HTMLElement | null = null;
  for (const sel of selectors) {
    target = container?.querySelector(sel) ?? document.querySelector(sel);
    if (target) break;
  }

  if (!target) return;

  if (container) {
    const top =
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      12;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  } else {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  target.classList.add("ring-2", "ring-amber-400", "ring-offset-2", "bg-amber-50/60");
  window.setTimeout(() => {
    target?.classList.remove("ring-2", "ring-amber-400", "ring-offset-2", "bg-amber-50/60");
  }, 2800);

  if (highlightText && highlightText.length >= 3) {
    const mark = target.querySelector("mark");
    mark?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

export function MemoriaViewer({
  sections,
  ejercicio,
  fileName,
  downloadUrl,
  paginas,
}: MemoriaViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeApartado, setActiveApartado] = useState<string | undefined>();
  const [highlightText, setHighlightText] = useState<string | undefined>();

  const handleNavigate = useCallback((target: MemoriaNavigateTarget) => {
    if (target.apartado) {
      setActiveApartado(target.apartado);
      setHighlightText(target.highlightText);
      window.requestAnimationFrame(() => {
        focusApartado(scrollRef.current, target.apartado!, target.highlightText);
      });
    }
  }, []);

  useEffect(() => subscribeMemoriaNavigate(handleNavigate), [handleNavigate]);

  if (sections.length === 0) return null;

  return (
    <section
      id="memoria-viewer-panel"
      className="flex max-h-[calc(100vh-5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <header className="shrink-0 border-b border-slate-100 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">
              Memoria{ejercicio ? ` ${ejercicio}` : ""}
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Vista del texto extraído del Word · {sections.length} apartados
              {paginas ? ` · ${paginas} páginas` : ""}
            </p>
            {fileName && (
              <p className="mt-1 truncate text-[11px] text-slate-400" title={fileName}>
                {fileName}
              </p>
            )}
          </div>
          {downloadUrl && (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
            >
              Abrir Word original
            </a>
          )}
        </div>
        <p className="mt-2 text-[10px] text-blue-700">
          Haz clic en un error o en «Ap. XX» para saltar al apartado correspondiente.
        </p>
      </header>

      <div
        ref={scrollRef}
        id="memoria-apartados"
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
      >
        <div className="space-y-4">
          {sections.map((sec) => {
            const num = apartadoId(sec);
            const isActive = activeApartado === num;

            return (
              <section
                key={`${num}-${sec.titulo}`}
                id={`apartado-${num}`}
                data-apartado={num}
                className={`scroll-mt-4 rounded-lg border border-slate-100 bg-slate-50/40 p-3 transition ${
                  isActive ? "border-amber-200" : ""
                }`}
              >
                <h3 className="text-sm font-semibold text-slate-800">
                  {sec.numero !== undefined ? `${String(sec.numero).padStart(2, "0")}. ` : ""}
                  {sec.titulo}
                </h3>
                {sec.contenido ? (
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                    <HighlightText
                      text={sec.contenido}
                      query={isActive ? highlightText : undefined}
                    />
                  </p>
                ) : (
                  <p className="mt-2 text-xs italic text-slate-400">Sin contenido detectado</p>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
