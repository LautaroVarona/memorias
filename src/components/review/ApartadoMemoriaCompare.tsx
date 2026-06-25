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
import type { ComparedTable } from "./apartado-table-diff";

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
  expected: { prior: "", current: "" },
  structural: { prior: "bg-red-50/50", current: "bg-red-50/50" },
  removed: { prior: "bg-red-50/70", current: "" },
  added: { prior: "", current: "bg-red-50/70" },
};

const TEXT_ROW_BG_EMPHASIZED: Record<LineDiffKind, { prior: string; current: string }> = {
  unchanged: { prior: "", current: "" },
  expected: { prior: "", current: "" },
  structural: { prior: "bg-red-100/60", current: "bg-red-100/60" },
  removed: { prior: "bg-red-100/80", current: "" },
  added: { prior: "", current: "bg-red-100/80" },
};

const CHAR_MARK: Record<CharDiffSegment["kind"], string> = {
  equal: "",
  removed: "rounded-sm bg-red-200/90 px-px font-medium text-red-950",
  added: "rounded-sm bg-red-200/90 px-px font-medium text-red-950",
};

const CELL_BASE =
  "min-w-0 whitespace-pre-wrap break-words py-2 pr-2 text-left text-slate-700 [text-align:left] [word-spacing:normal]";

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

  return <span>{text.trim()}</span>;
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
    <div className="grid w-full grid-cols-2 gap-x-0 border-b border-slate-100/80 text-[13px] leading-snug">
      <div className={`${CELL_BASE} pr-4 ${bg[line.kind].prior}`}>
        {!priorEmpty ? (
          <DiffText text={line.prior} line={line} side="prior" highlightQuery={highlightQuery} />
        ) : null}
      </div>
      <div className={`${CELL_BASE} pl-4 ${bg[line.kind].current}`}>
        {!currentEmpty ? (
          <DiffText text={line.current} line={line} side="current" highlightQuery={highlightQuery} />
        ) : null}
      </div>
    </div>
  );
}

function padCells(cells: string[] | null, n: number): string[] {
  const out = [...(cells ?? [])];
  while (out.length < n) out.push("");
  return out;
}

function MemoriaSideTable({
  header,
  cols,
  rows,
  side,
  sharedCol,
  emphasizeStructural,
}: {
  header: string[];
  cols: number;
  rows: ComparedTable["rows"];
  side: "prior" | "current";
  sharedCol: number | null;
  emphasizeStructural?: boolean;
}) {
  const rowBg = (kind: ComparedTable["rows"][number]["kind"]): string => {
    if (kind === "structural") return emphasizeStructural ? "bg-red-100/70" : "bg-red-50/60";
    if (kind === "removed" || kind === "added") return "bg-red-50/50";
    return "";
  };

  const colAlign = (i: number) => (i === 0 ? "text-left" : "text-right font-mono tabular-nums");

  return (
    <table className="w-full min-w-max border-collapse border border-slate-200 text-xs">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-100/70 font-semibold text-slate-700">
          {padCells(header, cols).map((h, i) => (
            <th key={i} className={`whitespace-nowrap px-3 py-1.5 ${i === 0 ? "text-left" : "text-right"}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => {
          const cells = side === "prior" ? row.prior : row.current;
          const missing = cells === null;
          return (
            <tr key={ri} className={`border-b border-slate-100 last:border-0 ${rowBg(row.kind)}`}>
              {padCells(missing ? null : cells, cols).map((cell, ci) => {
                const highlight = row.kind === "structural" && ci === sharedCol;
                const empty = !cell.trim();
                return (
                  <td
                    key={ci}
                    className={`whitespace-nowrap px-3 py-1.5 ${colAlign(ci)} ${
                      ci === 0 ? "font-medium text-slate-700" : "text-slate-800"
                    } ${highlight ? "font-semibold text-red-700" : ""}`}
                  >
                    {missing ? (
                      <span className="text-slate-300">—</span>
                    ) : empty && ci > 0 ? (
                      <span className="text-slate-300"> </span>
                    ) : (
                      cell
                    )}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MemoriaCompareTable({
  table,
  emphasizeStructural,
}: {
  table: ComparedTable;
  emphasizeStructural?: boolean;
}) {
  const { priorHeader, currentHeader, priorCols, currentCols, priorSharedCol, currentSharedCol, rows } =
    table;
  if (rows.length === 0 && priorHeader.length === 0 && currentHeader.length === 0) return null;

  return (
    <div className="my-5 grid grid-cols-2 gap-x-0">
      <div className="min-w-0 overflow-x-auto pr-6">
        <MemoriaSideTable
          header={priorHeader}
          cols={priorCols}
          rows={rows}
          side="prior"
          sharedCol={priorSharedCol}
          emphasizeStructural={emphasizeStructural}
        />
      </div>
      <div className="min-w-0 overflow-x-auto pl-6">
        <MemoriaSideTable
          header={currentHeader}
          cols={currentCols}
          rows={rows}
          side="current"
          sharedCol={currentSharedCol}
          emphasizeStructural={emphasizeStructural}
        />
      </div>
    </div>
  );
}

function CompareLegend() {
  return (
    <p className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-3 rounded-sm bg-blue-200" />
        Solo cambian años o cifras
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
  // Agrupa bloques de texto consecutivos en un único grid 2 columnas (prior | current).
  const grupos: (
    | { type: "text"; lines: ComparedLine[] }
    | { type: "table"; table: ComparedTable }
  )[] = [];

  let textRun: ComparedLine[] = [];
  const flushTextRun = () => {
    if (textRun.length > 0) {
      grupos.push({ type: "text", lines: textRun });
      textRun = [];
    }
  };

  for (const block of blocks) {
    if (block.type === "table") {
      flushTextRun();
      grupos.push({ type: "table", table: block.table });
    } else {
      textRun.push(block.line);
    }
  }
  flushTextRun();

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 top-0 z-10 w-[3px] -translate-x-1/2 bg-slate-400"
        aria-hidden
      />

      <div className="relative z-0 mb-3 grid grid-cols-2 gap-x-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        <div className="pr-6">{priorLabel}</div>
        <div className="pl-6 text-right text-blue-900">{currentLabel}</div>
      </div>

      <div className="relative z-0 flex flex-col gap-0">
        {grupos.map((grupo, gi) =>
          grupo.type === "text" ? (
            <div key={`txt-${gi}`} className="flex w-full flex-col">
              {grupo.lines.map((line, i) => (
                <DiffRow
                  key={i}
                  line={line}
                  highlightQuery={highlightQuery}
                  emphasizeStructural={emphasizeStructural}
                />
              ))}
            </div>
          ) : (
            <MemoriaCompareTable
              key={`tbl-${gi}`}
              table={grupo.table}
              emphasizeStructural={emphasizeStructural}
            />
          )
        )}
      </div>
    </div>
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
