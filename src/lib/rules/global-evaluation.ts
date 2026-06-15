import type { CaseData, GlobalEstado } from "@/types/case-data";
import type { RuleResult } from "@/types/domain";
import {
  countPendientes,
  detectMissingFiscalModels,
  hasSysA3Differences,
} from "./helpers/closure-signals";

export interface GlobalEvaluation {
  estado: GlobalEstado;
  motivo?: string;
  bloqueadores: string[];
}

function isCriticalOrError(r: RuleResult): boolean {
  return r.severity === "critical" || r.severity === "error";
}

function isHighWarning(r: RuleResult): boolean {
  return r.severity === "warning" && (r.warningLevel === "high" || !r.warningLevel);
}

/**
 * Determina el estado global del cierre según reglas de negocio senior.
 */
export function evaluateGlobalClosure(
  results: RuleResult[],
  data: CaseData
): GlobalEvaluation {
  const bloqueadores: string[] = [];

  const criticos = results.filter(isCriticalOrError);
  if (criticos.length > 0) {
    bloqueadores.push(`${criticos.length} error(es) crítico(s)`);
  }

  const pendientes = countPendientes(data);
  if (pendientes > 0) {
    bloqueadores.push(`${pendientes} punto(s) pendiente(s) en Excel`);
  }

  const sysA3 = hasSysA3Differences(data);
  if (sysA3.has) {
    bloqueadores.push(`Diferencias SYS vs A3SOC (${sysA3.count} cuenta(s))`);
  }

  const modelosFaltantes = detectMissingFiscalModels(data);
  if (modelosFaltantes.length > 0) {
    bloqueadores.push(`Modelos fiscales sin confirmar: ${modelosFaltantes.join(", ")}`);
  }

  if (bloqueadores.length > 0) {
    return {
      estado: "no_formulable",
      motivo: bloqueadores[0],
      bloqueadores,
    };
  }

  const warnings = results.filter((r) => r.severity === "warning");
  const warningsAltos = warnings.filter(isHighWarning);

  if (warnings.length > 0) {
    return {
      estado: "revisar",
      motivo:
        warningsAltos.length > 0
          ? `${warningsAltos.length} advertencia(s) relevante(s) pendiente(s)`
          : `${warnings.length} ajuste(s) menor(es) detectado(s)`,
      bloqueadores: [],
    };
  }

  return { estado: "ok", bloqueadores: [] };
}
