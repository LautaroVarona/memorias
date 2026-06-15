interface InterannualItem {
  ruleId: string;
  title?: string | null;
  explanation?: string | null;
  mensaje: string;
  severidad: string;
}

interface InterannualDiffProps {
  validaciones: InterannualItem[];
}

export function InterannualDiff({ validaciones }: InterannualDiffProps) {
  const interannual = validaciones.filter((v) => v.ruleId.startsWith("INTER_"));
  if (interannual.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Comparación interanual</h2>
      <ul className="space-y-2">
        {interannual.map((v) => (
          <li
            key={v.ruleId}
            className={`rounded border p-3 text-sm ${
              v.severidad === "critical" || v.severidad === "warning"
                ? "border-amber-200 bg-amber-50"
                : "border-emerald-200 bg-emerald-50"
            }`}
          >
            <div className="font-medium">{v.title ?? v.ruleId}</div>
            <p className="mt-1 text-slate-600">{v.explanation ?? v.mensaje}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
