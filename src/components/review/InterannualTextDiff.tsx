"use client";

import { useState } from "react";
import type { EvidenceItem } from "./types";
import { evRef } from "./parse-issue";

interface DiffPanel {
  id: string;
  label: string;
  prior: string;
  current: string;
}

function buildPanels(evidencia: EvidenceItem[]): DiffPanel[] {
  return evidencia
    .filter((ev) => ev.diffPrior && ev.diffCurrent)
    .map((ev, i) => {
      const apartado = ev.section
        ? `Apartado ${ev.section.padStart(2, "0")}${ev.sectionTitle ? ` — ${ev.sectionTitle}` : ""}`
        : undefined;
      return {
        id: ev.group ?? `${i}`,
        label: apartado ?? ev.sectionTitle ?? evRef(ev) ?? `Apartado ${i + 1}`,
        prior: ev.diffPrior!,
        current: ev.diffCurrent!,
      };
    });
}

function DiffLineColumns({ prior, current }: { prior: string; current: string }) {
  const priorLines = prior.split("\n");
  const currentLines = current.split("\n");
  const rows = Math.max(priorLines.length, currentLines.length);

  return (
    <div className="grid max-h-80 grid-cols-2 gap-px overflow-auto rounded-md border border-slate-200 bg-slate-200 text-xs">
      <div className="bg-slate-50 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Ejercicio anterior
      </div>
      <div className="bg-slate-50 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Ejercicio actual
      </div>
      {Array.from({ length: rows }, (_, i) => {
        const left = priorLines[i] ?? "";
        const right = currentLines[i] ?? "";
        const changed = left !== right;
        return (
          <div key={i} className="contents">
            <pre
              className={`whitespace-pre-wrap break-words px-2 py-1 font-mono leading-relaxed ${
                changed ? "bg-red-50 text-red-900" : "bg-white text-slate-700"
              }`}
            >
              {left || " "}
            </pre>
            <pre
              className={`whitespace-pre-wrap break-words px-2 py-1 font-mono leading-relaxed ${
                changed ? "bg-emerald-50 text-emerald-900" : "bg-white text-slate-700"
              }`}
            >
              {right || " "}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

export function InterannualTextDiff({
  evidencia,
  defaultOpen = true,
}: {
  evidencia: EvidenceItem[];
  defaultOpen?: boolean;
}) {
  const panels = buildPanels(evidencia);
  const [open, setOpen] = useState(defaultOpen);
  const [active, setActive] = useState(0);

  if (panels.length === 0) return null;

  const panel = panels[active] ?? panels[0];

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Comparativa interanual
        </span>
        <span className="text-[11px] font-medium text-slate-500">{open ? "Ocultar" : "Ver"}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 p-2">
          {panels.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {panels.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActive(i)}
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    i === active
                      ? "bg-slate-800 text-white"
                      : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <DiffLineColumns prior={panel.prior} current={panel.current} />
        </div>
      )}
    </div>
  );
}

/** @deprecated Usar formatEvidenceListForCopy desde evidence-utils */
export { formatEvidenceListForCopy as formatEvidenceForCopy } from "./evidence-utils";
