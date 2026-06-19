import type { CaseScore, GlobalEstado, RuleType } from "@/types/case-data";
import type { RuleResult } from "@/types/domain";
import type { GlobalEvaluation } from "./global-evaluation";

const RULE_TYPE_WEIGHT: Record<RuleType, number> = {
  cross: 3,
  fiscal: 2,
  balance: 2,
  pgc: 1,
  formal: 1,
  interannual: 1,
  narrative: 1,
  custom: 1,
};

const PENALTY_CRITICAL = 30;
const PENALTY_WARNING_HIGH = 10;
const PENALTY_WARNING_LOW = 5;
const SCORE_CAP_NO_FORMULABLE = 60;
const CROSS_INCONSISTENCY_PENALTY = 15;

const CROSS_RULE_PREFIXES = ["CROSS_", "CIERRE_003", "CIERRE_004", "CIERRE_005", "CONSISTENCIA_GLOBAL_"];

function isGuardrailSkip(r: RuleResult): boolean {
  return r.status === "skip" || r.tags?.includes("guardrail_skip") === true;
}

function ruleWeight(r: RuleResult): number {
  return RULE_TYPE_WEIGHT[r.type as RuleType] ?? 1;
}

function warningPenalty(r: RuleResult): number {
  if (r.warningLevel === "low") return PENALTY_WARNING_LOW;
  return PENALTY_WARNING_HIGH;
}

function hasCrossInconsistencies(results: RuleResult[]): boolean {
  return results.some(
    (r) =>
      (r.severity === "critical" || r.severity === "error") &&
      CROSS_RULE_PREFIXES.some((p) => r.ruleId.startsWith(p))
  );
}

export function computeCaseScore(
  results: RuleResult[],
  globalEval?: GlobalEvaluation
): CaseScore {
  const scored = results.filter((r) => !isGuardrailSkip(r));
  const criticos = scored.filter((r) => r.severity === "critical").length;
  const errores = scored.filter((r) => r.severity === "error").length;
  const warnings = scored.filter((r) => r.severity === "warning");
  const ok = scored.filter((r) => r.severity === "ok").length;
  const total = scored.length;

  const passedPct = total > 0 ? Math.round((ok / total) * 100) : 100;

  const totalErrores = criticos + errores;
  let penalizacionCross = 0;
  if (hasCrossInconsistencies(scored)) {
    penalizacionCross = CROSS_INCONSISTENCY_PENALTY;
  }

  const warningPenaltySum = warnings.reduce((s, r) => s + warningPenalty(r), 0);

  let score = Math.max(
    0,
    Math.min(100, 100 - totalErrores * PENALTY_CRITICAL - warningPenaltySum - penalizacionCross)
  );

  const globalEstado: GlobalEstado = globalEval?.estado ?? deriveEstadoFromScore(totalErrores, warnings.length);

  if (globalEstado === "no_formulable") {
    score = Math.min(score, SCORE_CAP_NO_FORMULABLE);
  }

  let earnedWeight = 0;
  let totalWeight = 0;
  for (const r of scored) {
    const w = ruleWeight(r);
    totalWeight += w;
    if (r.severity === "ok") earnedWeight += w;
  }
  const weightedPassedPct =
    totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 100;

  return {
    score,
    errores: totalErrores,
    warnings: warnings.length,
    criticos,
    estado: globalEstado,
    globalEstado,
    motivoGlobal: globalEval?.motivo,
    passedPct,
    weightedPassedPct,
    penalizacionCross: penalizacionCross > 0 ? penalizacionCross : undefined,
  };
}

function deriveEstadoFromScore(errores: number, warnings: number): GlobalEstado {
  if (errores >= 1) return "no_formulable";
  if (warnings >= 1) return "revisar";
  return "ok";
}

export function summarizeResults(results: RuleResult[]) {
  const scored = results.filter((r) => !isGuardrailSkip(r));
  const criticos = scored.filter((r) => r.severity === "critical").length;
  const errores = scored.filter((r) => r.severity === "error").length;
  const warnings = scored.filter((r) => r.severity === "warning").length;
  const pass = scored.filter((r) => r.severity === "ok").length;
  return {
    critical: criticos + errores,
    warning: warnings,
    pass,
    total: scored.length,
    errores: criticos + errores,
    warnings,
    criticos,
  };
}
