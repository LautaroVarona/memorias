import { getAccounts } from "@/lib/case/build-case-data";
import { formatEuro, sumByPrefix } from "@/lib/rules/helpers/accounts";
import { seniorExplanationPass, seniorIssue } from "@/lib/rules/helpers/explanation";
import { withEuro, withText } from "@/lib/rules/helpers/evidence";
import type { RuleDefinition } from "../types";

const UMBRAL_VARIACION = 0.5;

function variacionPct(actual: number, anterior: number): number {
  if (anterior === 0) return actual === 0 ? 0 : 1;
  return Math.abs((actual - anterior) / anterior);
}

export const anomalyRules: RuleDefinition[] = [
  {
    id: "ANOM_001",
    title: "Variación de resultado > 50% sin explicación",
    type: "interannual",
    defaultSeverity: "warning",
    normativa: "PGC",
    referencia: "Análisis de variaciones — resultado",
    execute(data) {
      const balance = data.financials.balance;
      const antBalance = data.priorYear?.financials.balance;
      if (!balance || !antBalance) return { passed: true, data: { skip: true } };

      const variacion = variacionPct(balance.resultado, antBalance.resultado);
      const texto = data.memory?.fullText.toLowerCase() ?? "";
      const explicado =
        /variaci[oó]n.*resultado|causa.*resultado|incremento.*beneficio|p[eé]rdida.*ejercicio|mejora.*resultado/i.test(
          texto
        );
      const triggered = variacion > UMBRAL_VARIACION && !explicado;

      return {
        passed: !triggered,
        severity: "warning",
        warningLevel: "high",
        diagnosis: triggered ? "Variación patológica del resultado sin narrativa" : undefined,
        sugerencia: "Documente en la memoria las causas de la variación del resultado.",
        data: {
          variacion,
          resultadoActual: balance.resultado,
          resultadoAnterior: antBalance.resultado,
        },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        if (outcome.data.skip) return seniorExplanationPass("No hay comparativa interanual del resultado.");
        return seniorExplanationPass("La variación del resultado está explicada en la memoria.");
      }
      const { variacion, resultadoActual, resultadoAnterior } = outcome.data as {
        variacion: number;
        resultadoActual: number;
        resultadoAnterior: number;
      };
      return seniorIssue(
        `El resultado varió un ${Math.round(variacion * 100)}% (${formatEuro(resultadoAnterior)} → ${formatEuro(resultadoActual)}) sin explicación en la memoria.`,
        `Variaciones extremas sin narrativa debilitan la coherencia del cierre y exigen justificación ante revisión.`,
        `Añada en la memoria un párrafo sobre las causas de la variación del resultado.`,
        "Salto interanual del resultado sin desarrollo narrativo"
      ).explanation;
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const d = outcome.data as { resultadoActual: number; resultadoAnterior: number; variacion: number };
      return [
        withEuro("excel", "Resultado ejercicio anterior", d.resultadoAnterior, "high"),
        withEuro("excel", "Resultado ejercicio actual", d.resultadoActual, "high"),
        withText("memory", "Explicación variación", "No detectada", "high"),
      ];
    },
  },
  {
    id: "ANOM_002",
    title: "Crecimiento de activo alto sin explicación",
    type: "interannual",
    defaultSeverity: "warning",
    normativa: "PGC",
    referencia: "Análisis de variaciones — activo",
    execute(data) {
      const balance = data.financials.balance;
      const antBalance = data.priorYear?.financials.balance;
      if (!balance || !antBalance) return { passed: true, data: { skip: true } };

      const variacion = variacionPct(balance.activo.total, antBalance.activo.total);
      const texto = data.memory?.fullText.toLowerCase() ?? "";
      const explicado =
        /incremento.*activo|crecimiento.*inversi[oó]n|adquisici[oó]n|ampliaci[oó]n.*capital|variación.*activo/i.test(
          texto
        );
      const triggered = variacion > UMBRAL_VARIACION && balance.activo.total > 100_000 && !explicado;

      return {
        passed: !triggered,
        severity: "warning",
        warningLevel: "medium",
        diagnosis: triggered ? "Crecimiento patrimonial sin narrativa explicativa" : undefined,
        sugerencia: "Explique en la memoria el origen del crecimiento del activo.",
        data: {
          variacion,
          activoActual: balance.activo.total,
          activoAnterior: antBalance.activo.total,
        },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        if (outcome.data.skip) return seniorExplanationPass("No hay comparativa interanual del activo.");
        return seniorExplanationPass("El crecimiento del activo está explicado en la memoria.");
      }
      const { variacion, activoActual, activoAnterior } = outcome.data as {
        variacion: number;
        activoActual: number;
        activoAnterior: number;
      };
      return seniorIssue(
        `El activo creció un ${Math.round(variacion * 100)}% (${formatEuro(activoAnterior)} → ${formatEuro(activoActual)}) sin explicación en la memoria.`,
        `Un aumento relevante del activo sin narrativa puede ocultar operaciones no documentadas o errores de clasificación.`,
        `Describa en la memoria las inversiones, adquisiciones u otras causas del incremento patrimonial.`,
        "Expansión del balance sin desarrollo en notas"
      ).explanation;
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const d = outcome.data as { activoActual: number; activoAnterior: number };
      return [
        withEuro("excel", "Activo ejercicio anterior", d.activoAnterior, "medium"),
        withEuro("excel", "Activo ejercicio actual", d.activoActual, "high"),
      ];
    },
  },
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
