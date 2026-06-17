import {
  countPendientes,
  PENDIENTES_UMBRAL_WARNING,
} from "@/lib/rules/helpers/closure-signals";
import { seniorExplanationPass, seniorIssue } from "@/lib/rules/helpers/explanation";
import { withText } from "@/lib/rules/helpers/evidence";
import type { NotaDespacho } from "@/types/domain";
import type { RuleDefinition } from "../types";

export const closureRules: RuleDefinition[] = [
  {
    id: "CLOSURE_001",
    title: "Cierre incompleto: pendientes del despacho",
    type: "formal",
    defaultSeverity: "warning",
    normativa: "Control interno del despacho",
    referencia: "Validación integral del expediente",
    execute(data) {
      const pendientes = countPendientes(data);
      const muchosPendientes = pendientes > PENDIENTES_UMBRAL_WARNING;
      const triggered = pendientes > 0;

      let severity: "critical" | "error" | "warning" = "warning";
      const warningLevel: "high" | "medium" | "low" = "high";
      if (muchosPendientes) severity = "error";

      return {
        passed: !triggered,
        severity: triggered ? severity : undefined,
        warningLevel,
        diagnosis: triggered
          ? "Elementos del cierre sin resolver impiden validación completa"
          : undefined,
        sugerencia: "Resuelva los puntos pendientes del libro antes de formular.",
        data: { pendientes, muchosPendientes, notas: data.financials.libroCierre?.notas ?? [] },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("El cierre no presenta elementos bloqueantes sin resolver.");
      }
      const { pendientes } = outcome.data as { pendientes: number };

      return seniorIssue(
        `El cierre presenta ${pendientes} punto(s) pendiente(s) en Excel sin resolver.`,
        `No es defendible formular cuentas con controles internos abiertos.`,
        `Cierre cada pendiente del libro antes de la formulación.`,
        "Cierre incompleto detectado en controles de despacho"
      ).explanation;
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const notas = (outcome.data.notas as NotaDespacho[]) ?? [];
      const pendientes = notas.filter((n) => n.pendiente);

      return [
        ...pendientes.slice(0, 6).map((n) =>
          withText(
            "excel",
            `${n.hoja} fila ${n.fila}`,
            n.detalle ? `${n.concepto}: ${n.detalle}` : n.concepto,
            "high",
            { sheet: n.hoja, row: n.fila }
          )
        ),
      ];
    },
  },
];
