"use client";

import { useMemo } from "react";
import {
  buildContentComparison,
  charSegmentsForLine,
  filterChangedBlocks,
  tokenizeForHighlight,
  type CharDiffSegment,
  type ComparedBlock,
  type ComparedLine,
  type LineDiffKind,
} from "./apartado-line-diff";
import type { ComparedTable, ComparedTableCell } from "./apartado-table-diff";
import { cellLooksNumeric } from "./parse-pipe-table";

interface ApartadoMemoriaCompareProps {
  priorText?: string;
  currentText?: string;
  ejercicioAnterior?: number;
  ejercicioActual?: number;
  highlightQuery?: string;
  diffsOnly?: boolean;
  emphasizeStructural?: boolean;
}

const TEXT_ROW_BG: Record<LineDiffKind, { prior: string; current: string }> = {
  unchanged: { prior: "", current: "" },
  expected: { prior: "bg-blue-50/60", current: "bg-blue-50/60" },
  structural: { prior: "bg-red-50/50", current: "bg-red-50/50" },
  removed: { prior: "bg-red-50/70", current: "" },
  added: { prior: "", current: "bg-red-50/70" },
};

const TEXT_ROW_BG_EMPHASIZED: Record<LineDiffKind, { prior: string; current: string }> = {
  unchanged: { prior: "", current: "" },
  expected: { prior: "bg-blue-50/80", current: "bg-blue-50/80" },
  structural: { prior: "bg-red-100/60", current: "bg-red-100/60" },
  removed: { prior: "bg-red-100/80", current: "" },
  added: { prior: "", current: "bg-red-100/80" },
};

const CELL_KIND_BG: Record<LineDiffKind, string> = {
  unchanged: "",
  expected: "bg-blue-50/70",
  structural: "bg-red-50/70",
  removed: "bg-red-50/80",
  added: "bg-red-50/80",
};

const CHAR_MARK: Record<CharDiffSegment["kind"], string> = {
  equal: "",
  removed: "rounded-sm bg-red-200/90 px-px font-medium text-red-950",
  added: "rounded-sm bg-red-200/90 px-px font-medium text-red-950",
};

const CELL_BASE = "whitespace-pre-wrap break-words py-2 pr-3 text-slate-700";

function CharDiffText({ segments }: { segments: CharDiffSegment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === "equal" ? (
          <span key={i}>{seg.text}</span>
        ) : (
          <mark key={i} className={CHAR_MARK[seg.kind]}>
            {seg.text}
          </mark>
        )
      )}
    </>
  );
}

function DiffText({
  text,
  line,
  side,
  highlightQuery,
}: {
  text: string;
  line: ComparedLine;
  side: "prior" | "current";
  highlightQuery?: string;
}) {
  if (!text.trim()) return null;

  if (line.kind === "expected") {
    return (
      <span>
        {tokenizeForHighlight(text).map((p) =>
          p.expected ? (
            <mark key={p.key} className="rounded-sm bg-blue-200/80 px-px font-medium text-blue-950">
              {p.text}
            </mark>
          ) : (
            <span key={p.key}>{p.text}</span>
          )
        )}
      </span>
    );
  }

  const charSegments = charSegmentsForLine(line, side);
  if (charSegments) {
    return <CharDiffText segments={charSegments} />;
  }

  if (highlightQuery && highlightQuery.length >= 3 && text.toLowerCase().includes(highlightQuery.toLowerCase())) {
    const idx = text.toLowerCase().indexOf(highlightQuery.toLowerCase());
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + highlightQuery.length);
    const after = text.slice(idx + highlightQuery.length);
    return (
      <span>
        {before}
        <mark className="rounded-sm bg-amber-200 px-px">{match}</mark>
        {after}
      </span>
    );
  }

  return <span>{text}</span>;
}

