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

/** Columna divisoria central: línea vertical fuerte entre memoria anterior y actual. */
const DIVIDER_CELL = "w-0 border-l-[3px] border-slate-400/90 p-0";

function padCells(cells: string[] | null, n: number): string[] {
  const out = [...(cells ?? [])];
  while (out.length < n) out.push("");
  return out;
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
  const { priorHeader, currentHeader, priorCols, currentCols, priorSharedCol, currentSharedCol, rows } =
    table;
  if (rows.length === 0 && priorHeader.length === 0 && currentHeader.length === 0) return null;

  const rowBg = (kind: typeof rows[number]["kind"]): string => {
    if (kind === "structural") return emphasizeStructural ? "bg-red-100/70" : "bg-red-50/60";
    if (kind === "removed" || kind === "added") return "bg-red-50/50";
    return "";
  };

  const colAlign = (i: number) => (i === 0 ? "text-left" : "text-right font-mono tabular-nums");

  const renderSide = (
    cells: string[] | null,
    cols: number,
    sharedCol: number | null,
    kind: typeof rows[number]["kind"],
    keyPrefix: string
  ) =>
    padCells(cells, cols).map((cell, ci) => {
      const highlight = kind === "structural" && ci === sharedCol;
      const missing = cells === null;
      return (
        <td
          key={`${keyPrefix}-${ci}`}
          className={`whitespace-nowrap px-3 py-1.5 ${colAlign(ci)} ${
            ci === 0 ? "font-medium text-slate-700" : "text-slate-800"
          } ${highlight ? "font-semibold text-red-700" : ""}`}
        >
          {missing ? <span className="text-slate-300">—</span> : cell || (ci === 0 ? "" : "")}
        </td>
      );
    });

  return (
    <div className="my-5 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide">
            <th colSpan={priorCols} className="px-3 py-1.5 text-left text-slate-500">
              {priorLabel}
            </th>
            <th className={DIVIDER_CELL} aria-hidden />
            <th colSpan={currentCols} className="px-3 py-1.5 text-left text-blue-900">
              {currentLabel}
            </th>
          </tr>
          <tr className="border-y border-slate-200 bg-slate-100/70 font-semibold text-slate-700">
            {padCells(priorHeader, priorCols).map((h, i) => (
              <th key={`ph-${i}`} className={`px-3 py-1.5 ${i === 0 ? "text-left" : "text-right"}`}>
                {h}
              </th>
            ))}
            <th className={DIVIDER_CELL} aria-hidden />
            {padCells(currentHeader, currentCols).map((h, i) => (
              <th key={`ch-${i}`} className={`px-3 py-1.5 ${i === 0 ? "text-left" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={`border-b border-slate-100 last:border-0 ${rowBg(row.kind)}`}>
              {renderSide(row.prior, priorCols, priorSharedCol, row.kind, `p${ri}`)}
              <td className={DIVIDER_CELL} aria-hidden />
              {renderSide(row.current, currentCols, currentSharedCol, row.kind, `c${ri}`)}
            </tr>
          ))}
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
  // Renderiza los bloques en su ORDEN original (texto y tablas intercalados),
  // agrupando líneas de texto consecutivas en una rejilla de 2 columnas.
  const grupos: (
    | { type: "text"; lines: ComparedLine[] }
    | { type: "table"; table: ComparedTable }
  )[] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      const last = grupos[grupos.length - 1];
      if (last?.type === "text") last.lines.push(block.line);
      else grupos.push({ type: "text", lines: [block.line] });
    } else {
      grupos.push({ type: "table", table: block.table });
    }
  }

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-x-6 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        <div>{priorLabel}</div>
        <div className="text-right text-blue-900">{currentLabel}</div>
      </div>

      {grupos.map((grupo, gi) =>
        grupo.type === "text" ? (
          <div
            key={`txt-${gi}`}
            className="grid grid-cols-2 gap-x-6 text-[13px] leading-relaxed"
          >
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
            priorLabel={priorLabel}
            currentLabel={currentLabel}
            emphasizeStructural={emphasizeStructural}
          />
        )
      )}
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
