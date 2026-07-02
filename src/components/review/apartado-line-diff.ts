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
  claveSemanticaBloque,
  esEncabezadoSubseccionLista,
  etiquetaEncabezadoSubseccion,
  lineasDeTexto,
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

function bloquesListaEquivalentes(a: string, b: string): boolean {
  const strip = (s: string) =>
    s
      .trim()
      .replace(/^[-–—]\s*/, "")
      .replace(/[.;:]+$/g, "")
      .replace(/\s+/g, " ");
  return (
    normalizarTextoComparacionInteranual(strip(a)) ===
    normalizarTextoComparacionInteranual(strip(b))
  );
}

function elegirTextoDisplay(a: string, b: string): string {
  if (/^[a-z]\)\s/i.test(a.trim())) return a.trim();
  if (/^[a-z]\)\s/i.test(b.trim())) return b.trim();
  if (/^[-–—]\s/.test(a.trim())) return a.trim().replace(/^[-–—]/, "-");
  if (/^[-–—]\s/.test(b.trim())) return b.trim().replace(/^[-–—]/, "-");
  return (a.trim().length >= b.trim().length ? a : b).trim();
}

function blocksMatch(a: string, b: string): boolean {
  if (textosEquivalentes(a, b)) return true;
  if (bloquesListaEquivalentes(a, b)) return true;
  const ka = claveSemanticaBloque(a);
  const kb = claveSemanticaBloque(b);
  if (ka && ka === kb) return true;
  if (esEncabezadoSubseccionLista(a) && esEncabezadoSubseccionLista(b)) {
    return etiquetaEncabezadoSubseccion(a) === etiquetaEncabezadoSubseccion(b);
  }
  return false;
}

