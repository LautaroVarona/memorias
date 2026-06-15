import { findSection } from "@/lib/case/build-case-data";
import { seniorExplanation, seniorExplanationPass } from "@/lib/rules/helpers/explanation";
import { withText } from "@/lib/rules/helpers/evidence";
import type { RuleDefinition } from "../types";

const VARIANTES_VINCULADAS = [
  "operaciones vinculadas",
  "partes vinculadas",
  "transacciones con partes vinculadas",
];

const VARIANTES_FISCAL = [
  "situación fiscal",
  "impuesto sobre sociedades",
  "conciliación fiscal",
  "gasto por impuesto",
];

export const pgcRules: RuleDefinition[] = [
  {
    id: "PGC_001",
    title: "Apartado vinculadas obligatorio",
    type: "pgc",
    defaultSeverity: "error",
    normativa: "PGC",
    referencia: "Norma 4ª PGC — operaciones vinculadas",
    execute(data) {
      if (!data.memory) {
        return {
          passed: false,
          severity: "error",
          sugerencia: "Suba la memoria para validar apartados obligatorios.",
          data: { missing: true },
        };
      }
      const presente = findSection(data, VARIANTES_VINCULADAS);
      return {
        passed: presente,
        severity: "error",
        sugerencia: "Incluya el apartado de operaciones con partes vinculadas.",
        data: { presente, sections: data.memory.sections.map((s) => s.titulo) },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("El apartado de operaciones vinculadas está presente en la memoria.");
      }
      return seniorExplanation(
        "Falta el apartado obligatorio de operaciones vinculadas en la memoria.",
        "Su omisión supone incumplimiento de la Norma 4ª del PGC sobre contenido mínimo de la memoria.",
        "Incluya un apartado que describa las operaciones con partes vinculadas del ejercicio."
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const sections = (outcome.data.sections as string[]) ?? [];
      return [withText("memory", "Secciones detectadas", sections.slice(0, 8).join("; "), "medium")];
    },
  },
  {
    id: "PGC_002",
    title: "Falta situación fiscal",
    type: "pgc",
    defaultSeverity: "error",
    normativa: "PGC",
    referencia: "Norma 4ª PGC — situación fiscal",
    execute(data) {
      if (!data.memory) {
        return {
          passed: false,
          severity: "error",
          sugerencia: "Suba la memoria para validar apartados obligatorios.",
          data: { missing: true },
        };
      }
      const presente = findSection(data, VARIANTES_FISCAL);
      return {
        passed: presente,
        severity: "error",
        sugerencia: "Incluya información sobre la situación fiscal e impuesto sobre sociedades.",
        data: { presente, sections: data.memory.sections.map((s) => s.titulo) },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("La situación fiscal está documentada en la memoria.");
      }
      return seniorExplanation(
        "Falta información fiscal obligatoria en la memoria.",
        "Sin este apartado no es posible evaluar la coherencia del cierre desde el punto de vista normativo y fiscal.",
        "Incluya la situación fiscal, el gasto por impuesto sobre sociedades y la conciliación con el resultado contable."
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const sections = (outcome.data.sections as string[]) ?? [];
      return [withText("memory", "Secciones detectadas", sections.slice(0, 8).join("; "), "medium")];
    },
  },
];
