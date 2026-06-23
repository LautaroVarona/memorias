import { normalizarTextoComparacionInteranual } from "@/lib/rules/helpers/text-normalize";

export type LineDiffKind = "unchanged" | "expected" | "structural" | "removed" | "added";

export interface ComparedLine {
  kind: LineDiffKind;
  prior: string;
  current: string;
}

interface ArrayDiffChunk<T> {
  value: T[];
  paired?: T[];
  added?: boolean;
  removed?: boolean;
}

function blocksMatch(a: string, b: string): boolean {
  if (a === b) return true;
  return normalizarTextoComparacionInteranual(a) === normalizarTextoComparacionInteranual(b);
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
  if (prior === current) return false;
  return normalizarTextoComparacionInteranual(prior) === normalizarTextoComparacionInteranual(current);
}

function normalizeTextForDiff(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Divide en párrafos; si no hay dobles saltos, cae a líneas para no comparar un bloque monolítico. */
function splitBlocks(text: string): string[] {
  const normalized = normalizeTextForDiff(text);
  const paragraphs = normalized
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length > 1) return paragraphs;

  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function classifyPair(prior: string, current: string): ComparedLine {
  if (prior === current) return { kind: "unchanged", prior, current };
  if (isSoloCambioEsperado(prior, current)) return { kind: "expected", prior, current };
  return { kind: "structural", prior, current };
}

export function hasContentDiff(priorText: string, currentText: string): boolean {
  if (!priorText?.trim() || !currentText?.trim()) return false;
  return buildLineComparison(priorText, currentText).some((line) => line.kind !== "unchanged");
}

export function filterChangedLines(lines: ComparedLine[]): ComparedLine[] {
  return lines.filter((line) => line.kind !== "unchanged");
}

export function buildLineComparison(priorText: string, currentText: string): ComparedLine[] {
  const priorBlocks = splitBlocks(priorText);
  const currentBlocks = splitBlocks(currentText);
  const changes = diffBlocks(priorBlocks, currentBlocks);
  const result: ComparedLine[] = [];

  let i = 0;
  while (i < changes.length) {
    const change = changes[i];

    if (!change.added && !change.removed) {
      const priorRun = change.value as string[];
      const currentRun = change.paired ?? priorRun;
      for (let k = 0; k < priorRun.length; k++) {
        result.push(classifyPair(priorRun[k], currentRun[k] ?? priorRun[k]));
      }
      i++;
      continue;
    }

    // Agrupa inserciones y eliminaciones consecutivas (en cualquier orden) y empareja por índice.
    const removedBlocks: string[] = [];
    const addedBlocks: string[] = [];
    while (i < changes.length && (changes[i].added || changes[i].removed)) {
      if (changes[i].removed) removedBlocks.push(...(changes[i].value as string[]));
      if (changes[i].added) addedBlocks.push(...(changes[i].value as string[]));
      i++;
    }

    const pairs = Math.max(removedBlocks.length, addedBlocks.length);
    for (let j = 0; j < pairs; j++) {
      const prior = removedBlocks[j] ?? "";
      const current = addedBlocks[j] ?? "";
      if (prior && current) {
        result.push(classifyPair(prior, current));
      } else if (prior) {
        result.push({ kind: "removed", prior, current: "" });
      } else if (current) {
        result.push({ kind: "added", prior: "", current });
      }
    }
  }

  return result;
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
