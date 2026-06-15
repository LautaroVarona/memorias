import reglasFiscales from "../../../../data/pgc/reglas-fiscales.json";
import { getAccounts } from "@/lib/case/build-case-data";
import { seniorExplanation, seniorExplanationPass } from "@/lib/rules/helpers/explanation";
import { withEuro, withText } from "@/lib/rules/helpers/evidence";
import { formatEuro, sumByPrefix } from "@/lib/rules/helpers/accounts";
import type { RuleDefinition } from "../types";

export const fiscalRules: RuleDefinition[] = [
  {
    id: "FISCAL_001",
    title: "Bases negativas sin uso",
    type: "fiscal",
    defaultSeverity: "warning",
    normativa: "LIS",
    referencia: "Conciliación fiscal — bases negativas",
    execute(data) {
      const mencionaBIN = data.memory?.statements.some((s) => s.type === "bases_negativas") ?? false;
      const resultado = data.financials.balance?.resultado ?? 0;
      const texto = data.memory?.fullText.toLowerCase() ?? "";
      const usoBIN = /compensaci[oó]n|aplicaci[oó]n.*bases?\s+negativas/i.test(texto);
      const triggered = mencionaBIN && resultado > 0 && !usoBIN;

      return {
        passed: !triggered,
        severity: "warning",
        sugerencia: "Documente el uso o no uso de bases negativas en la memoria fiscal.",
        data: { mencionaBIN, resultado, usoBIN },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("Las bases negativas están documentadas o no aplican.");
      }
      const resultado = outcome.data.resultado as number;
      return seniorExplanation(
        `La memoria menciona bases negativas pero no describe su aplicación frente a un resultado positivo de ${formatEuro(resultado)}.`,
        `Puede requerirse una nota de conciliación fiscal sobre la compensación de BIN según la LIS.`,
        `Documente en la memoria si se han aplicado bases negativas y su impacto en el gasto por IS.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      return [
        withText("memory", "Bases negativas", "Mencionadas sin uso documentado", "high"),
        withEuro("excel", "Resultado del ejercicio", outcome.data.resultado as number, "medium"),
      ];
    },
  },
  {
    id: "FISCAL_002",
    title: "Activos diferidos sospechosos",
    type: "fiscal",
    defaultSeverity: "warning",
    normativa: "LIS",
    referencia: "NIC 12 — activos por impuesto diferido",
    execute(data) {
      const accounts = getAccounts(data);
      const cuenta474 = sumByPrefix(accounts, ["474"]);
      const texto = data.memory?.fullText.toLowerCase() ?? "";
      const keywords = reglasFiscales.keywordsRecuperacionDT as string[];
      const bajaRecuperacion = keywords.some((k) => texto.includes(k.toLowerCase()));
      const triggered = cuenta474 > 0 && bajaRecuperacion;

      return {
        passed: !triggered,
        severity: "warning",
        sugerencia: "Evalúe si procede deterioro del activo por impuesto diferido (cuenta 474).",
        data: { cuenta474, bajaRecuperacion },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("Los activos por impuesto diferido son coherentes con la narrativa.");
      }
      const cuenta474 = outcome.data.cuenta474 as number;
      return seniorExplanation(
        `Existen ${formatEuro(cuenta474)} en cuenta 474 mientras la memoria indica baja probabilidad de recuperación del activo diferido.`,
        `Puede ser necesario revisar el valor en libros del activo por impuesto diferido (NIC 12).`,
        `Evalúe si procede dotar deterioro o ajustar la narrativa sobre recuperabilidad fiscal.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      return [
        withEuro("excel", "Cuenta 474", outcome.data.cuenta474 as number, "high"),
        withText("memory", "Recuperación activo diferido", "Baja probabilidad indicada", "high"),
      ];
    },
  },
];
