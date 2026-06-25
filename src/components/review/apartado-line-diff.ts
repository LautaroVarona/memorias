import { diffChars } from "diff";
import { normalizarTextoComparacionInteranual } from "@/lib/rules/helpers/text-normalize";
import {
  buildTableComparison,
  cifrasEquivalentes,
  limpiarCeldaTabla,
  summarizeTableDiff,
  tableHasChanges,
  type ComparedTable,
} from "./apartado-table-diff";
import { segmentMemoriaContent, type MemoriaSegment } from "./parse-pipe-table";
import {
  agruparLineasEnParrafos,
  normalizarBloquesComparacion,
} from "./text-paragraph-group";

export type LineDiffKind = "unchanged" | "expected" | "structural" | "removed" | "added";

export interface ComparedLine {
  kind: LineDiffKind;
  prior: string;
  current: string;
}

export type ComparedBlock =
  | { type: "text"; line: ComparedLine }
  | { type: "table"; table: ComparedTable };

interface ArrayDiffChunk<T> {
  value: T[];
  paired?: T[];
  added?: boolean;
  removed?: boolean;
}

function blocksMatch(a: string, b: string): boolean {
  return textosEquivalentes(a, b);
}

/** Alineación LCS: empareja bloques idénticos o equivalentes (solo cambian cifras/años). */
function diffBlocks(oldArr: string[], newArr: string[]): ArrayDiffChunk<string>[] {
  const n = oldArr.length;
  const m = newArr.length;
  const dp = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = blocksMatch(oldArr[i], newArr[j])
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const changes: ArrayDiffChunk<string>[] = [];
  let i = 0;
  let j = 0;

  while (i < n || j < m) {
    if (i < n && j < m && blocksMatch(oldArr[i], newArr[j])) {
      const priorRun: string[] = [];
      const currentRun: string[] = [];
      while (i < n && j < m && blocksMatch(oldArr[i], newArr[j])) {
        priorRun.push(oldArr[i]);
        currentRun.push(newArr[j]);
        i++;
        j++;
      }
      changes.push({ value: priorRun, paired: currentRun });
    } else if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) {
      changes.push({ value: [oldArr[i]], removed: true });
      i++;
    } else {
      changes.push({ value: [newArr[j]], added: true });
      j++;
    }
  }

  return changes;
}

/** Cambio solo de cifras o años (curso lectivo), no de redacción. */
export function isSoloCambioEsperado(prior: string, current: string): boolean {
  const p = limpiarCeldaTabla(prior);
  const c = limpiarCeldaTabla(current);
  if (p === c) return false;
  if (cifrasEquivalentes(p, c)) return false;
  return normalizarTextoComparacionInteranual(p) === normalizarTextoComparacionInteranual(c);
}

function normalizeTextForDiff(text: string): string {
  return limpiarCeldaTabla(
    text
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
  );
}

function textosEquivalentes(a: string, b: string): boolean {
  if (a === b) return true;
  if (cifrasEquivalentes(a, b)) return true;
  return normalizarTextoComparacionInteranual(a) === normalizarTextoComparacionInteranual(b);
}

/** Agrupa párrafos e ítems de lista; líneas vacías marcan corte de párrafo (como Word). */
function splitTextBlocks(text: string): string[] {
  const normalized = normalizeTextForDiff(text);
  if (!normalized.trim()) return [];

  const blocks: string[] = [];
  let chunk: string[] = [];

  for (const raw of normalized.split("\n")) {
    const line = raw.trim();
    if (!line) {
      if (chunk.length > 0) {
        blocks.push(...agruparLineasEnParrafos(chunk));
        chunk = [];
      }
      continue;
    }
    if (line.includes("|")) continue;
    chunk.push(line);
  }

  if (chunk.length > 0) {
    blocks.push(...agruparLineasEnParrafos(chunk));
  }

  return normalizarBloquesComparacion(blocks);
}

