"use client";

import { useState } from "react";
import type { EvidenceItem } from "./types";
import { evRef } from "./parse-issue";
import { ApartadoMemoriaCompare } from "./ApartadoMemoriaCompare";

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
          <ApartadoMemoriaCompare
            priorText={panel.prior}
            currentText={panel.current}
            diffsOnly
            emphasizeStructural
          />
        </div>
      )}
    </div>
  );
}

/** @deprecated Usar formatEvidenceListForCopy desde evidence-utils */
export { formatEvidenceListForCopy as formatEvidenceForCopy } from "./evidence-utils";
