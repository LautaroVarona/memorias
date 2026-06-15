import type { Evidence, EvidenceImportance } from "@/types/case-data";
import { formatEuro } from "./accounts";

export function withEuro(
  type: Evidence["type"],
  reference: string,
  value: number,
  importance: EvidenceImportance = "medium",
  text?: string
): Evidence {
  return {
    type,
    reference,
    value,
    formattedValue: formatEuro(value),
    importance,
    text,
  };
}

export function withText(
  type: Evidence["type"],
  reference: string,
  text: string,
  importance: EvidenceImportance = "medium"
): Evidence {
  return { type, reference, text, importance };
}

export function enrichEvidence(items: Evidence[]): Evidence[] {
  return items.map((e) => ({
    ...e,
    formattedValue:
      e.formattedValue ?? (e.value !== undefined ? formatEuro(e.value) : undefined),
    importance: e.importance ?? (e.value !== undefined && e.value > 100000 ? "high" : "medium"),
  }));
}

export function buildCrossEvidence(
  excelRef: string,
  excelVal: number,
  memRef: string,
  memVal?: number,
  memText?: string,
  excelImportance: EvidenceImportance = "high"
): Evidence[] {
  const evidence: Evidence[] = [withEuro("excel", excelRef, excelVal, excelImportance)];
  if (memVal !== undefined) {
    evidence.push(withEuro("memory", memRef, memVal, excelImportance));
  } else if (memText) {
    evidence.push(withText("memory", memRef, memText, "high"));
  }
  return evidence;
}
