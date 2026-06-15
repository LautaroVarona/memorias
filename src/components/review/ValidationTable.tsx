"use client";

import { Fragment, useState } from "react";

interface EvidenceItem {
  type?: string;
  tipo?: string;
  reference?: string;
  referencia?: string;
  value?: string | number;
  valor?: string | number;
  formattedValue?: string;
  text?: string;
  detalle?: string;
  importance?: "high" | "medium" | "low";
}

interface Validacion {
  id: string;
  ruleId: string;
  title?: string | null;
  categoria: string;
  severidad: string;
  mensaje: string;
  explanation?: string | null;
  normativa?: string | null;
  referencia?: string | null;
  evidencia: EvidenceItem[];
  sugerencia: string | null;
}

interface ValidationTableProps {
  validaciones: Validacion[];
}

const ROW_STYLES: Record<string, string> = {
  critical: "bg-red-50/60",
  error: "bg-red-50/60",
  warning: "bg-amber-50/60",
  pass: "bg-emerald-50/40",
  ok: "bg-emerald-50/40",
};

const IMPORTANCE_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-slate-100 text-slate-600",
  low: "bg-slate-50 text-slate-400",
};

function evType(e: EvidenceItem): string {
  return e.type ?? e.tipo ?? "";
}

function evRef(e: EvidenceItem): string {
  return e.reference ?? e.referencia ?? "";
}

function evValue(e: EvidenceItem): string | number | undefined {
  return e.value ?? e.valor;
}

function evText(e: EvidenceItem): string | undefined {
  return e.text ?? e.detalle;
}

function evFormatted(e: EvidenceItem): string | undefined {
  return e.formattedValue ?? (typeof evValue(e) === "number" ? undefined : String(evValue(e) ?? ""));
}

function ExplanationText({ text }: { text: string }) {
  const parts = text.split(/\n\n+/).filter(Boolean);
  if (parts.length <= 1) return <span>{text}</span>;
  return (
    <div className="space-y-2">
      {parts.map((p, i) => (
        <p key={i} className={i === 0 ? "font-medium text-slate-800" : "text-slate-600"}>
          {p}
        </p>
      ))}
    </div>
  );
}

export function ValidationTable({ validaciones }: ValidationTableProps) {
  const [filtroSeveridad, setFiltroSeveridad] = useState<string>("all");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const categorias = [...new Set(validaciones.map((v) => v.categoria))];

  const filtered = validaciones.filter((v) => {
    if (filtroSeveridad !== "all" && v.severidad !== filtroSeveridad) return false;
    if (filtroCategoria !== "all" && v.categoria !== filtroCategoria) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select
          value={filtroSeveridad}
          onChange={(e) => setFiltroSeveridad(e.target.value)}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="all">Todos los resultados</option>
          <option value="critical">Errores</option>
          <option value="warning">Advertencias</option>
          <option value="pass">Superadas</option>
        </select>
        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="all">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="self-center text-sm text-slate-500">
          {filtered.length} de {validaciones.length} resultados
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">Regla</th>
              <th className="px-4 py-2 font-medium">Explicación</th>
              <th className="px-4 py-2 font-medium w-20"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => {
              const texto = v.explanation ?? v.mensaje;
              const titulo = v.title ?? v.ruleId;
              return (
                <Fragment key={v.id}>
                  <tr
                    className={`border-t border-slate-100 ${ROW_STYLES[v.severidad] ?? "hover:bg-slate-50"}`}
                  >
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-800">{titulo}</div>
                      <div className="mt-0.5 text-xs text-slate-400">{v.categoria}</div>
                      {v.normativa && (
                        <div className="text-xs text-slate-500">
                          {v.normativa}
                          {v.referencia ? ` · ${v.referencia}` : ""}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      <ExplanationText text={texto} />
                    </td>
                    <td className="px-4 py-2">
                      {v.evidencia.length > 0 && (
                        <button
                          onClick={() => setExpanded(expanded === v.id ? null : v.id)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {expanded === v.id ? "Ocultar" : "Evidencia"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === v.id && (
                    <tr className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={3} className="px-4 py-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">Excel</h4>
                            {v.evidencia
                              .filter((e) => ["excel", "sistema", "comparacion"].includes(evType(e)))
                              .map((e, i) => (
                                <div
                                  key={i}
                                  className="mb-1 rounded border border-slate-200 bg-white p-2 text-xs"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{evRef(e)}</span>
                                    {e.importance && (
                                      <span
                                        className={`rounded px-1 py-0.5 text-[10px] uppercase ${IMPORTANCE_STYLES[e.importance]}`}
                                      >
                                        {e.importance}
                                      </span>
                                    )}
                                  </div>
                                  {(evFormatted(e) || evValue(e) !== undefined) && (
                                    <span className="mt-0.5 block font-mono text-slate-900">
                                      {evFormatted(e) ?? evValue(e)}
                                    </span>
                                  )}
                                  {evText(e) && !evFormatted(e) && (
                                    <span className="mt-0.5 block text-slate-500">{evText(e)}</span>
                                  )}
                                </div>
                              ))}
                          </div>
                          <div>
                            <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">Memoria</h4>
                            {v.evidencia
                              .filter((e) => evType(e) === "memory" || evType(e) === "memoria")
                              .map((e, i) => (
                                <div
                                  key={i}
                                  className="mb-1 rounded border border-slate-200 bg-white p-2 text-xs"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{evRef(e)}</span>
                                    {e.importance && (
                                      <span
                                        className={`rounded px-1 py-0.5 text-[10px] uppercase ${IMPORTANCE_STYLES[e.importance]}`}
                                      >
                                        {e.importance}
                                      </span>
                                    )}
                                  </div>
                                  {(evFormatted(e) || evValue(e) !== undefined) && (
                                    <span className="mt-0.5 block font-mono text-slate-900">
                                      {evFormatted(e) ?? evValue(e)}
                                    </span>
                                  )}
                                  {evText(e) && (
                                    <span className="mt-0.5 block text-slate-500">{evText(e)}</span>
                                  )}
                                </div>
                              ))}
                          </div>
                        </div>
                        {v.sugerencia && (
                          <p className="mt-3 text-xs text-blue-700">
                            <strong>Sugerencia:</strong> {v.sugerencia}
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="p-4 text-center text-sm text-slate-500">
            Sin resultados para los filtros seleccionados
          </p>
        )}
      </div>
    </div>
  );
}
