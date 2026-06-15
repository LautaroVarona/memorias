import reglasFiscales from "../../../../data/pgc/reglas-fiscales.json";
import { getAccounts } from "@/lib/case/build-case-data";
import { detectMissingFiscalModels } from "@/lib/rules/helpers/closure-signals";
import { formatEuro, sumByPrefix } from "@/lib/rules/helpers/accounts";
import { seniorExplanationPass, seniorIssue } from "@/lib/rules/helpers/explanation";
import { withEuro, withText } from "@/lib/rules/helpers/evidence";
import type { RuleDefinition } from "../types";

const CUENTAS_DT = reglasFiscales.cuentasDiferenciasTemporarias as string[];

export const fiscalAdvancedRules: RuleDefinition[] = [
  {
    id: "FISCAL_ADV_001",
    title: "Diferencias temporarias no explicadas",
    type: "fiscal",
    defaultSeverity: "warning",
    normativa: "NIC 12 / LIS",
    referencia: "Activos y pasivos por impuesto diferido",
    execute(data) {
      const accounts = getAccounts(data);
      const saldoDT = CUENTAS_DT.reduce((s, p) => s + Math.abs(sumByPrefix(accounts, [p])), 0);
      const texto = data.memory?.fullText.toLowerCase() ?? "";
      const explicado =
        /diferencias?\s+temporarias?|impuesto\s+diferido|activo\s+por\s+impuesto|pasivo\s+por\s+impuesto/i.test(
          texto
        );
      const triggered = saldoDT > 5_000 && !explicado;

      return {
        passed: !triggered,
        severity: "warning",
        warningLevel: "high",
        diagnosis: triggered ? "Saldos de diferencias temporarias sin narrativa fiscal" : undefined,
        sugerencia: "Documente en la memoria el origen de las diferencias temporarias.",
        data: { saldoDT },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("Las diferencias temporarias están documentadas o no son relevantes.");
      }
      const saldoDT = outcome.data.saldoDT as number;
      return seniorIssue(
        `Existen ${formatEuro(saldoDT)} en cuentas de diferencias temporarias (474/475) sin explicación en la memoria.`,
        `La ausencia de narrativa sobre DT dificulta validar la conciliación fiscal y la recuperabilidad.`,
        `Incluya en el apartado fiscal el desglose de diferencias temporarias y su evolución.`,
        "Magnitud de DT sin desarrollo en memoria"
      ).explanation;
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      return [
        withEuro("excel", "Diferencias temporarias (474/475)", outcome.data.saldoDT as number, "high"),
        withText("memory", "Explicación DT", "No detectada", "high"),
      ];
    },
  },
  {
    id: "FISCAL_ADV_002",
    title: "Bases negativas sin lógica de uso",
    type: "fiscal",
    defaultSeverity: "warning",
    normativa: "LIS",
    referencia: "Compensación de bases imponibles negativas",
    execute(data) {
      const mencionaBIN = data.memory?.statements.some((s) => s.type === "bases_negativas") ?? false;
      const resultado = data.financials.balance?.resultado ?? 0;
      const binMemoria = data.memory?.keyData.basesImponiblesNegativasPendientes ?? 0;
      const texto = data.memory?.fullText.toLowerCase() ?? "";
      const usoDocumentado = /compensaci[oó]n|aplicaci[oó]n.*bases?\s+negativas|bin\s+pendiente/i.test(texto);
      const triggered =
        (mencionaBIN || binMemoria > 0) && resultado > 0 && !usoDocumentado;

      return {
        passed: !triggered,
        severity: "warning",
        warningLevel: "medium",
        diagnosis: triggered ? "BIN mencionadas sin estrategia de compensación documentada" : undefined,
        sugerencia: "Documente el uso o no uso de bases negativas frente al resultado positivo.",
        data: { mencionaBIN, resultado, binMemoria, usoDocumentado },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("Las bases negativas están documentadas o no aplican.");
      }
      const resultado = outcome.data.resultado as number;
      return seniorIssue(
        `Hay bases negativas en juego con resultado positivo de ${formatEuro(resultado)}, sin lógica de compensación en la memoria.`,
        `La LIS exige coherencia entre BIN pendientes y el resultado fiscal del ejercicio.`,
        `Explique si se han compensado BIN y su impacto en el gasto por IS.`,
        "BIN y resultado positivo sin conciliación narrativa"
      ).explanation;
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
    id: "FISCAL_ADV_003",
    title: "Modelos fiscales faltantes — riesgo alto",
    type: "fiscal",
    defaultSeverity: "warning",
    normativa: "Obligaciones formales tributarias",
    referencia: "Modelos 115, 347, 349, 180",
    execute(data) {
      const faltantes = detectMissingFiscalModels(data);
      const triggered = faltantes.length > 0;

      return {
        passed: !triggered,
        severity: "warning",
        warningLevel: "high",
        tags: ["riesgo_fiscal"],
        diagnosis: triggered ? "Obligaciones formales tributarias sin confirmar" : undefined,
        sugerencia: "Verifique y presente los modelos fiscales aplicables antes de formular.",
        data: { faltantes },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("No se detectan modelos fiscales obligatorios sin confirmar.");
      }
      const faltantes = (outcome.data.faltantes as string[]) ?? [];
      return seniorIssue(
        `Según las operaciones del ejercicio, podrían faltar: ${faltantes.join("; ")}.`,
        `La omisión de modelos fiscales genera responsabilidad tributaria y compromete la formulación del cierre.`,
        `Confirme la presentación de cada modelo o documente por qué no aplica.`,
        "Señales contables de obligación formal sin evidencia de cumplimiento"
      ).explanation;
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      return ((outcome.data.faltantes as string[]) ?? []).map((m) =>
        withText("excel", "Modelo fiscal", m, "high")
      );
    },
  },
];