function DiffRow({
  line,
  highlightQuery,
  emphasizeStructural,
}: {
  line: ComparedLine;
  highlightQuery?: string;
  emphasizeStructural?: boolean;
}) {
  const priorEmpty = line.kind === "added" || !line.prior.trim();
  const currentEmpty = line.kind === "removed" || !line.current.trim();
  const emphasized = Boolean(emphasizeStructural && line.kind === "structural");
  const bg = emphasized ? TEXT_ROW_BG_EMPHASIZED : TEXT_ROW_BG;

  return (
    <div className="contents">
      <div className={`${CELL_BASE} border-b border-slate-100/80 ${bg[line.kind].prior}`}>
        {!priorEmpty && (
          <DiffText text={line.prior} line={line} side="prior" highlightQuery={highlightQuery} />
        )}
      </div>
      <div className={`${CELL_BASE} border-b border-slate-100/80 ${bg[line.kind].current}`}>
        {!currentEmpty && (
          <DiffText text={line.current} line={line} side="current" highlightQuery={highlightQuery} />
        )}
      </div>
    </div>
  );
}

function TableCellValue({ cell, side }: { cell: ComparedTableCell; side: "prior" | "current" }) {
  const text = side === "prior" ? cell.prior : cell.current;
  if (!text) return <span className="text-slate-300">—</span>;

  if (cell.kind === "expected") {
    return (
      <span>
        {tokenizeForHighlight(text).map((p, i) =>
          p.expected ? (
            <mark key={i} className="rounded-sm bg-blue-200/80 px-px font-medium text-blue-950">
              {p.text}
            </mark>
          ) : (
            <span key={i}>{p.text}</span>
          )
        )}
      </span>
    );
  }

  if (cell.kind !== "unchanged") {
    return <span className="font-medium text-red-900">{text}</span>;
  }

  return <span>{text}</span>;
}

