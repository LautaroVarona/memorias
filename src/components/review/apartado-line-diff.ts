import { normalizarTextoComparacionInteranual } from "@/lib/rules/helpers/text-normalize";

export type LineDiffKind = "unchanged" | "expected" | "structural" | "removed" | "added";

export interface ComparedLine {
  kind: LineDiffKind;
  prior: string;
  current: string;
}

interface ArrayDiffChunk<T> {
  value: T[];
  added?: boolean;
  removed?: boolean;
}

/** Alineación LCS equivalente a diffArrays de la librería `diff`. */
function diffBlocks(oldArr: string[], newArr: string[]): ArrayDiffChunk<string>[] {
  const n = oldArr.length;
  const m = newArr.length;
  const dp = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        oldArr[i] === newArr[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const changes: ArrayDiffChunk<string>[] = [];
  let i = 0;
  let j = 0;

  while (i < n || j < m) {
    if (i < n && j < m && oldArr[i] === newArr[j]) {
      const value: string[] = [];
      while (i < n && j < m && oldArr[i] === newArr[j]) {
        value.push(oldArr[i]);
        i++;
        j++;
      }
      changes.push({ value });
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      changes.push({ value: [newArr[j]], added: true });
      j++;
    } else {
      changes.push({ value: [oldArr[i]], removed: true });
      i++;
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
    const next = changes[i + 1];

    if (!change.added && !change.removed) {
      for (const block of change.value as string[]) {
        result.push({ kind: "unchanged", prior: block, current: block });
      }
      i++;
      continue;
    }

    if (change.removed && next?.added) {
      const priorItems = change.value as string[];
      const currentItems = next.value as string[];
      const pairs = Math.min(priorItems.length, currentItems.length);

      for (let j = 0; j < pairs; j++) {
        result.push(classifyPair(priorItems[j], currentItems[j]));
      }
      for (let j = pairs; j < priorItems.length; j++) {
        result.push({ kind: "removed", prior: priorItems[j], current: "" });
      }
      for (let j = pairs; j < currentItems.length; j++) {
        result.push({ kind: "added", prior: "", current: currentItems[j] });
      }
      i += 2;
      continue;
    }

    if (change.removed) {
      for (const block of change.value as string[]) {
        result.push({ kind: "removed", prior: block, current: "" });
      }
      i++;
      continue;
    }

    if (change.added) {
      for (const block of change.value as string[]) {
        result.push({ kind: "added", prior: "", current: block });
      }
      i++;
      continue;
    }

    i++;
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
