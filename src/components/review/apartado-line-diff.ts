import { normalizarTextoComparacionInteranual } from "@/lib/rules/helpers/text-normalize";

export type LineDiffKind = "unchanged" | "expected" | "structural" | "removed" | "added";

export interface ComparedLine {
  kind: LineDiffKind;
  prior: string;
  current: string;
}

/** Cambio solo de cifras o años (curso lectivo), no de redacción. */
export function isSoloCambioEsperado(prior: string, current: string): boolean {
  if (prior === current) return false;
  return normalizarTextoComparacionInteranual(prior) === normalizarTextoComparacionInteranual(current);
}

export function buildLineComparison(priorText: string, currentText: string): ComparedLine[] {
  const priorLines = priorText.split("\n");
  const currentLines = currentText.split("\n");
  const rows = Math.max(priorLines.length, currentLines.length);
  const result: ComparedLine[] = [];

  for (let i = 0; i < rows; i++) {
    const prior = priorLines[i] ?? "";
    const current = currentLines[i] ?? "";

    if (!prior && current) {
      result.push({ kind: "added", prior: "", current });
      continue;
    }
    if (prior && !current) {
      result.push({ kind: "removed", prior, current: "" });
      continue;
    }
    if (prior === current) {
      result.push({ kind: "unchanged", prior, current });
      continue;
    }
    if (isSoloCambioEsperado(prior, current)) {
      result.push({ kind: "expected", prior, current });
      continue;
    }
    result.push({ kind: "structural", prior, current });
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
