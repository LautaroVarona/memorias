import { cellLooksNumeric } from "./parse-pipe-table";

interface MemoriaPipeTableProps {
  rows: string[][];
}

export function MemoriaPipeTable({ rows }: MemoriaPipeTableProps) {
  if (rows.length === 0) return null;

  const [header, ...body] = rows;
  const colCount = Math.max(...rows.map((r) => r.length));

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
                {header[i] ?? ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-b border-slate-100 last:border-0">
              {Array.from({ length: colCount }, (_, ci) => {
                const cell = row[ci] ?? "";
                const numeric = cellLooksNumeric(cell);
                return (
                  <td
                    key={ci}
                    className={`px-2 py-1 ${
                      numeric
                        ? "text-right font-mono tabular-nums text-slate-800"
                        : ci === 0
                          ? "text-left text-slate-700"
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
