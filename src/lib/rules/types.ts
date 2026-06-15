import type { CaseData, Evidence, RuleType } from "@/types/case-data";
import type { Evidencia, RuleCategory, RuleResult, Severidad } from "@/types/domain";
import { enrichEvidence } from "./helpers/evidence";

export interface RuleOutcome {
  passed: boolean;
  severity?: "critical" | "error" | "warning";
  /** high=-10, medium=-10, low=-5 en scoring */
  warningLevel?: "high" | "medium" | "low";
  sugerencia?: string;
  diagnosis?: string;
  impact?: string;
  action?: string;
  tags?: string[];
  /** Datos intermedios de la detección — consumidos por explanation y evidence */
  data: Record<string, unknown>;
}

export interface RuleDefinition {
  id: string;
  title: string;
  type: RuleType;
  defaultSeverity: "critical" | "error" | "warning";
  normativa?: string;
  referencia?: string;
  execute: (data: CaseData) => RuleOutcome;
  explanation: (outcome: RuleOutcome) => string;
  evidence: (outcome: RuleOutcome) => Evidence[];
}

export function evidenceToLegacy(ev: Evidence[]): Evidencia[] {
  return ev.map((e) => ({
    tipo: e.type === "memory" ? "memoria" : "excel",
    referencia: e.reference,
    valor: e.formattedValue ?? e.value ?? e.text,
    detalle: [e.text, e.importance ? `importancia: ${e.importance}` : ""].filter(Boolean).join(" · ") || e.formattedValue,
  }));
}

export function severityToLegacy(s: RuleResult["severity"]): Severidad {
  if (s === "critical" || s === "error") return "critical";
  if (s === "warning") return "warning";
  return "pass";
}

function deriveIssueFields(
  outcome: RuleOutcome,
  explanation: string
): Pick<RuleResult, "diagnosis" | "impact" | "action"> {
  if (outcome.passed) return {};
  const parts = explanation
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    diagnosis: outcome.diagnosis,
    impact: outcome.impact ?? parts[1],
    action: outcome.action ?? outcome.sugerencia ?? parts[2],
  };
}

export function runRuleDefinition(def: RuleDefinition, data: CaseData): RuleResult {
  const outcome = def.execute(data);
  const severity: RuleResult["severity"] = outcome.passed
    ? "ok"
    : (outcome.severity ?? def.defaultSeverity);
  const evidence = enrichEvidence(def.evidence(outcome));
  const explanation = def.explanation(outcome);
  const categoria = def.type as RuleCategory;
  const issueFields = deriveIssueFields(outcome, explanation);

  return {
    ruleId: def.id,
    title: def.title,
    categoria,
    type: categoria,
    severidad: severityToLegacy(severity),
    severity,
    mensaje: explanation,
    explanation,
    ...issueFields,
    tags: outcome.tags,
    warningLevel: outcome.warningLevel,
    evidencia: evidenceToLegacy(evidence),
    evidence,
    normativa: def.normativa,
    referencia: def.referencia,
    sugerencia: outcome.sugerencia,
  };
}

export function withinTolerance(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) <= tolerance;
}

/** @deprecated Legacy adapter */
export interface Rule {
  id: string;
  category: RuleCategory;
  severity: Severidad;
  name: string;
  run: (ctx: CaseData) => RuleResult[];
}

export function pass(
  ruleId: string,
  category: RuleCategory,
  mensaje: string,
  evidencia: Evidencia[] = []
): RuleResult {
  return {
    ruleId,
    title: ruleId,
    categoria: category,
    type: category,
    severidad: "pass",
    severity: "ok",
    mensaje,
    explanation: mensaje,
    evidencia,
    evidence: evidencia.map((e) => ({
      type: e.tipo === "memoria" ? "memory" : "excel",
      reference: e.referencia,
      value: typeof e.valor === "number" ? e.valor : undefined,
      text: typeof e.valor === "string" ? e.valor : e.detalle,
    })),
  };
}

export function fail(
  ruleId: string,
  category: RuleCategory,
  severity: "critical" | "warning",
  mensaje: string,
  evidencia: Evidencia[] = [],
  sugerencia?: string
): RuleResult {
  const sev = severity === "critical" ? "critical" : "warning";
  return {
    ruleId,
    title: ruleId,
    categoria: category,
    type: category,
    severidad: severity,
    severity: sev,
    mensaje,
    explanation: mensaje,
    evidencia,
    evidence: evidencia.map((e) => ({
      type: e.tipo === "memoria" ? "memory" : "excel",
      reference: e.referencia,
      value: typeof e.valor === "number" ? e.valor : undefined,
      text: typeof e.valor === "string" ? e.valor : e.detalle,
    })),
    sugerencia,
  };
}