/** Alineación LCS genérica: empareja elementos idénticos o equivalentes. */
function diffArrays<T>(
  oldArr: T[],
  newArr: T[],
  match: (a: T, b: T) => boolean
): ArrayDiffChunk<T>[] {
  const n = oldArr.length;
  const m = newArr.length;
  const dp = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = match(oldArr[i], newArr[j])
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const changes: ArrayDiffChunk<T>[] = [];
  let i = 0;
  let j = 0;

  while (i < n || j < m) {
    if (i < n && j < m && match(oldArr[i], newArr[j])) {
      const priorRun: T[] = [];
      const currentRun: T[] = [];
      while (i < n && j < m && match(oldArr[i], newArr[j])) {
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

/** Alineación LCS: empareja bloques idénticos o equivalentes (solo cambian cifras/años). */
function diffBlocks(oldArr: string[], newArr: string[]): ArrayDiffChunk<string>[] {
  return diffArrays(oldArr, newArr, blocksMatch);
}

/** Cambio solo de cifras o años (curso lectivo), no de redacción. */
export function isSoloCambioEsperado(prior: string, current: string): boolean {
  const p = limpiarCeldaTabla(prior);
  const c = limpiarCeldaTabla(current);
  if (p === c) return false;
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
  if (normalizarTextoComparacionInteranual(a) === normalizarTextoComparacionInteranual(b)) return true;
  return cifrasEquivalentes(a, b);
}

/** Descompone bloques (incluso fusionados con \\n\\n) en un párrafo por elemento. */
function aplanarBloquesAParrafo(blocks: string[]): string[] {
  return blocks.flatMap((b) => {
    const partes = splitTextBlocks(b);
    return partes.length > 0 ? partes : b.trim() ? [b.trim()] : [];
  });
}

/** Misma secuencia de párrafos; solo puede variar la maquetación (saltos de línea). */
function parrafosEquivalentes(a: string, b: string): boolean {
  const pa = splitTextBlocks(a);
  const pb = splitTextBlocks(b);
  if (pa.length === 0 && pb.length === 0) return true;
  if (pa.length !== pb.length) return false;
  return pa.every((p, i) => textosEquivalentes(p, pb[i] ?? ""));
}

/** Texto canónico para mostrar un par equivalente (misma apariencia en ambos lados). */
function textoDisplayParrafo(a: string, b: string): string {
  const pa = splitTextBlocks(a);
  const pb = splitTextBlocks(b);
  if (pa.length === 1 && pb.length === 1) return pa[0].trim();
  if (pa.length === 1) return pa[0].trim();
  if (pb.length === 1) return pb[0].trim();
  return a.trim();
}

/**
 * Parte el texto en párrafos/ítems comparables.
 * Las líneas en blanco de Word (\\n\\n) se ignoran: el corte lo marca la semántica
 * (títulos, listas, fin de frase), no la maquetación decorativa.
 */
function splitTextBlocks(text: string): string[] {
  const normalized = normalizeTextForDiff(text);
  if (!normalized.trim()) return [];

  const lines = lineasDeTexto(normalized);
  if (lines.length === 0) return [];

  return normalizarBloquesComparacion(agruparLineasEnParrafos(lines));
}

function tablaContextoKey(seg?: MemoriaSegment): string {
  if (!seg || seg.type !== "table") return "";
  const header = seg.cabecera ?? seg.rows[0]?.cells ?? [];
  const titulo = normalizarTextoComparacionInteranual(header[0] ?? "").slice(0, 80);
  const headerKey = header
    .map((c) => normalizarTextoComparacionInteranual(c))
    .filter((c) => c.length > 0)
    .slice(0, 3)
    .join("+");
  const dataRows = seg.rows.length > 1 ? seg.rows.slice(1) : [];
  const primeraEtiqueta =
    dataRows
      .map((r) => normalizarTextoComparacionInteranual(r.cells[0] ?? ""))
      .find((l) => l.length >= 3) ?? "";
  return `tbl:${titulo}::${headerKey}::${primeraEtiqueta}`;
}

type FlatTextUnit = { kind: "text"; content: string };
type FlatTableUnit = { kind: "table"; segment: Extract<MemoriaSegment, { type: "table" }> };
type FlatUnit = FlatTextUnit | FlatTableUnit;

/** Descompone segmentos en párrafos y tablas atómicos para alinear memorias con inserciones intermedias. */
function flattenSegments(segs: MemoriaSegment[]): FlatUnit[] {
  const units: FlatUnit[] = [];
  for (const seg of segs) {
    if (seg.type === "table") {
      if (seg.rows.length === 0) continue;
      units.push({ kind: "table", segment: seg });
      continue;
    }
    const paras = splitTextBlocks(seg.content);
    for (const content of paras) {
      if (content.trim()) units.push({ kind: "text", content });
    }
  }
  return units;
}

function unitsMatch(a: FlatUnit, b: FlatUnit): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "text" && b.kind === "text") return blocksMatch(a.content, b.content);
  if (a.kind === "table" && b.kind === "table") {
    const ak = tablaContextoKey(a.segment);
    const bk = tablaContextoKey(b.segment);
    return ak.length > 0 && ak === bk;
  }
  return false;
}

function compareUnitPair(p: FlatUnit, c: FlatUnit): ComparedBlock[] {
  if (p.kind === "table" && c.kind === "table") {
    return [
      {
        type: "table",
        table: buildTableComparison(tableSegmentToText(p.segment), tableSegmentToText(c.segment)),
      },
    ];
  }
  if (p.kind === "text" && c.kind === "text") {
    return [{ type: "text", line: classifyPair(p.content, c.content) }];
  }
  return pairTextBlocks(
    [p.kind === "text" ? p.content : tableSegmentToText(p.segment)],
    [c.kind === "text" ? c.content : tableSegmentToText(c.segment)]
  );
}

function unitToRemoved(u: FlatUnit): ComparedBlock {
  if (u.kind === "table") {
    return { type: "table", table: buildTableComparison(tableSegmentToText(u.segment), "") };
  }
  return { type: "text", line: { kind: "removed", prior: u.content, current: "" } };
}

function unitToAdded(u: FlatUnit): ComparedBlock {
  if (u.kind === "table") {
    return { type: "table", table: buildTableComparison("", tableSegmentToText(u.segment)) };
  }
  return { type: "text", line: { kind: "added", prior: "", current: u.content } };
}

/** Reempareja unidades no alineadas por LCS buscando coincidencias semánticas (párrafos idénticos desplazados). */
function pairUnmatchedUnits(removed: FlatUnit[], added: FlatUnit[]): ComparedBlock[] {
  const out: ComparedBlock[] = [];
  const usedAdded = new Set<number>();

  for (const r of removed) {
    let matchIdx = -1;
    for (let j = 0; j < added.length; j++) {
      if (usedAdded.has(j)) continue;
      if (unitsMatch(r, added[j]!)) {
        matchIdx = j;
        break;
      }
    }
    if (matchIdx >= 0) {
      usedAdded.add(matchIdx);
      out.push(...compareUnitPair(r, added[matchIdx]!));
    } else {
      out.push(unitToRemoved(r));
    }
  }

  for (let j = 0; j < added.length; j++) {
    if (!usedAdded.has(j)) out.push(unitToAdded(added[j]!));
  }

  return out;
}

function alignFlatUnits(priorUnits: FlatUnit[], currentUnits: FlatUnit[]): ComparedBlock[] {
  const changes = diffArrays(priorUnits, currentUnits, unitsMatch);
  const result: ComparedBlock[] = [];
  let i = 0;

  while (i < changes.length) {
    const change = changes[i]!;
    if (!change.added && !change.removed) {
      const priorRun = change.value;
      const currentRun = change.paired ?? priorRun;
      for (let k = 0; k < priorRun.length; k++) {
        result.push(...compareUnitPair(priorRun[k]!, currentRun[k]!));
      }
      i++;
      continue;
    }

    const removed: FlatUnit[] = [];
    const added: FlatUnit[] = [];
    while (i < changes.length && (changes[i]!.added || changes[i]!.removed)) {
      if (changes[i]!.removed) removed.push(...changes[i]!.value);
      if (changes[i]!.added) added.push(...changes[i]!.value);
      i++;
    }
    result.push(...pairUnmatchedUnits(removed, added));
  }

  return result;
}

function classifyPair(prior: string, current: string): ComparedLine {
  const p = normalizeTextForDiff(prior).trim();
  const c = normalizeTextForDiff(current).trim();
  if (p === c) {
    return { kind: "unchanged", prior: p, current: c };
  }
  if (normalizarTextoComparacionInteranual(p) === normalizarTextoComparacionInteranual(c)) {
    return { kind: "expected", prior: p, current: c };
  }
  // Antes de equivalencias semánticas: si solo cambian años/cifras, mostrar cada lado
  // con su texto real (no colapsar en "unchanged" vía normalización interanual).
  if (isSoloCambioEsperado(p, c)) {
    return { kind: "expected", prior: p, current: c };
  }
  if (parrafosEquivalentes(p, c)) {
    const display = elegirTextoDisplay(p, c);
    return { kind: "unchanged", prior: display, current: display };
  }
  const kp = claveSemanticaBloque(p);
  const kc = claveSemanticaBloque(c);
  if (kp && kp === kc) {
    const display = elegirTextoDisplay(p, c);
    return { kind: "unchanged", prior: display, current: display };
  }
  if (
    esEncabezadoSubseccionLista(p) &&
    esEncabezadoSubseccionLista(c) &&
    etiquetaEncabezadoSubseccion(p) === etiquetaEncabezadoSubseccion(c)
  ) {
    const display = elegirTextoDisplay(p, c);
    return { kind: "unchanged", prior: display, current: display };
  }
  if (bloquesListaEquivalentes(p, c)) {
    const display = elegirTextoDisplay(p, c);
    return { kind: "unchanged", prior: display, current: display };
  }
  return { kind: "structural", prior: p, current: c };
}

function appendParrafo(base: string, extra: string): string {
  if (!base.trim()) return extra;
  if (!extra.trim()) return base;
  return `${base}\n${extra}`;
}

function pushComparedLine(result: ComparedBlock[], line: ComparedLine) {
  result.push({ type: "text", line });
}

/** Expande una fila en párrafos alineados 1:1 (prior | current). */
function expandTextLineToRows(line: ComparedLine): ComparedLine[] {
  const priorBlocks = splitTextBlocks(line.prior);
  const currentBlocks = splitTextBlocks(line.current);

  if (priorBlocks.length <= 1 && currentBlocks.length <= 1) {
    if (line.kind === "unchanged") {
      const display = textoDisplayParrafo(line.prior, line.current);
      return [{ ...line, prior: display, current: display }];
    }
    const prior = priorBlocks[0] ?? line.prior.trim();
    const current = currentBlocks[0] ?? line.current.trim();
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
  const priorFlat = aplanarBloquesAParrafo(priorEq);
  const currentFlat = aplanarBloquesAParrafo(currentEq);
  const changes = diffBlocks(priorFlat, currentFlat);
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

    const removedFlat = aplanarBloquesAParrafo(removedBlocks);
    const addedFlat = aplanarBloquesAParrafo(addedBlocks);

    const textPairs = diffArrays(
      removedFlat.map((t) => ({ kind: "text" as const, content: t })),
      addedFlat.map((t) => ({ kind: "text" as const, content: t })),
      (a, b) => blocksMatch(a.content, b.content)
    );

    let ri = 0;
    while (ri < textPairs.length) {
      const chunk = textPairs[ri]!;
      if (!chunk.added && !chunk.removed) {
        const priorRun = chunk.value.map((u) => u.content);
        const currentRun = (chunk.paired ?? chunk.value).map((u) => u.content);
        for (let k = 0; k < priorRun.length; k++) {
          pushComparedLine(result, classifyPair(priorRun[k]!, currentRun[k]!));
        }
        ri++;
        continue;
      }

      const removedUnits: FlatTextUnit[] = [];
      const addedUnits: FlatTextUnit[] = [];
      while (ri < textPairs.length && (textPairs[ri]!.added || textPairs[ri]!.removed)) {
        if (textPairs[ri]!.removed) removedUnits.push(...textPairs[ri]!.value);
        if (textPairs[ri]!.added) addedUnits.push(...textPairs[ri]!.value);
        ri++;
      }

      const usedAdded = new Set<number>();
      for (const r of removedUnits) {
        let matchIdx = -1;
        for (let j = 0; j < addedUnits.length; j++) {
          if (usedAdded.has(j)) continue;
          if (blocksMatch(r.content, addedUnits[j]!.content)) {
            matchIdx = j;
            break;
          }
        }
        if (matchIdx >= 0) {
          usedAdded.add(matchIdx);
          pushComparedLine(result, classifyPair(r.content, addedUnits[matchIdx]!.content));
        } else {
          result.push({ type: "text", line: { kind: "removed", prior: r.content, current: "" } });
        }
      }
      for (let j = 0; j < addedUnits.length; j++) {
        if (!usedAdded.has(j)) {
          result.push({
            type: "text",
            line: { kind: "added", prior: "", current: addedUnits[j]!.content },
          });
        }
      }
    }
  }

  return result;
}

function tableSegmentToText(seg: MemoriaSegment): string {
  if (seg.type !== "table") return "";
  return seg.rows.map((row) => row.cells.join(" | ")).join("\n");
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

  return flattenBlocksForAlignedDisplay(
    alignFlatUnits(flattenSegments(priorSegs), flattenSegments(currentSegs))
  );
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
