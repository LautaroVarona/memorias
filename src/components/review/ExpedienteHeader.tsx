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
    <header className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold tracking-tight text-slate-900">{cliente}</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Ejercicio {ejercicioLabel}
            {tipoEmpresa && (
              <span className="ml-1.5 capitalize text-slate-400">· {tipoEmpresa}</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${ESTADO_STYLES[estadoKey]}`}
          >
            {estadoLabel}
          </span>
          {score !== undefined && (
            <span
              className={`text-lg font-bold tabular-nums ${
                estadoKey === "no_formulable"
                  ? "text-red-600"
                  : estadoKey === "revisar"
                    ? "text-amber-600"
                    : "text-slate-800"
              }`}
              title="Score"
            >
              {score}
            </span>
          )}
          <span className="text-red-600 tabular-nums">
            <span className="text-[10px] font-medium uppercase text-slate-400">Err </span>
            {errores}
          </span>
          <span className="text-amber-600 tabular-nums">
            <span className="text-[10px] font-medium uppercase text-slate-400">Adv </span>
            {warnings}
          </span>
        </div>
      </div>
      {motivoGlobal && estadoKey !== "ok" && (
        <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-600">{motivoGlobal}</p>
      )}
    </header>
  );
}
