"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fetchExpedienteDetail, type ExpedienteDetail } from "@/lib/expediente-client";
import { collectParseErrors, sourceLabel, type ParseErrorItem } from "@/lib/review/parse-errors";

function ErrorCard({ item }: { item: ParseErrorItem }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-800">
          {sourceLabel(item.source)}
        </span>
        {item.ejercicio !== undefined && (
          <span className="text-red-700/80">Ejercicio {item.ejercicio}</span>
        )}
        {item.apartado && (
          <span className="text-red-700/80">Apartado {item.apartado}</span>
        )}
        {item.pagina !== undefined && (
          <span className="text-red-700/60">pág. {item.pagina}</span>
        )}
        {item.linea !== undefined && (
          <span className="text-red-700/60">línea {item.linea}</span>
        )}
      </div>
      <p className="mt-2 text-sm font-medium text-red-900">{item.mensaje}</p>
      {item.tablaTitulo && (
        <p className="mt-1 truncate text-xs text-red-700/70" title={item.tablaTitulo}>
          Tabla: {item.tablaTitulo}
        </p>
      )}
      <p className="mt-1 truncate text-xs text-slate-500" title={item.documento}>
        {item.documento}
      </p>
    </div>
  );
}

export default function ParseErrorsPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ExpedienteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchExpedienteDetail(id);
      setData(result);
      if (!result) setError("Expediente no encontrado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el expediente");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const errores = data ? collectParseErrors(data.caseData, data.archivos) : [];

  const porDocumento = errores.reduce<Record<string, ParseErrorItem[]>>((acc, item) => {
    const key = item.documento;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-2 pb-12 sm:px-4">
      <div>
        <Link href={`/expedientes/${id}`} className="text-sm text-slate-500 hover:text-slate-800">
          ← Volver al expediente
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Errores de parseo
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Tablas con estructura corrupta o columnas fusionadas que no se procesaron para validación.
        </p>
      </div>

      {loading && (
        <p className="text-sm text-slate-400">Cargando errores…</p>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {!loading && !error && errores.length === 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-8 text-center">
          <p className="text-sm font-medium text-emerald-800">Sin errores de parseo detectados</p>
          <p className="mt-1 text-xs text-emerald-700/80">
            Las tablas comparativas de las memorias tienen columnas N y N-1 correctamente aisladas.
          </p>
        </div>
      )}

      {!loading && errores.length > 0 && (
        <div className="space-y-6">
          <p className="text-sm text-red-800">
            <span className="font-semibold">{errores.length}</span>{" "}
            {errores.length === 1 ? "error" : "errores"} — estas tablas están marcadas como{" "}
            <code className="rounded bg-red-100 px-1 text-xs">tabla_rota</code> y se excluyen de
            reglas comparativas (INTER_010, cruzadas).
          </p>

          {Object.entries(porDocumento).map(([documento, items]) => (
            <section key={documento} className="space-y-3">
              <h2 className="truncate text-sm font-semibold text-slate-700" title={documento}>
                {documento}
              </h2>
              <div className="space-y-2">
                {items.map((item) => (
                  <ErrorCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
