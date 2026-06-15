"use client";

import { useState, type ReactNode } from "react";

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
  variant?: "ok" | "neutral";
}

export function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
  variant = "neutral",
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-slate-50/80"
      >
        <span
          className={`text-sm font-medium ${
            variant === "ok" ? "text-emerald-800" : "text-slate-700"
          }`}
        >
          {title}
          {count !== undefined && (
            <span className="ml-2 text-slate-400">({count})</span>
          )}
        </span>
        <span className="text-xs font-medium text-blue-600">
          {open ? "Ocultar detalle" : "Ver detalle"}
        </span>
      </button>
      {open && <div className="border-t border-slate-100 px-5 py-4">{children}</div>}
    </section>
  );
}
