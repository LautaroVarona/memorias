interface SummaryBarProps {
  critical: number;
  warning: number;
  pass: number;
  score?: number;
  estado?: "ok" | "revisar" | "critico";
}

const ESTADO_STYLES: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-800",
  revisar: "bg-amber-50 text-amber-800",
  critico: "bg-red-50 text-red-800",
};

const ESTADO_LABELS: Record<string, string> = {
  ok: "OK",
  revisar: "Revisar",
  critico: "Crítico",
};

export function SummaryBar({ critical, warning, pass, score, estado }: SummaryBarProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {score !== undefined && (
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-blue-900">
          <span className="text-2xl font-bold">{score}</span>
          <span className="text-sm">/ 100</span>
        </div>
      )}
      {estado && (
        <div className={`flex items-center gap-2 rounded-lg px-4 py-2 ${ESTADO_STYLES[estado]}`}>
          <span className="text-sm font-semibold">{ESTADO_LABELS[estado]}</span>
        </div>
      )}
      <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-red-800">
        <span className="text-2xl font-bold">{critical}</span>
        <span className="text-sm">Errores</span>
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-2 text-amber-800">
        <span className="text-2xl font-bold">{warning}</span>
        <span className="text-sm">Advertencias</span>
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2 text-emerald-800">
        <span className="text-2xl font-bold">{pass}</span>
        <span className="text-sm">Superadas</span>
      </div>
    </div>
  );
}
