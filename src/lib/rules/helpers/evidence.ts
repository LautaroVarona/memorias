import type { Evidence, EvidenceImportance } from "@/types/case-data";
import { columnIndexToLetter } from "@/lib/utils/excel-coords";
import { formatEuro } from "./accounts";

export interface ExcelLocator {
  sheet: string;
  row: number;
  column?: number | string;
  documentName?: string;
}

export interface MemoryLocator {
  documentName?: string;
  page?: number;
  reference?: string;
}

export function withEuro(
  type: Evidence["type"],
  reference: string,
  value: number,
  importance: EvidenceImportance = "medium",
  text?: string,
  locator?: Partial<ExcelLocator & MemoryLocator & { group?: string }>
): Evidence {
  return {
    type,
    reference,
    value,
    formattedValue: formatEuro(value),
    importance,
    text,
    ...spreadLocator(locator),
  };
}

export function withText(
  type: Evidence["type"],
  reference: string,
  text: string,
  importance: EvidenceImportance = "medium",
  locator?: Partial<ExcelLocator & MemoryLocator & { group?: string }>
): Evidence {
  return { type, reference, text, importance, ...spreadLocator(locator) };
}

export function withExcelCell(
  reference: string,
  value: number,
  locator: ExcelLocator,
  importance: EvidenceImportance = "high",
  text?: string,
  group?: string
): Evidence {
  const column =
    typeof locator.column === "number"
      ? columnIndexToLetter(locator.column)
      : locator.column;

  return {
    type: "excel",
    reference,
    value,
    formattedValue: formatEuro(value),
    importance,
    text,
    sheet: locator.sheet,
    row: locator.row,
    column,
    documentName: locator.documentName,
    group,
  };
}

export function withMemoryLocator(
  reference: string,
  text: string,
  locator: MemoryLocator,
  importance: EvidenceImportance = "high"
): Evidence {
  return {
    type: "memory",
    reference,
    text,
    importance,
    documentName: locator.documentName,
    page: locator.page,
  };
}

function spreadLocator(
  locator?: Partial<ExcelLocator & MemoryLocator & { group?: string }>
): Partial<Evidence> {
  if (!locator) return {};
  const column =
    locator.column !== undefined && typeof locator.column === "number"
      ? columnIndexToLetter(locator.column)
      : locator.column;
  return {
    documentName: locator.documentName,
    page: locator.page,
    sheet: locator.sheet,
    row: locator.row,
    column,
    group: locator.group,
  };
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