function segmentKey(seg: MemoriaSegment): string {
  if (seg.type === "text") {
    return `t:${normalizarTextoComparacionInteranual(seg.content).slice(0, 240)}`;
  }
  const labels = seg.rows
    .slice(0, 6)
    .map((r) => normalizarTextoComparacionInteranual(r.cells[0] ?? ""))
    .join("|");
  return `tbl:${labels}`;
}

function segmentsToBlocks(segments: MemoriaSegment[]): { key: string; segment: MemoriaSegment }[] {
  return segments.map((segment) => ({ key: segmentKey(segment), segment }));
}

function classifyPair(prior: string, current: string): ComparedLine {
  const p = normalizeTextForDiff(prior);
  const c = normalizeTextForDiff(current);
  if (p === c || textosEquivalentes(p, c)) {
    return { kind: "unchanged", prior: p, current: c };
  }
  if (isSoloCambioEsperado(p, c)) {
    return { kind: "expected", prior: p, current: c };
  }
  return { kind: "structural", prior: p, current: c };
}

function appendParrafo(base: string, extra: string): string {
  if (!base.trim()) return extra;
  if (!extra.trim()) return base;
  return `${base}\n\n${extra}`;
}

function pushComparedLine(result: ComparedBlock[], line: ComparedLine) {
  result.push({ type: "text", line });
}

/** Expande una fila con varios párrafos embebidos en filas alineadas 1:1. */
function expandTextLineToRows(line: ComparedLine): ComparedLine[] {
  const priorBlocks = splitTextBlocks(line.prior);
  const currentBlocks = splitTextBlocks(line.current);

  if (priorBlocks.length <= 1 && currentBlocks.length <= 1) {
    const prior = priorBlocks[0] ?? line.prior.trim();
    const current = currentBlocks[0] ?? line.current.trim();
    if (prior === line.prior && current === line.current) return [line];
    return [{ ...line, prior, current }];
  }

  const max = Math.max(priorBlocks.length, currentBlocks.length);
  const rows: ComparedLine[] = [];
  for (let i = 0; i < max; i++) {
    const prior = priorBlocks[i] ?? "";
    const current = currentBlocks[i] ?? "";
    if (prior && current) {
      rows.push(classifyPair(prior, current));
    } else if (prior) {
      rows.push({ kind: "removed", prior, current: "" });
    } else if (current) {
      rows.push({ kind: "added", prior: "", current });
    }
  }
  return rows;
}

function flattenBlocksForAlignedDisplay(blocks: ComparedBlock[]): ComparedBlock[] {
  const result: ComparedBlock[] = [];
  for (const block of blocks) {
    if (block.type === "table") {
      result.push(block);
      continue;
    }
    for (const line of expandTextLineToRows(block.line)) {
      result.push({ type: "text", line });
    }
  }
  return result;
}

/** Fusiona bloques consecutivos en el lado más largo para alinear memorias con distinta maquetación. */
function equilibrarListasBloques(a: string[], b: string[]): [string[], string[]] {
  const left = [...a];
  const right = [...b];
  let guard = 0;

  while (left.length !== right.length && guard++ < 80) {
    if (left.length > right.length) {
      let merged = false;
      for (let i = 0; i < left.length - 1; i++) {
        const joined = appendParrafo(left[i], left[i + 1]);
        const target = right[i];
        if (target !== undefined && blocksMatch(joined, target)) {
          left.splice(i, 2, joined);
          merged = true;
          break;
        }
      }
      if (!merged) break;
    } else {
      let merged = false;
      for (let i = 0; i < right.length - 1; i++) {
        const joined = appendParrafo(right[i], right[i + 1]);
        const target = left[i];
        if (target !== undefined && blocksMatch(joined, target)) {
          right.splice(i, 2, joined);
          merged = true;
          break;
        }
      }
      if (!merged) break;
    }
  }

  return [left, right];
}

