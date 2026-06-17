import type { EvidenceItem } from "./types";
import { normalizeEvidenceType } from "./parse-issue";

interface EvidenceLocatorProps {
  evidence: EvidenceItem;
  prominent?: boolean;
}

export function EvidenceLocator({ evidence, prominent = false }: EvidenceLocatorProps) {
  const type = normalizeEvidenceType(evidence);
  const isMemory = type === "memory";

  const doc = evidence.documentName;
  const page = evidence.page;
  const sheet = evidence.sheet;
  const row = evidence.row;
  const column = evidence.column;

  const hasLocator = !!(doc || page || sheet || row || column);
  if (!hasLocator) return null;

  const boxClass = prominent
    ? "border-2 font-semibold"
    : "border font-medium";

  if (isMemory) {
    return (
      <div
        className={`mb-2 rounded-md ${boxClass} border-blue-300 bg-blue-100/80 px-2.5 py-1.5 text-xs text-blue-950`}
      >
        <span className="uppercase tracking-wide text-blue-700/80">Memoria</span>
        <div className="mt-0.5 font-mono text-sm">
          {doc && <span className="break-all">{doc}</span>}
          {page !== undefined && (
            <span className={doc ? " · " : ""}>
              pág. <strong>{page}</strong>
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`mb-2 rounded-md ${boxClass} border-emerald-300 bg-emerald-100/80 px-2.5 py-1.5 text-xs text-emerald-950`}
    >
      <span className="uppercase tracking-wide text-emerald-700/80">Excel</span>
      <div className="mt-0.5 font-mono text-sm">
        {sheet && <span>Hoja: <strong>{sheet}</strong></span>}
        {row !== undefined && (
          <span>
            {sheet ? " · " : ""}
            Fila: <strong>{row}</strong>
          </span>
        )}
        {column && (
          <span>
            {(sheet || row !== undefined) ? " · " : ""}
            Col.: <strong>{column}</strong>
          </span>
        )}
        {doc && (
          <div className="mt-0.5 truncate text-[11px] font-sans text-emerald-800/80" title={doc}>
            {doc}
          </div>
        )}
      </div>
    </div>
  );
}