function MemoriaCompareTable({
  table,
  priorLabel,
  currentLabel,
  emphasizeStructural,
}: {
  table: ComparedTable;
  priorLabel: string;
  currentLabel: string;
  emphasizeStructural?: boolean;
}) {
  if (table.columns.length === 0 && table.rows.length === 0) return null;

  return (
    <div className="my-6 overflow-x-auto">
      <table className="w-full min-w-[16rem] border-collapse border border-slate-200 text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-100/80">
            {table.columns.map((col) => (
              <th
                key={col.key}
                colSpan={col.key === "label" ? 1 : 2}
                className="border-l border-slate-200 px-2 py-1.5 font-medium text-slate-600 first:border-l-0"
              >
                <div className="text-center">
                  {col.headerPrior && col.headerCurrent && col.headerPrior !== col.headerCurrent ? (
                    <>
                      <span className="text-slate-500">{col.headerPrior}</span>
                      <span className="mx-1 text-slate-300">→</span>
                      <span>{col.headerCurrent}</span>
                    </>
                  ) : (
                    col.headerPrior || col.headerCurrent || "—"
                  )}
                </div>
                {col.key !== "label" && (
                  <div className="mt-1 grid grid-cols-2 gap-px text-[9px] font-normal uppercase tracking-wide text-slate-400">
                    <span className="text-center">{priorLabel}</span>
                    <span className="border-l border-slate-200 text-center">{currentLabel}</span>
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => {
            const rowEmphasis =
              emphasizeStructural &&
              (row.kind === "structural" || row.kind === "removed" || row.kind === "added");
            return (
              <tr
                key={ri}
                className={`border-b border-slate-100 last:border-0 ${
                  rowEmphasis ? "bg-red-50/30" : row.kind === "expected" ? "bg-blue-50/20" : ""
                }`}
              >
                {row.cells.map((cell, ci) => {
                  const col = table.columns[ci];
                  const isLabelCol = col?.key === "label";
                  const numeric =
                    !isLabelCol &&
                    (cellLooksNumeric(cell.prior) || cellLooksNumeric(cell.current));
                  const cellAlign = isLabelCol
                    ? "text-left text-slate-700 font-medium"
                    : numeric
                      ? "text-right font-mono tabular-nums text-slate-800"
                      : "text-right text-slate-600";

                  if (isLabelCol) {
                    const labelText = cell.current || cell.prior || row.label;
                    return (
                      <td
                        key={`${ri}-${ci}`}
                        className={`px-2 py-1 ${CELL_KIND_BG[cell.kind]} ${cellAlign}`}
                      >
                        {labelText || "—"}
                      </td>
                    );
                  }

                  return (
                    <td key={`${ri}-${ci}`} colSpan={2} className="p-0">
                      <div className={`grid grid-cols-2 ${CELL_KIND_BG[cell.kind]}`}>
                        <div className={`px-2 py-1 ${cellAlign}`}>
                          <TableCellValue cell={cell} side="prior" />
                        </div>
                        <div className={`border-l border-dashed border-slate-200 px-2 py-1 ${cellAlign}`}>
                          <TableCellValue cell={cell} side="current" />
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CompareLegend() {
  return (
    <p className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-3 rounded-sm bg-blue-200" />
        Sugerencia inteligente
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-3 rounded-sm bg-red-200" />
        Ruptura lógica
      </span>
    </p>
  );
}

function FlatCompareContent({
  blocks,
  priorLabel,
  currentLabel,
  highlightQuery,
  emphasizeStructural,
}: {
  blocks: ComparedBlock[];
  priorLabel: string;
  currentLabel: string;
  highlightQuery?: string;
  emphasizeStructural?: boolean;
}) {
  const textLines = blocks.filter((b): b is { type: "text"; line: ComparedLine } => b.type === "text");
  const tables = blocks.filter((b): b is { type: "table"; table: ComparedTable } => b.type === "table");

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-x-6 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        <div>{priorLabel}</div>
        <div className="text-right text-blue-900">{currentLabel}</div>
      </div>

      {textLines.length > 0 && (
        <div className="grid grid-cols-2 gap-x-6 text-[13px] leading-relaxed">
          {textLines.map((block, i) => (
            <DiffRow
              key={i}
              line={block.line}
              highlightQuery={highlightQuery}
              emphasizeStructural={emphasizeStructural}
            />
          ))}
        </div>
      )}

      {tables.map((block, i) => (
        <MemoriaCompareTable
          key={`tbl-${i}`}
          table={block.table}
          priorLabel={priorLabel}
          currentLabel={currentLabel}
          emphasizeStructural={emphasizeStructural}
        />
      ))}
    </>
  );
}

export function ApartadoMemoriaCompare({
  priorText,
  currentText,
  ejercicioAnterior,
  ejercicioActual,
  highlightQuery,
  diffsOnly = false,
  emphasizeStructural = false,
}: ApartadoMemoriaCompareProps) {
  const blocks = useMemo(() => {
    if (!priorText?.trim() || !currentText?.trim()) return [];
    const all = buildContentComparison(priorText, currentText);
    return diffsOnly ? filterChangedBlocks(all) : all;
  }, [priorText, currentText, diffsOnly]);

  const priorLabel =
    ejercicioAnterior !== undefined
      ? `← Memoria ${ejercicioAnterior}`
      : "← Memoria anterior";
  const currentLabel =
    ejercicioActual !== undefined
      ? `Memoria ${ejercicioActual} →`
      : "Memoria actual →";

  if (!priorText?.trim()) {
    return (
      <p className="text-sm text-slate-600">
        No hay memoria del ejercicio anterior cargada para comparar este apartado.
        {currentText?.trim() && (
          <span className="mt-3 block whitespace-pre-wrap text-xs text-slate-500">{currentText}</span>
        )}
      </p>
    );
  }

  if (!currentText?.trim()) {
    return (
      <p className="text-sm italic text-slate-500">Sin contenido detectado en la memoria actual.</p>
    );
  }

  const soloEsperado =
    !diffsOnly &&
    blocks.length > 0 &&
    blocks.every((b) => {
      if (b.type === "text") return b.line.kind === "unchanged" || b.line.kind === "expected";
      return b.table.rows.every((r) => r.kind === "unchanged" || r.kind === "expected");
    });

  if (blocks.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        {diffsOnly ? "Sin diferencias respecto al año anterior." : "Sin contenido comparable."}
      </p>
    );
  }

  return (
    <div>
      {soloEsperado && (
        <p className="mb-3 text-xs text-blue-700">
          Solo cambian cifras o referencias de ejercicio.
        </p>
      )}
      <CompareLegend />
      <FlatCompareContent
        blocks={blocks}
        priorLabel={priorLabel}
        currentLabel={currentLabel}
        highlightQuery={highlightQuery}
        emphasizeStructural={emphasizeStructural}
      />
    </div>
  );
}
