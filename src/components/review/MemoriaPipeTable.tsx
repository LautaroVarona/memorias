import type { MemoriaTableRow } from "@/types/domain";
import { cellLooksNumeric } from "./parse-pipe-table";

interface MemoriaPipeTableProps {
  rows: MemoriaTableRow[] | string[][];
}

function normalizeRows(rows: MemoriaTableRow[] | string[][]): MemoriaTableRow[] {
  if (rows.length === 0) return [];
  if ("cells" in rows[0]) return rows as MemoriaTableRow[];
  return (rows as string[][]).map((cells) => ({ cells }));
}

export function MemoriaPipeTable({ rows }: MemoriaPipeTableProps) {
  const normalized = normalizeRows(rows);
  if (normalized.length === 0) return null;

  const [header, ...body] = normalized;
  const colCount = Math.max(...normalized.map((r) => r.cells.length));

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table className="w-full min-w-[12rem] border-collapse text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/90">
            {Array.from({ length: colCount }, (_, i) => (
              <th
                key={i}
                className={`px-2 py-1 font-medium text-slate-600 ${
                  i > 0 ? "text-right" : "text-left"
                }`}
              >
                {header.cells[i] ?? ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-b border-slate-100 last:border-0">
              {Array.from({ length: colCount }, (_, ci) => {
                const cell = row.cells[ci] ?? "";
                const numeric = cellLooksNumeric(cell);
                const isLabel = ci === 0;
                return (
                  <td
                    key={ci}
                    className={`px-2 py-1 ${
                      numeric
                        ? "text-right font-mono tabular-nums text-slate-800"
                        : isLabel
                          ? `text-left text-slate-700${row.is_subconcept ? " pl-5" : ""}`
                          : "text-right text-slate-600"
                    }`}
                  >
                    {cell || "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