function pairTextBlocks(priorBlocks: string[], currentBlocks: string[]): ComparedBlock[] {
  const [priorEq, currentEq] = equilibrarListasBloques(priorBlocks, currentBlocks);
  const changes = diffBlocks(priorEq, currentEq);
  const result: ComparedBlock[] = [];

  let i = 0;
  while (i < changes.length) {
    const change = changes[i];

    if (!change.added && !change.removed) {
      const priorRun = change.value as string[];
      const currentRun = change.paired ?? priorRun;
      for (let k = 0; k < priorRun.length; k++) {
        pushComparedLine(result, classifyPair(priorRun[k], currentRun[k] ?? priorRun[k]));
      }
      i++;
      continue;
    }

    const removedBlocks: string[] = [];
    const addedBlocks: string[] = [];
    while (i < changes.length && (changes[i].added || changes[i].removed)) {
      if (changes[i].removed) removedBlocks.push(...(changes[i].value as string[]));
      if (changes[i].added) addedBlocks.push(...(changes[i].value as string[]));
      i++;
    }

    const mergedMatch =
      removedBlocks.length > 0 &&
      addedBlocks.length > 0 &&
      textosEquivalentes(removedBlocks.join(" "), addedBlocks.join(" "));
    if (mergedMatch) {
      pushComparedLine(result, {
        kind: "unchanged",
        prior: normalizeTextForDiff(removedBlocks.join("\n\n")),
        current: normalizeTextForDiff(addedBlocks.join("\n\n")),
      });
      continue;
    }

    const pairs = Math.max(removedBlocks.length, addedBlocks.length);
    for (let j = 0; j < pairs; j++) {
      const prior = removedBlocks[j] ?? "";
      const current = addedBlocks[j] ?? "";
      if (prior && current) {
        pushComparedLine(result, classifyPair(prior, current));
      } else if (prior) {
        result.push({ type: "text", line: { kind: "removed", prior, current: "" } });
      } else if (current) {
        result.push({ type: "text", line: { kind: "added", prior: "", current } });
      }
    }
  }

  return result;
}

function tableSegmentToText(seg: MemoriaSegment): string {
  if (seg.type !== "table") return "";
  return seg.rows.map((row) => row.cells.join(" | ")).join("\n");
}

