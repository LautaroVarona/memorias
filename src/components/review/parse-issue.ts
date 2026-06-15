import type { EvidenceItem, ParsedIssue, ValidacionView } from "./types";

export function normalizeEvidenceType(e: EvidenceItem): "excel" | "memory" {
  const t = (e.type ?? e.tipo ?? "").toLowerCase();
  return t === "memory" || t === "memoria" ? "memory" : "excel";
}

export function evRef(e: EvidenceItem): string {
  return e.reference ?? e.referencia ?? "";
}

export function evValue(e: EvidenceItem): string {
  if (e.formattedValue) return e.formattedValue;
  const v = e.value ?? e.valor;
  if (typeof v === "number") {
    return `${v.toLocaleString("es-ES")} €`;
  }
  return typeof v === "string" ? v : "";
}

export function parseExplanation(text: string): ParsedIssue {
  const parts = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    return {
      what: parts[0],
      impact: stripLabel(parts[1], ["Impacto:", "Implica:", "Por qué importa:"]),
      action: stripLabel(parts[2], ["Acción:", "Revisar:", "Qué hacer:", "Sugerencia:"]),
    };
  }
  if (parts.length === 2) {
    return { what: parts[0], impact: parts[1], action: "" };
  }
  return { what: parts[0] || text, impact: "", action: "" };
}

function stripLabel(text: string, labels: string[]): string {
  let out = text;
  for (const label of labels) {
    if (out.toLowerCase().startsWith(label.toLowerCase())) {
      out = out.slice(label.length).trim();
    }
  }
  return out;
}

export function enrichIssue(v: ValidacionView): ParsedIssue {
  const base = parseExplanation(v.explanation ?? v.mensaje);
  const excelItems = v.evidencia.filter((e) => normalizeEvidenceType(e) === "excel");
  const memoryItems = v.evidencia.filter((e) => normalizeEvidenceType(e) === "memory");

  const excelValue =
    excelItems.find((e) => e.value !== undefined || e.formattedValue)?.formattedValue ??
    excelItems.find((e) => e.value !== undefined)?.value?.toString();
  const memoryValue =
    memoryItems.find((e) => e.value !== undefined || e.formattedValue)?.formattedValue ??
    memoryItems.find((e) => e.value !== undefined)?.value?.toString();

  const action = base.action || v.sugerencia || "";

  // Dato clave para warnings: primer porcentaje o cifra del texto
  const pctMatch = base.what.match(/([+-]?\d+[.,]?\d*)\s*%/);
  const keyFact = pctMatch ? `${pctMatch[1]}%` : undefined;

  return {
    ...base,
    action,
    diagnosis: v.diagnosis ?? undefined,
    excelValue: excelValue ? String(excelValue) : undefined,
    memoryValue: memoryValue ? String(memoryValue) : undefined,
    keyFact,
  };
}

/** Oculta reglas OK del mismo tema cuando hay un fallo relacionado */
const TOPIC_GROUPS: string[][] = [
  ["CIERRE_004", "CROSS_001"],
  ["CIERRE_005", "CROSS_005", "FISCAL_"],
  ["CIERRE_001", "CIERRE_002", "BAL_001"],
  ["CIERRE_003", "CONSISTENCIA_GLOBAL_002"],
  ["CIERRE_008", "CLOSURE_001"],
  ["FISCAL_ADV_003", "CLOSURE_001"],
  ["CROSS_001", "PGC_001"],
  ["TEMP_001", "TEMP_002", "TEMP_003", "TEMP_004"],
  ["CIERRE_006", "CIERRE_007", "CIERRE_009", "FORMAL_"],
  ["INTER_001", "INTER_002", "INTER_003", "INTER_004", "ANOM_"],
  ["CONSISTENCIA_GLOBAL_001", "CROSS_004", "TIPO_COM_"],
  ["NARR_ADV_001", "TEMP_002"],
];

function topicOf(ruleId: string): string {
  for (const group of TOPIC_GROUPS) {
    if (group.some((p) => ruleId.startsWith(p))) {
      return group[0];
    }
  }
  return ruleId.replace(/_\d+$/, "");
}

export function filterConflictingPasses(validaciones: ValidacionView[]): ValidacionView[] {
  const failedTopics = new Set(
    validaciones
      .filter((v) => v.severidad === "critical" || v.severidad === "warning")
      .map((v) => topicOf(v.ruleId))
  );

  return validaciones.filter((v) => {
    if (v.severidad !== "pass") return true;
    return !failedTopics.has(topicOf(v.ruleId));
  });
}

export function isCritical(v: ValidacionView): boolean {
  return v.severidad === "critical";
}

export function isWarning(v: ValidacionView): boolean {
  return v.severidad === "warning";
}

export function isPass(v: ValidacionView): boolean {
  return v.severidad === "pass";
}
