import { valuesMismatch } from "./evidence-utils";

interface ComparativeValuesProps {
  excelValue?: string;
  memoryValue?: string;
  memoryApartado?: string;
  tone?: "critical" | "warning";
}

function parseEuroAmount(raw: string): number | null {
  const normalized = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatDifference(excel?: string, memory?: string): string | null {
  if (!excel || !memory) return null;
  const a = parseEuroAmount(excel);
  const b = parseEuroAmount(memory);
  if (a === null || b === null) return null;
  const diff = a - b;
  const formatted = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(Math.abs(diff));
  const sign = diff >= 0 ? "+" : "−";
  return `${sign}${formatted}`;
}

export function ComparativeValues({
  excelValue,
  memoryValue,
  memoryApartado,
  tone = "critical",
}: ComparativeValuesProps) {
  if (!excelValue && !memoryValue) return null;

  const mismatch = valuesMismatch(excelValue, memoryValue);
  const difference = formatDifference(excelValue, memoryValue);
  const diffAccent =
    tone === "critical"
      ? "text-red-600 font-semibold"
      : "text-amber-600 font-semibold";

  return (
    <div className="mt-2 grid grid-cols-3 divide-x divide-slate-200 overflow-hidden rounded border border-slate-200 bg-slate-50/80 text-xs">
      <div className="px-2 py-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Contabilidad (Excel)
        </p>
        <p className="mt-0.5 font-mono tabular-nums text-slate-900">
          {excelValue ?? "—"}
        </p>
      </div>
      <div className="px-2 py-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Memoria (Word)
        </p>
        {memoryApartado && (
          <p className="mt-0.5 text-[10px] font-medium text-blue-700">{memoryApartado}</p>
        )}
        <p className="mt-0.5 font-mono tabular-nums text-slate-900">
          {memoryValue ?? "—"}
        </p>
      </div>
      <div className="px-2 py-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Diferencia
        </p>
        <p
          className={`mt-0.5 font-mono tabular-nums ${
            mismatch && difference ? diffAccent : "text-slate-500"
          }`}
        >
          {difference ?? "—"}
        </p>
      </div>
    </div>
  );
}