function alignSegments(
  priorSegs: MemoriaSegment[],
  currentSegs: MemoriaSegment[]
): ComparedBlock[] {
  const prior = segmentsToBlocks(priorSegs);
  const current = segmentsToBlocks(currentSegs);
  const changes = diffBlocks(
    prior.map((b) => b.key),
    current.map((b) => b.key)
  );

  const result: ComparedBlock[] = [];
  let pi = 0;
  let ci = 0;
  let i = 0;

  while (i < changes.length) {
    const change = changes[i];

    if (!change.added && !change.removed) {
      const runLen = change.value.length;
      for (let k = 0; k < runLen; k++) {
        const pSeg = prior[pi + k]?.segment;
        const cSeg = current[ci + k]?.segment;
        if (!pSeg || !cSeg) continue;

        if (pSeg.type === "table" && cSeg.type === "table") {
          const table = buildTableComparison(
            tableSegmentToText(pSeg),
            tableSegmentToText(cSeg)
          );
          result.push({ type: "table", table });
        } else if (pSeg.type === "text" && cSeg.type === "text") {
          result.push(...pairTextBlocks(splitTextBlocks(pSeg.content), splitTextBlocks(cSeg.content)));
        } else {
          result.push(
            ...pairTextBlocks(
              [pSeg.type === "text" ? pSeg.content : tableSegmentToText(pSeg)],
              [cSeg.type === "text" ? cSeg.content : tableSegmentToText(cSeg)]
            )
          );
        }
      }
      pi += runLen;
      ci += runLen;
      i++;
      continue;
    }

    const removedKeys: string[] = [];
    const addedKeys: string[] = [];
    while (i < changes.length && (changes[i].added || changes[i].removed)) {
      if (changes[i].removed) removedKeys.push(...(changes[i].value as string[]));
      if (changes[i].added) addedKeys.push(...(changes[i].value as string[]));
      i++;
    }

    const pairs = Math.max(removedKeys.length, addedKeys.length);
    for (let j = 0; j < pairs; j++) {
      const pSeg = prior[pi]?.segment;
      const cSeg = current[ci]?.segment;

      if (pSeg && cSeg) {
        if (pSeg.type === "table" && cSeg.type === "table") {
          result.push({
            type: "table",
            table: buildTableComparison(tableSegmentToText(pSeg), tableSegmentToText(cSeg)),
          });
        } else {
          result.push(
            ...pairTextBlocks(
              [pSeg.type === "text" ? pSeg.content : tableSegmentToText(pSeg)],
              [cSeg.type === "text" ? cSeg.content : tableSegmentToText(cSeg)]
            )
          );
        }
        pi++;
        ci++;
      } else if (pSeg) {
        if (pSeg.type === "table") {
          result.push({
            type: "table",
            table: buildTableComparison(tableSegmentToText(pSeg), ""),
          });
        } else {
          result.push({ type: "text", line: { kind: "removed", prior: pSeg.content, current: "" } });
        }
        pi++;
      } else if (cSeg) {
        if (cSeg.type === "table") {
          result.push({
            type: "table",
            table: buildTableComparison("", tableSegmentToText(cSeg)),
          });
        } else {
          result.push({ type: "text", line: { kind: "added", prior: "", current: cSeg.content } });
        }
        ci++;
      }
    }
  }

  return result;
}

export function buildContentComparison(priorText: string, currentText: string): ComparedBlock[] {
  const priorSegs = segmentMemoriaContent(normalizeTextForDiff(priorText));
  const currentSegs = segmentMemoriaContent(normalizeTextForDiff(currentText));

  if (priorSegs.length === 0 && currentSegs.length === 0) return [];
  if (priorSegs.length === 0) {
    return flattenBlocksForAlignedDisplay(
      currentSegs.flatMap((seg): ComparedBlock[] => {
        if (seg.type === "table") {
          return [{ type: "table", table: buildTableComparison("", tableSegmentToText(seg)) }];
        }
        return splitTextBlocks(seg.content).map((block) => ({
          type: "text",
          line: { kind: "added", prior: "", current: block },
        }));
      })
    );
  }
  if (currentSegs.length === 0) {
    return flattenBlocksForAlignedDisplay(
      priorSegs.flatMap((seg): ComparedBlock[] => {
        if (seg.type === "table") {
          return [{ type: "table", table: buildTableComparison(tableSegmentToText(seg), "") }];
        }
        return splitTextBlocks(seg.content).map((block) => ({
          type: "text",
          line: { kind: "removed", prior: block, current: "" },
        }));
      })
    );
  }

  return flattenBlocksForAlignedDisplay(alignSegments(priorSegs, currentSegs));
}

export function hasContentDiff(priorText: string, currentText: string): boolean {
  return summarizeMemoriaDiff(priorText, currentText).hasDiff;
}

export interface MemoriaDiffSummary {
  hasDiff: boolean;
  hasStructuralDiff: boolean;
  structuralCount: number;
  expectedCount: number;
}

export function isStructuralDiffKind(kind: LineDiffKind): boolean {
  return kind === "structural" || kind === "removed" || kind === "added";
}

function countBlockDiff(block: ComparedBlock): { structural: number; expected: number } {
  if (block.type === "text") {
    if (block.line.kind === "unchanged") return { structural: 0, expected: 0 };
    if (block.line.kind === "expected") return { structural: 0, expected: 1 };
    return { structural: 1, expected: 0 };
  }
  const summary = summarizeTableDiff(block.table);
  return { structural: summary.structuralCount, expected: summary.expectedCount };
}

