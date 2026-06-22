import {
  countPendientes,
  hasElevatedVinculadas,
  hasSysA3Differences,
  hasVinculadasExplanation,
} from "@/lib/rules/helpers/closure-signals";
import { seniorExplanationPass, seniorIssue } from "@/lib/rules/helpers/explanation";
import { withText } from "@/lib/rules/helpers/evidence";
import type { RuleDefinition } from "../types";

export const consistencyGlobalRules: RuleDefinition[] = [
  {
    id: "CONSISTENCIA_GLOBAL_001",
    title: "Coherencia global: vinculadas sin explicación",
    type: "cross",
    defaultSeverity: "warning",
    normativa: "PGC — principio de imagen fiel",
    referencia: "Análisis conjunto memoria + contabilidad",
    execute(data) {
      const vinculadasAltas = hasElevatedVinculadas(data);
      const sinExplicacion = !hasVinculadasExplanation(data);

      const triggered = vinculadasAltas && sinExplicacion;

      return {
        passed: !triggered,
        severity: "warning",
        warningLevel: "high",
        tags: ["cross-document"],
        diagnosis: triggered
          ? "Operaciones con partes vinculadas sin narrativa suficiente en la memoria"
          : undefined,
        sugerencia: "Amplíe la memoria con explicación de las operaciones con partes vinculadas.",
        data: { vinculadasAltas, sinExplicacion },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("Las operaciones con partes vinculadas están explicadas en la memoria.");
      }

      const issue = seniorIssue(
        `El expediente presenta saldos elevados con partes vinculadas, pero la memoria no desarrolla una explicación suficiente.`,
        `Un cierre con operaciones relevantes sin narrativa debilita la defensa ante revisión y puede interpretarse como omisión informativa.`,
        `Incorpore en la memoria el detalle de las operaciones con partes vinculadas.`,
        "Magnitud de vinculadas sin explicación narrativa"
      );
      return issue.explanation;
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const ev = [];
      if (outcome.data.vinculadasAltas) {
        ev.push(withText("excel", "Vinculadas", "Saldos elevados detectados", "high"));
      }
      ev.push(withText("memory", "Explicación en memoria", "Insuficiente o ausente", "high"));
      return ev;
    },
  },
  {
    id: "CONSISTENCIA_GLOBAL_002",
    title: "Escalado: diferencias SYS/A3 y pendientes simultáneos",
    type: "cross",
    defaultSeverity: "error",
    normativa: "Control interno del despacho",
    referencia: "Señales compuestas de cierre incompleto",
    execute(data) {
      const sysA3 = hasSysA3Differences(data);
      const pendientes = countPendientes(data);
      const multiSenal = sysA3.has && pendientes > 0;

      return {
        passed: !multiSenal,
        severity: multiSenal ? "error" : undefined,
        warningLevel: "high",
        tags: ["cross-document"],
        diagnosis: multiSenal
          ? "Múltiples señales de cierre no validado (SYS≠A3 + pendientes abiertos)"
          : undefined,
        sugerencia: "Resuelva las diferencias SYS/A3 y cierre los puntos pendientes antes de formular.",
        data: { sysA3Count: sysA3.count, pendientes, multiSenal },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("No se detectan señales compuestas de cierre incompleto.");
      }
      const { sysA3Count, pendientes } = outcome.data as { sysA3Count: number; pendientes: number };
      return seniorIssue(
        `Coinciden ${sysA3Count} diferencia(s) SYS vs A3SOC y ${pendientes} punto(s) pendiente(s) en el libro de cierre.`,
        `La combinación indica que el cierre no ha sido validado de forma integral; el riesgo de error residual es alto.`,
        `Concilie SYS/A3SOC y resuelva todos los pendientes antes de dar el cierre por bueno.`,
        "Escalado por acumulación de señales de control interno"
      ).explanation;
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const d = outcome.data as { sysA3Count: number; pendientes: number };
      return [
        withText("excel", "SYS vs A3SOC", `${d.sysA3Count} cuenta(s) con diferencia`, "high"),
        withText("excel", "PENDIENTES/INCIDENCIAS", `${d.pendientes} punto(s) abierto(s)`, "high"),
      ];
    },
  },
];
