"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApartadoMemoria } from "@/types/domain";
import type { ValidacionView } from "./types";
import { ApartadoReviewSection } from "./ApartadoReviewSection";
import {
  buildApartadoGroups,
  countApartadoStatuses,
  filterApartadoGroups,
  type ApartadoReviewGroup,
  type SeverityFilter,
} from "./group-by-apartado";
import { hasContentDiff } from "./apartado-line-diff";
import { subscribeMemoriaNavigate } from "./memoria-navigator";

interface ApartadoReviewPanelProps {
  sections: ApartadoMemoria[];
  priorSections?: ApartadoMemoria[];
  ejercicio?: number;
  ejercicioAnterior?: number;
  validaciones: ValidacionView[];
  filter: SeverityFilter;
  onFilterChange: (filter: SeverityFilter) => void;
  scrollToFirstTick: number;
}

const FILTER_OPTIONS: { id: SeverityFilter; label: string; activeClass: string }[] = [
  { id: "all", label: "Todos", activeClass: "bg-slate-800 text-white" },
  { id: "critical", label: "Críticos", activeClass: "bg-red-600 text-white" },
  { id: "warning", label: "Advertencias", activeClass: "bg-amber-500 text-white" },
  { id: "ok", label: "OK", activeClass: "bg-emerald-600 text-white" },
];

function apartadoHasDiff(group: ApartadoReviewGroup): boolean {
  return hasContentDiff(group.contenidoAnterior ?? "", group.contenido ?? "");
}

export function ApartadoReviewPanel({
  sections,
  priorSections = [],
  ejercicio,
  ejercicioAnterior,
  validaciones,
  filter,
  onFilterChange,
  scrollToFirstTick,
}: ApartadoReviewPanelProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [highlights, setHighlights] = useState<Record<string, string | undefined>>({});
  const [diffsMode, setDiffsMode] = useState(false);
  const lastScrollTick = useRef(0);

  const groups = useMemo(
    () => buildApartadoGroups(sections, validaciones, priorSections),
    [sections, validaciones, priorSections]
  );
  const statusCounts = useMemo(() => countApartadoStatuses(groups), [groups]);
  const visible = useMemo(() => {
    const base = filterApartadoGroups(groups, filter);
    if (!diffsMode) return base;
    return base.filter(apartadoHasDiff);
  }, [groups, filter, diffsMode]);

  const diffApartadoCount = useMemo(
    () => groups.filter(apartadoHasDiff).length,
    [groups]
  );

  const toggleDiffsMode = useCallback(() => {
    setDiffsMode((prev) => {
      const next = !prev;
      if (next) {
        onFilterChange("all");
        const open: Record<string, boolean> = {};
        for (const g of groups) {
          if (apartadoHasDiff(g)) open[g.num] = true;
        }
        setOpenSections(open);
      }
      return next;
    });
  }, [groups, onFilterChange]);

  const scrollToGroup = useCallback((num: string) => {
    const id = num === "general" ? "apartado-general" : `apartado-${num}`;
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  useEffect(() => {
    if (scrollToFirstTick === 0 || scrollToFirstTick === lastScrollTick.current) return;
    lastScrollTick.current = scrollToFirstTick;
    const first = visible[0];
    if (!first) return;
    setOpenSections((prev) => ({ ...prev, [first.num]: true }));
    scrollToGroup(first.num);
  }, [scrollToFirstTick, visible, scrollToGroup]);

  const handleNavigate = useCallback(
    (target: { apartado?: string; highlightText?: string }) => {
      if (!target.apartado) return;
      const num = target.apartado.replace(/\D/g, "").padStart(2, "0");
      onFilterChange("all");
      setOpenSections((prev) => ({ ...prev, [num]: true }));
      if (target.highlightText) {
        setHighlights((prev) => ({ ...prev, [num]: target.highlightText }));
      }
      scrollToGroup(num);
    },
    [onFilterChange, scrollToGroup]
  );

  useEffect(() => subscribeMemoriaNavigate(handleNavigate), [handleNavigate]);

  if (groups.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTER_OPTIONS.map((opt) => {
          const count =
            opt.id === "all" ? groups.length : statusCounts[opt.id as keyof typeof statusCounts];
          const active = filter === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setDiffsMode(false);
                onFilterChange(opt.id);
              }}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                active && !diffsMode
                  ? opt.activeClass
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {opt.label}
              <span className={`ml-1 tabular-nums ${active && !diffsMode ? "opacity-90" : "text-slate-400"}`}>
                ({count})
              </span>
            </button>
          );
        })}
        {diffApartadoCount > 0 && (
          <button
            type="button"
            onClick={toggleDiffsMode}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
              diffsMode
                ? "bg-violet-600 text-white"
                : "border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
            }`}
          >
            Desplegar difs
            <span className={`ml-1 tabular-nums ${diffsMode ? "opacity-90" : "text-violet-500"}`}>
              ({diffApartadoCount})
            </span>
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          {diffsMode
            ? "Ningún apartado tiene diferencias textuales respecto al año anterior."
            : "Ningún apartado coincide con este filtro."}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((group) => (
            <ApartadoReviewSection
              key={group.num}
              group={group}
              ejercicio={ejercicio}
              ejercicioAnterior={ejercicioAnterior}
              defaultOpen={group.status !== "ok" || group.memoriaDiff.hasStructuralDiff}
              open={openSections[group.num]}
              onOpenChange={(next) =>
                setOpenSections((prev) => ({ ...prev, [group.num]: next }))
              }
              highlightText={highlights[group.num]}
              diffsOnly={diffsMode}
            />
          ))}
        </div>
      )}
    </div>
  );
}
