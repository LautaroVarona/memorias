import { getAccounts } from "@/lib/case/build-case-data";
import { sumByPrefix } from "@/lib/rules/helpers/accounts";
import { seniorExplanationPass, seniorIssue } from "@/lib/rules/helpers/explanation";
import { withText } from "@/lib/rules/helpers/evidence";
import type { RuleDefinition } from "../types";

export const anomalyRules: RuleDefinition[] = [
  {
    id: "ANOM_003",
    title: "Cuentas anómalas para el tipo de empresa",
    type: "balance",
    defaultSeverity: "warning",
    normativa: "PGC",
    referencia: "Coherencia actividad — tipo empresa",
    execute(data) {
      const tipo = data.metadata.tipoEmpresa;
      const accounts = getAccounts(data);
      const anomalias: string[] = [];

      if (tipo === "comercial") {
        const produccion = sumByPrefix(accounts, ["61", "71"]);
        const ventas = sumByPrefix(accounts, ["700", "705"]);
        if (produccion > 50_000 && ventas < produccion * 0.1) {
          anomalias.push("costes de producción elevados en empresa comercial sin ventas proporcionales");
        }
      }

      if (tipo === "holding") {
        const ventas = sumByPrefix(accounts, ["700", "705"]);
        const participaciones = sumByPrefix(accounts, ["24", "25"]);
        if (ventas > 100_000 && participaciones < ventas * 0.05) {
          anomalias.push("ventas elevadas en holding sin participaciones proporcionales");
        }
      }

      if (tipo === "industrial") {
        const stocks = sumByPrefix(accounts, ["30", "31", "32", "33", "34", "35"]);
        const costes = sumByPrefix(accounts, ["60", "61"]);
        if (costes > 100_000 && stocks < costes * 0.02) {
          anomalias.push("costes industriales elevados con stocks inusualmente bajos");
        }
      }

      return {
        passed: anomalias.length === 0,
        severity: "warning",
        warningLevel: "medium",
        diagnosis: anomalias.length > 0 ? `Perfil ${tipo} incoherente con saldos` : undefined,
        sugerencia: "Verifique la clasificación de cuentas y la coherencia con el tipo de actividad.",
        data: { anomalias, tipo },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("Los saldos son coherentes con el tipo de empresa detectado.");
      }
      const { anomalias, tipo } = outcome.data as { anomalias: string[]; tipo: string };
      return seniorIssue(
        `Para una empresa ${tipo}, se detectan cuentas inesperadas: ${anomalias.join("; ")}.`,
        `Saldos atípicos para el perfil pueden indicar reclasificación pendiente o error en el volcado contable.`,
        `Revise la tipología de la sociedad y la imputación de las cuentas señaladas.`,
        `Incoherencia entre clasificador (${tipo}) y estructura de saldos`
      ).explanation;
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const anomalias = (outcome.data.anomalias as string[]) ?? [];
      return anomalias.map((a) => withText("excel", "Anomalía detectada", a, "medium"));
    },
  },
];
