import type { CaseData } from "@/types/case-data";
import type { CustomRuleExpression, RuleResult } from "@/types/domain";
import { caseDataToEvalContext } from "@/lib/case/build-case-data";
import { anomalyRules } from "./builtin/anomaly";
import { balanceRules } from "./builtin/balance";
import { cierreRules } from "./builtin/cierre";
import { closureRules } from "./builtin/closure";
import { companyTypeRules } from "./builtin/company-type";
import { consistencyGlobalRules } from "./builtin/consistency-global";
import { crossRules } from "./builtin/cross";
import { fiscalRules } from "./builtin/fiscal";
import { fiscalAdvancedRules } from "./builtin/fiscal-advanced";
import { formalRules } from "./builtin/formal";
import { interannualRules } from "./builtin/interannual";
import { narrativeAdvancedRules } from "./builtin/narrative-advanced";
import { pgcRules } from "./builtin/pgc";
import { temporalRules } from "./builtin/temporal";
import { evaluateCustomRule } from "./custom/evaluator";
import { evaluateGlobalClosure } from "./global-evaluation";
import { filterRelatedPasses } from "./helpers/rule-relations";
import { computeCaseScore, summarizeResults } from "./scoring";
import type { RuleDefinition } from "./types";
import { runRuleDefinition } from "./types";

const RULE_PRIORITY: Record<string, number> = {
  cross: 0,
  fiscal: 1,
  balance: 2,
  pgc: 3,
  interannual: 4,
  formal: 5,
  narrative: 6,
  custom: 7,
};

const SEVERITY_PRIORITY: Record<string, number> = {
  critical: 0,
  error: 1,
  warning: 2,
  ok: 3,
};

export const canonicalRules: RuleDefinition[] = [
  ...temporalRules,
  ...cierreRules,
  ...closureRules,
  ...consistencyGlobalRules,
  ...crossRules,
  ...fiscalRules,
  ...fiscalAdvancedRules,
  ...balanceRules,
  ...companyTypeRules,
  ...pgcRules,
  ...interannualRules,
  ...anomalyRules,
  ...narrativeAdvancedRules,
  ...formalRules,
];

export interface CustomRuleInput {
  id: string;
  expresion: string;
  severidad: string;
}

function sortResults(results: RuleResult[]): RuleResult[] {
  return [...results].sort((a, b) => {
    const typeDiff = (RULE_PRIORITY[a.type] ?? 99) - (RULE_PRIORITY[b.type] ?? 99);
    if (typeDiff !== 0) return typeDiff;
    return (SEVERITY_PRIORITY[a.severity] ?? 99) - (SEVERITY_PRIORITY[b.severity] ?? 99);
  });
}

export function runValidationEngine(
  data: CaseData,
  customRules: CustomRuleInput[] = []
): RuleResult[] {
  const results: RuleResult[] = [];

  for (const rule of canonicalRules) {
    try {
      results.push(runRuleDefinition(rule, data));
    } catch (err) {
      results.push({
        ruleId: rule.id,
        title: rule.title,
        categoria: rule.type,
        type: rule.type,
        severidad: "warning",
        severity: "warning",
        mensaje: `Error ejecutando regla ${rule.title}: ${err instanceof Error ? err.message : "desconocido"}`,
        explanation: `Error ejecutando regla ${rule.title}: ${err instanceof Error ? err.message : "desconocido"}`,
        evidencia: [],
        evidence: [],
        normativa: rule.normativa,
        referencia: rule.referencia,
      });
    }
  }

  const evalCtx = caseDataToEvalContext(data);

  for (const custom of customRules) {
    if (!custom.expresion) continue;
    try {
      const expression = JSON.parse(custom.expresion) as CustomRuleExpression;
      const result = evaluateCustomRule(`custom-${custom.id}`, expression, evalCtx);
      if (custom.severidad === "critical" && result.severity === "warning") {
        result.severity = "error";
        result.severidad = "critical";
      }
      results.push(result);
    } catch (err) {
      results.push({
        ruleId: `custom-${custom.id}`,
        title: "Regla personalizada",
        categoria: "custom",
        type: "custom",
        severidad: "warning",
        severity: "warning",
        mensaje: `Error en regla personalizada: ${err instanceof Error ? err.message : "JSON inválido"}`,
        explanation: `Error en regla personalizada: ${err instanceof Error ? err.message : "JSON inválido"}`,
        evidencia: [],
        evidence: [],
      });
    }
  }

  return sortResults(filterRelatedPasses(results));
}

export interface ValidationResult {
  results: RuleResult[];
  score: ReturnType<typeof computeCaseScore>;
  globalEval: ReturnType<typeof evaluateGlobalClosure>;
}

export function runFullValidation(
  data: CaseData,
  customRules: CustomRuleInput[] = []
): ValidationResult {
  const results = runValidationEngine(data, customRules);
  const globalEval = evaluateGlobalClosure(results, data);
  const score = computeCaseScore(results, globalEval);
  return { results, score, globalEval };
}

export { computeCaseScore, summarizeResults, evaluateGlobalClosure };
export { canonicalRules as builtinRules };
