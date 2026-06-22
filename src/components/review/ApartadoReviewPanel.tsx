"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApartadoMemoria } from "@/types/domain";
import type { ValidacionView } from "./types";
import { ApartadoReviewSection } from "./ApartadoReviewSection";
import {
  buildApartadoGroups,
  countApartadoStatuses,
  filterApartadoGroups,
  type SeverityFilter,
} from "./group-by-apartado";
import { subscribeMemoriaNavigate } from "./memoria-navigator";

interface ApartadoReviewPanelProps {
  sections: ApartadoMemoria[];
  validaciones: ValidacionView[];
}

const FILTER_OPTIONS: { id: SeverityFilter; label: string; activeClass: string }[] = [
  { id: "all", label: "Todos", activeClass: "bg-slate-800 text-white" },
  { id: "critical", label: "Críticos", activeClass: "bg-red-600 text-white" },
  { id: "warning", label: "Advertencias", activeClass: "bg-amber-500 text-white" },
  { id: "ok", label: "OK", activeClass: "bg-emerald-600 text-white" },
];

export function ApartadoReviewPanel({ sections, validaciones }: ApartadoReviewPanelProps) {
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [highlights, setHighlights] = useState<Record<string, string | undefined>>({});

  const groups = useMemo(
    () => buildApartadoGroups(sections, validaciones),
    [sections, validaciones]
  );
  const statusCounts = useMemo(() => countApartadoStatuses(groups), [groups]);
  const visible = useMemo(() => filterApartadoGroups(groups, filter), [groups, filter]);

  const handleNavigate = useCallback((target: { apartado?: string; highlightText?: string }) => {
    if (!target.apartado) return;
    const num = target.apartado.replace(/\D/g, "").padStart(2, "0");
    setFilter("all");
    setOpenSections((prev) => ({ ...prev, [num]: true }));
    if (target.highlightText) {
      setHighlights((prev) => ({ ...prev, [num]: target.highlightText }));
    }
    window.requestAnimationFrame(() => {
      document.getElementById(`apartado-${num}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  useEffect(() => subscribeMemoriaNavigate(handleNavigate), [handleNavigate]);

  if (groups.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Filtrar apartados
        </span>
        <div className="flex flex-wrap gap-1.5">
          {FILTER_OPTIONS.map((opt) => {
            const count =
              opt.id === "all"
                ? groups.length
                : statusCounts[opt.id as keyof typeof statusCounts];
            const active = filter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilter(opt.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  active
                    ? opt.activeClass
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {opt.label}
                <span className={`ml-1 tabular-nums ${active ? "opacity-90" : "text-slate-400"}`}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          Ningún apartado coincide con este filtro.
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((group) => (
            <ApartadoReviewSection
              key={group.num}
              group={group}
              defaultOpen={group.status !== "ok" || filter !== "all"}
              open={openSections[group.num]}
              onOpenChange={(next) =>
                setOpenSections((prev) => ({ ...prev, [group.num]: next }))
              }
              highlightText={highlights[group.num]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
