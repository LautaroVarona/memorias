import reglasFiscales from "../../../../data/pgc/reglas-fiscales.json";
import { getAccounts } from "@/lib/case/build-case-data";
import { seniorExplanation, seniorExplanationPass } from "@/lib/rules/helpers/explanation";
import { withEuro } from "@/lib/rules/helpers/evidence";
import { formatEuro, sumByPrefix } from "@/lib/rules/helpers/accounts";
import type { RuleDefinition } from "../types";
import { withinTolerance } from "../types";

const TOLERANCE = reglasFiscales.toleranciaCuadre as number;

export const balanceRules: RuleDefinition[] = [
  {
    id: "BAL_001",
    title: "Cuadre de balance",
    type: "balance",
    defaultSeverity: "error",
    normativa: "PGC",
    referencia: "Balance — ecuación patrimonial",
    execute(data) {
      const balance = data.financials.balance;
      if (!balance) {
        return {
          passed: false,
          severity: "error",
          sugerencia: "Suba un Excel con balance de situación.",
          data: { missing: true },
        };
      }
      const { activo, pasivo, patrimonioNeto } = balance;
      const derecho = pasivo.total + patrimonioNeto.total;
      const diff = Math.abs(activo.total - derecho);
      const cuadra = withinTolerance(activo.total, derecho, TOLERANCE);

      return {
        passed: cuadra,
        severity: "error",
        sugerencia: "Revise las cuentas de regularización y los totales del balance en el Excel.",
        data: { activo: activo.total, pasivo: pasivo.total, pn: patrimonioNeto.total, derecho, diff, cuadra },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        const { activo, derecho } = outcome.data as { activo: number; derecho: number };
        return seniorExplanationPass(
          `El balance cuadra: activo ${formatEuro(activo)} = pasivo + patrimonio neto ${formatEuro(derecho)}.`
        );
      }
      if (outcome.data.missing) {
        return seniorExplanation(
          "No se ha podido extraer el balance del Excel.",
          "Sin balance no es posible validar la ecuación patrimonial ni el resto de comprobaciones contables.",
          "Suba un archivo Excel con el balance de situación del ejercicio."
        );
      }
      const { activo, derecho, diff } = outcome.data as { activo: number; derecho: number; diff: number };
      return seniorExplanation(
        `El balance no cuadra: activo ${formatEuro(activo)} frente a pasivo + patrimonio neto ${formatEuro(derecho)} (diferencia ${formatEuro(diff)}).`,
        `Un descuadre patrimonial impide validar el resto del expediente y puede indicar errores de cierre.`,
        `Revise las cuentas de regularización, el resultado del ejercicio y los totales del balance.`
      );
    },
    evidence(outcome) {
      if (outcome.passed || outcome.data.missing) return [];
      const ctx = outcome.data as { activo: number; pasivo: number; pn: number };
      return [
        withEuro("excel", "Activo total", ctx.activo, "high"),
        withEuro("excel", "Pasivo total", ctx.pasivo, "high"),
        withEuro("excel", "Patrimonio neto", ctx.pn, "high"),
      ];
    },
  },
  {
    id: "BAL_002",
    title: "Amortización incoherente",
    type: "balance",
    defaultSeverity: "warning",
    normativa: "PGC",
    referencia: "Balance — inmovilizado y amortización",
    execute(data) {
      const accounts = getAccounts(data);
      const inmovilizado = sumByPrefix(accounts, ["21"]);
      const amortizacion = sumByPrefix(accounts, ["68", "281"]);
      const triggered = inmovilizado > 100_000 && amortizacion < inmovilizado * 0.01;

      return {
        passed: !triggered,
        severity: "warning",
        sugerencia: "Verifique el registro de amortizaciones del ejercicio.",
        data: { inmovilizado, amortizacion, triggered },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("La amortización es coherente con el inmovilizado registrado.");
      }
      const { inmovilizado, amortizacion } = outcome.data as { inmovilizado: number; amortizacion: number };
      return seniorExplanation(
        `Existe inmovilizado por ${formatEuro(inmovilizado)} con amortización acumulada de solo ${formatEuro(amortizacion)}.`,
        `Puede indicar omisión de dotaciones del ejercicio o error en la clasificación del inmovilizado.`,
        `Verifique las cuentas 68x (gasto) y 281x (amortización acumulada) frente al inmovilizado 21x.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const ctx = outcome.data as { inmovilizado: number; amortizacion: number };
      return [
        withEuro("excel", "Inmovilizado (21x)", ctx.inmovilizado, "high"),
        withEuro("excel", "Amortización (68x/281)", ctx.amortizacion, "medium"),
      ];
    },
  },
  {
    id: "BAL_003",
    title: "Clientes sin ventas",
    type: "balance",
    defaultSeverity: "warning",
    normativa: "PGC",
    referencia: "Balance — clientes y ventas",
    execute(data) {
      const accounts = getAccounts(data);
      const clientes = sumByPrefix(accounts, ["430"]);
      const ventas = sumByPrefix(accounts, ["700", "705"]);
      const triggered = clientes > 0 && ventas === 0;

      return {
        passed: !triggered,
        severity: "warning",
        sugerencia: "Revise si los saldos de clientes corresponden al ejercicio o si faltan ventas en el PyG.",
        data: { clientes, ventas },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("Los saldos de clientes son coherentes con la actividad de ventas.");
      }
      const { clientes } = outcome.data as { clientes: number };
      return seniorExplanation(
        `Hay saldo de clientes por ${formatEuro(clientes)} sin ventas registradas en cuentas 700/705.`,
        `Puede indicar cobros pendientes de ejercicios anteriores, errores de imputación o ausencia del PyG en el Excel.`,
        `Verifique el cierre de cobros y la imputación de ingresos del ejercicio.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const ctx = outcome.data as { clientes: number; ventas: number };
      return [
        withEuro("excel", "Clientes (430)", ctx.clientes, "high"),
        withEuro("excel", "Ventas (700/705)", ctx.ventas, "medium"),
      ];
    },
  },
];