export function summarizeMemoriaDiff(priorText: string, currentText: string): MemoriaDiffSummary {
  const empty: MemoriaDiffSummary = {
    hasDiff: false,
    hasStructuralDiff: false,
    structuralCount: 0,
    expectedCount: 0,
  };
  if (!priorText?.trim() || !currentText?.trim()) return empty;

  const blocks = buildContentComparison(priorText, currentText);
  let structuralCount = 0;
  let expectedCount = 0;
  for (const block of blocks) {
    const counts = countBlockDiff(block);
    structuralCount += counts.structural;
    expectedCount += counts.expected;
  }

  return {
    hasDiff: structuralCount + expectedCount > 0,
    hasStructuralDiff: structuralCount > 0,
    structuralCount,
    expectedCount,
  };
}

export function filterChangedBlocks(blocks: ComparedBlock[]): ComparedBlock[] {
  return blocks.filter((block) => {
    if (block.type === "text") return block.line.kind !== "unchanged";
    return tableHasChanges(block.table);
  });
}

export function filterChangedLines(lines: ComparedLine[]): ComparedLine[] {
  return lines.filter((line) => line.kind !== "unchanged");
}

/** @deprecated Preferir buildContentComparison para soporte de tablas alineadas. */
export function buildLineComparison(priorText: string, currentText: string): ComparedLine[] {
  return buildContentComparison(priorText, currentText).flatMap((block) => {
    if (block.type === "text") return [block.line];
    return block.table.rows.map((row) => ({
      kind: row.kind,
      prior: (row.prior ?? []).join(" | "),
      current: (row.current ?? []).join(" | "),
    }));
  });
}

export type HighlightPart = { key: number; text: string; expected: boolean };

export function tokenizeForHighlight(text: string): HighlightPart[] {
  const parts = text.split(/(\b20\d{2}\b|\d[\d.,]*(?:\s*€)?)/g).filter(Boolean);
  return parts.map((part, i) => ({
    key: i,
    text: part,
    expected: /^\b20\d{2}\b$/.test(part) || /^\d[\d.,]*(?:\s*€)?$/.test(part),
  }));
}

export type CharDiffKind = "equal" | "removed" | "added";

export interface CharDiffSegment {
  text: string;
  kind: CharDiffKind;
}

/** Resalta solo los caracteres que difieren entre dos cadenas alineadas. */
export function buildCharDiffSegments(prior: string, current: string): {
  prior: CharDiffSegment[];
  current: CharDiffSegment[];
} {
  const priorSegments: CharDiffSegment[] = [];
  const currentSegments: CharDiffSegment[] = [];

  for (const change of diffChars(prior, current)) {
    if (change.removed) {
      priorSegments.push({ text: change.value, kind: "removed" });
    } else if (change.added) {
      currentSegments.push({ text: change.value, kind: "added" });
    } else {
      const segment = { text: change.value, kind: "equal" as const };
      priorSegments.push(segment);
      currentSegments.push(segment);
    }
  }

  return { prior: priorSegments, current: currentSegments };
}

export function charSegmentsForLine(
  line: ComparedLine,
  side: "prior" | "current"
): CharDiffSegment[] | null {
  const text = side === "prior" ? line.prior : line.current;
  if (!text) return null;

  if (line.kind === "unchanged" || line.kind === "expected") return null;

  if (line.kind === "removed") {
    return side === "prior" ? [{ text, kind: "removed" }] : null;
  }
  if (line.kind === "added") {
    return side === "current" ? [{ text, kind: "added" }] : null;
  }

  const segments = buildCharDiffSegments(line.prior, line.current);
  return side === "prior" ? segments.prior : segments.current;
}

export function isRupturaKind(kind: LineDiffKind): boolean {
  return isStructuralDiffKind(kind);
}
