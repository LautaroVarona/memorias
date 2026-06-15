import type { ValidacionView } from "./types";

interface VariationBar {
  label: string;
  pct: number;
}

function extractVariations(validaciones: ValidacionView[]): VariationBar[] {
  const bars: VariationBar[] = [];

  for (const v of validaciones.filter((x) => x.ruleId.startsWith("INTER_"))) {
    if (v.severidad === "pass") continue;
    const text = v.explanation ?? v.mensaje;

    const activo = text.match(/activo\s+([\d.,]+)\s*%/i);
    if (activo) {
      bars.push({ label: "Activo", pct: parseFloat(activo[1].replace(",", ".")) });
    }

    const resultado = text.match(/resultado\s+([\d.,]+)\s*%/i);
    if (resultado) {
      bars.push({ label: "Resultado", pct: parseFloat(resultado[1].replace(",", ".")) });
    }

    // INTER_002, 003, 004 — título como etiqueta sin barra numérica
    if (!activo && !resultado && v.title) {
      bars.push({ label: v.title.slice(0, 40), pct: 50 });
    }
  }

  // Deduplicar por label
  const seen = new Set<string>();
  return bars.filter((b) => {
    if (seen.has(b.label)) return false;
    seen.add(b.label);
    return true;
  });
}

function barWidth(pct: number): number {
  return Math.min(100, Math.max(8, Math.abs(pct)));
}

export function InterannualBars({ validaciones }: { validaciones: ValidacionView[] }) {
  const variations = extractVariations(validaciones);
  if (variations.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Variación interanual
      </h2>
      <div className="space-y-4">
        {variations.map((v) => (
          <div key={v.label}>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="font-medium text-slate-700">{v.label}</span>
              <span
                className={`font-mono font-semibold ${
                  Math.abs(v.pct) > 30 ? "text-amber-700" : "text-slate-600"
                }`}
              >
                {v.pct >= 0 ? "+" : ""}
                {v.pct.toFixed(1)}%
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${
                  Math.abs(v.pct) > 30 ? "bg-amber-400" : "bg-slate-300"
                }`}
                style={{ width: `${barWidth(v.pct)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
