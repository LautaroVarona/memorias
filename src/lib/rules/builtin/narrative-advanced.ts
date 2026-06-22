import { getAccounts } from "@/lib/case/build-case-data";
import { sumByPrefix } from "@/lib/rules/helpers/accounts";
import { hasElevatedVinculadas } from "@/lib/rules/helpers/closure-signals";
import { seniorExplanationPass, seniorIssue } from "@/lib/rules/helpers/explanation";
import { withText } from "@/lib/rules/helpers/evidence";
import type { RuleDefinition } from "../types";

const GENERIC_PATTERNS: { pattern: RegExp; tipo: string; contradictWhen: (ctx: GenericContext) => boolean }[] = [
  {
    pattern: /no\s+hay\s+riesgos|sin\s+riesgos|no\s+existen\s+riesgos|riesgo\s+insignificante/i,
    tipo: "riesgos",
    contradictWhen: (ctx) => ctx.activo > 500_000 || ctx.vinculadas,
  },
  {
    pattern: /sin\s+deuda|no\s+mantiene\s+deuda|libre\s+de\s+deuda|sin\s+endeudamiento/i,
    tipo: "deuda",
    contradictWhen: (ctx) => ctx.deuda > 50_000,
  },
  {
    pattern: /sin\s+operaciones\s+vinculadas|no\s+existen\s+operaciones\s+vinculadas/i,
    tipo: "vinculadas",
    contradictWhen: (ctx) => ctx.vinculadas,
  },
];

interface GenericContext {
  activo: number;
  deuda: number;
  vinculadas: boolean;
}

function buildGenericContext(data: import("@/types/case-data").CaseData): GenericContext {
  const accounts = getAccounts(data);
  const balance = data.financials.balance;

  const activo = balance?.activo.total ?? 0;

  return {
    activo,
    deuda: Math.abs(sumByPrefix(accounts, ["170", "171", "172", "520", "521"])),
    vinculadas: hasElevatedVinculadas(data),
  };
}

export const narrativeAdvancedRules: RuleDefinition[] = [
  {
    id: "NARR_ADV_001",
    title: "Afirmación genérica potencialmente insuficiente",
    type: "narrative",
    defaultSeverity: "warning",
    normativa: "PGC — principio de información suficiente",
    referencia: "Calidad narrativa de la memoria",
    execute(data) {
      if (!data.memory) return { passed: true, data: { skip: true } };

      const texto = data.memory.fullText;
      const ctx = buildGenericContext(data);
      const detectadas: { tipo: string; fragmento: string }[] = [];

      for (const regla of GENERIC_PATTERNS) {
        const match = texto.match(regla.pattern);
        if (match && regla.contradictWhen(ctx)) {
          detectadas.push({ tipo: regla.tipo, fragmento: match[0] });
        }
      }

      return {
        passed: detectadas.length === 0,
        severity: "warning",
        warningLevel: "medium",
        diagnosis:
          detectadas.length > 0 ? "Texto boilerplate contradicho por magnitud u operaciones" : undefined,
        sugerencia: "Sustituya afirmaciones genéricas por explicación proporcional al tamaño y operaciones.",
        data: { detectadas, ctx },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        if (outcome.data.skip) return seniorExplanationPass("No hay memoria que analizar.");
        return seniorExplanationPass("Las afirmaciones de la memoria son proporcionadas al expediente.");
      }
      const detectadas = (outcome.data.detectadas as { tipo: string; fragmento: string }[]) ?? [];
      const lista = detectadas.map((d) => `"${d.fragmento}" (${d.tipo})`).join("; ");

      return seniorIssue(
        `La memoria contiene afirmaciones genéricas contradichas por el tamaño u operaciones del ejercicio: ${lista}.`,
        `Frases estándar sin desarrollo debilitan la defensa del cierre ante una revisión.`,
        `Reemplace las afirmaciones genéricas por explicación concreta acorde a la magnitud del expediente.`,
        "Narrativa boilerplate incompatible con señales contables"
      ).explanation;
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const detectadas = (outcome.data.detectadas as { tipo: string; fragmento: string }[]) ?? [];
      return detectadas.map((d) =>
        withText("memory", `Afirmación genérica (${d.tipo})`, d.fragmento, "medium")
      );
    },
  },
];
