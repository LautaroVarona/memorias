import { valuesMismatch } from "./evidence-utils";

interface ComparativeValuesProps {
  excelValue?: string;
  memoryValue?: string;
  tone?: "critical" | "warning";
}

export function ComparativeValues({
  excelValue,
  memoryValue,
  tone = "critical",
}: ComparativeValuesProps) {
  if (!excelValue && !memoryValue) return null;

  const mismatch = valuesMismatch(excelValue, memoryValue);
  const accent =
    tone === "critical"
      ? "text-red-700 font-semibold"
      : "text-amber-700 font-semibold";

  return (
    <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-2">
      <div className="bg-slate-50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
          Contabilidad (Excel)
        </p>
        <p
          className={`mt-1 font-mono text-base tabular-nums ${
            mismatch && excelValue ? accent : "text-slate-900"
          }`}
        >
          {excelValue ?? "—"}
        </p>
      </div>
      <div className="bg-slate-50 px-4 py-3 sm:border-l sm:border-slate-200">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">
          Memoria (Word)
        </p>
        <p
          className={`mt-1 font-mono text-base tabular-nums ${
            mismatch && memoryValue ? accent : "text-slate-900"
          }`}
        >
          {memoryValue ?? "—"}
        </p>
      </div>
    </div>
  );
}
