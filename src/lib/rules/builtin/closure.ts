import {
  countPendientes,
  detectMissingFiscalModels,
  PENDIENTES_UMBRAL_WARNING,
} from "@/lib/rules/helpers/closure-signals";
import { seniorExplanationPass, seniorIssue } from "@/lib/rules/helpers/explanation";
import { withText } from "@/lib/rules/helpers/evidence";
import type { NotaDespacho } from "@/types/domain";
import type { RuleDefinition } from "../types";

export const closureRules: RuleDefinition[] = [
  {
    id: "CLOSURE_001",
    title: "Cierre incompleto: pendientes y riesgo fiscal",
    type: "formal",
    defaultSeverity: "warning",
    normativa: "Control interno del despacho",
    referencia: "Validación integral del expediente",
    execute(data) {
      const pendientes = countPendientes(data);
      const modelosFaltantes = detectMissingFiscalModels(data);
      const muchosPendientes = pendientes > PENDIENTES_UMBRAL_WARNING;
      const triggered = pendientes > 0 || modelosFaltantes.length > 0;

      let severity: "critical" | "error" | "warning" = "warning";
      let warningLevel: "high" | "medium" | "low" = "high";
      if (muchosPendientes) severity = "error";
      if (modelosFaltantes.length > 0) {
        severity = severity === "error" ? "error" : "warning";
        warningLevel = "high";
      }

      return {
        passed: !triggered,
        severity: triggered ? severity : undefined,
        warningLevel,
        tags: modelosFaltantes.length > 0 ? ["riesgo_fiscal"] : undefined,
        diagnosis: triggered
          ? "Elementos del cierre sin resolver impiden validación completa"
          : undefined,
        sugerencia: "Resuelva pendientes y confirme modelos fiscales antes de formular.",
        data: { pendientes, modelosFaltantes, muchosPendientes, notas: data.financials.libroCierre?.notas ?? [] },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("El cierre no presenta elementos bloqueantes sin resolver.");
      }
      const { pendientes, modelosFaltantes } = outcome.data as {
        pendientes: number;
        modelosFaltantes: string[];
      };
      const partes: string[] = [];
      if (pendientes > 0) partes.push(`${pendientes} punto(s) pendiente(s) en Excel`);
      if (modelosFaltantes.length > 0) {
        partes.push(`modelos fiscales sin confirmar (${modelosFaltantes.join(", ")})`);
      }

      return seniorIssue(
        `El cierre presenta elementos sin resolver que impiden su validación completa: ${partes.join("; ")}.`,
        `No es defendible formular cuentas con controles internos abiertos o obligaciones fiscales sin verificar.`,
        `Cierre cada pendiente del libro y confirme la presentación de los modelos fiscales aplicables.`,
        "Cierre incompleto detectado en controles de despacho y cumplimiento fiscal"
      ).explanation;
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const notas = (outcome.data.notas as NotaDespacho[]) ?? [];
      const pendientes = notas.filter((n) => n.pendiente);
      const modelos = (outcome.data.modelosFaltantes as string[]) ?? [];

      return [
        ...pendientes.slice(0, 6).map((n) =>
          withText(
            "excel",
            `${n.hoja} fila ${n.fila}`,
            n.detalle ? `${n.concepto}: ${n.detalle}` : n.concepto,
            "high"
          )
        ),
        ...modelos.map((m) => withText("excel", "Modelo fiscal", m, "high")),
      ];
    },
  },
];
