import type { GlobalEstado } from "@/types/case-data";

interface ExpedienteHeaderProps {
  cliente: string;
  ejercicio: number;
  tipoEmpresa?: string | null;
  score?: number;
  estado?: GlobalEstado | "critico";
  motivoGlobal?: string;
  errores: number;
  warnings: number;
}

const ESTADO_STYLES: Record<string, string> = {
  ok: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  revisar: "bg-amber-100 text-amber-800 ring-amber-200",
  no_formulable: "bg-red-100 text-red-800 ring-red-200",
  critico: "bg-red-100 text-red-800 ring-red-200",
};

const ESTADO_LABELS: Record<string, string> = {
  ok: "LISTO PARA FORMULAR",
  revisar: "REVISAR",
  no_formulable: "NO FORMULABLE",
  critico: "NO FORMULABLE",
};

export function ExpedienteHeader({
  cliente,
  ejercicio,
  tipoEmpresa,
  score,
  estado = "ok",
  motivoGlobal,
  errores,
  warnings,
}: ExpedienteHeaderProps) {
  const ejercicioLabel = ejercicio > 0 ? String(ejercicio) : "Pendiente";
  const estadoKey = estado === "critico" ? "no_formulable" : estado;
  const estadoLabel = ESTADO_LABELS[estadoKey] ?? estadoKey.toUpperCase();

  return (
    <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{cliente}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ejercicio {ejercicioLabel}
            {tipoEmpresa && (
              <span className="ml-2 capitalize text-slate-400">· {tipoEmpresa}</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Estado del cierre
            </p>
            <span
              className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ring-1 ${ESTADO_STYLES[estadoKey]}`}
            >
              {estadoLabel}
            </span>
            {motivoGlobal && estadoKey !== "ok" && (
              <p className="mt-1 max-w-xs text-xs text-slate-500">{motivoGlobal}</p>
            )}
          </div>

          {score !== undefined && (
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Score</p>
              <p
                className={`text-3xl font-bold tabular-nums ${
                  estadoKey === "no_formulable"
                    ? "text-red-600"
                    : estadoKey === "revisar"
                      ? "text-amber-600"
                      : "text-slate-900"
                }`}
              >
                {score}
              </p>
            </div>
          )}

          <div className="hidden h-10 w-px bg-slate-200 sm:block" />

          <div className="flex gap-6 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Errores</p>
              <p className="text-xl font-bold tabular-nums text-red-600">{errores}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Warnings
              </p>
              <p className="text-xl font-bold tabular-nums text-amber-600">{warnings}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
