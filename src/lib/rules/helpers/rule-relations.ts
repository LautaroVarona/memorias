import type { RuleResult } from "@/types/domain";

/** Grupos de reglas relacionadas: si una falla, ocultar las OK del mismo grupo */
export const RULE_RELATION_GROUPS: string[][] = [
  ["CIERRE_004", "CROSS_001"],
  ["CIERRE_005", "CROSS_005", "FISCAL_001", "FISCAL_002", "FISCAL_ADV_"],
  ["CIERRE_001", "CIERRE_002", "BAL_001"],
  ["CIERRE_003", "CONSISTENCIA_GLOBAL_002"],
  ["CIERRE_008", "CLOSURE_001"],
  ["CROSS_001", "PGC_001"],
  ["TEMP_001", "TEMP_002", "TEMP_003", "TEMP_004"],
  ["CIERRE_006", "CIERRE_007", "CIERRE_009", "CIERRE_010", "FORMAL_"],
  ["INTER_001", "INTER_002", "INTER_003", "INTER_004", "ANOM_"],
  ["CONSISTENCIA_GLOBAL_001", "CROSS_004", "TIPO_COM_"],
  ["NARR_ADV_001", "TEMP_002"],
];

function topicOf(ruleId: string): string {
  for (const group of RULE_RELATION_GROUPS) {
    if (group.some((p) => ruleId.startsWith(p) || ruleId === p)) {
      return group[0];
    }
  }
  return ruleId.replace(/_\d+$/, "");
}

function isFailure(r: RuleResult): boolean {
  return r.severity !== "ok" && r.status !== "skip" && !r.tags?.includes("guardrail_skip");
}

/** Oculta reglas OK relacionadas cuando existe un fallo en el mismo tema */
export function filterRelatedPasses(results: RuleResult[]): RuleResult[] {
  const failedTopics = new Set(results.filter(isFailure).map((r) => topicOf(r.ruleId)));

  return results.filter((r) => {
    if (r.severity !== "ok") return true;
    return !failedTopics.has(topicOf(r.ruleId));
  });
}
