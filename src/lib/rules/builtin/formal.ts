import { seniorExplanation, seniorExplanationPass } from "@/lib/rules/helpers/explanation";
import { withMemoryLocator, withText } from "@/lib/rules/helpers/evidence";
import type { ApartadoMemoria } from "@/types/domain";
import type { RuleDefinition } from "../types";

interface FraseCortadaHallazgo {
  fragmento: string;
  sectionId?: string;
  seccion?: string;
}

function findSectionForFragment(
  sections: ApartadoMemoria[],
  fragment: string
): { sectionId?: string; seccion?: string } {
  const needle = fragment.replace(/\.\.\.$/, "").trim().slice(0, 60);
  if (!needle) return {};

  for (const sec of sections) {
    if (sec.contenido.includes(needle)) {
      return {
        sectionId:
          sec.numero !== undefined ? String(sec.numero).padStart(2, "0") : sec.id,
        seccion: sec.titulo,
      };
    }
  }

  return {};
}

function buildFraseCortadaEvidence(hallazgos: FraseCortadaHallazgo[]) {
  return hallazgos.map((h) => {
    const reference = h.seccion ?? "Párrafo problemático";
    if (h.sectionId) {
      return withMemoryLocator(
        reference,
        h.fragmento,
        { section: h.sectionId, sectionTitle: h.seccion },
        "low"
      );
    }
    return withText("memory", reference, h.fragmento, "low");
  });
}

export const formalRules: RuleDefinition[] = [
  {
    id: "FORMAL_001",
    title: "Texto incompleto o roto",
    type: "formal",
    defaultSeverity: "warning",
    normativa: "PGC",
    referencia: "Memoria — calidad formal",
    execute(data) {
      const cortadas = data.memory?.formal.frasesCortadas ?? [];
      const sections = data.memory?.sections ?? [];
      const hallazgos: FraseCortadaHallazgo[] = cortadas.map((fragmento) => ({
        fragmento,
        ...findSectionForFragment(sections, fragmento),
      }));
      return {
        passed: cortadas.length === 0,
        severity: "warning",
        sugerencia: "Revise párrafos incompletos que puedan indicar cortes de edición.",
        data: { cortadas, hallazgos },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("No se detectaron frases truncadas en la memoria.");
      }
      const n = (outcome.data.cortadas as string[])?.length ?? 0;
      return seniorExplanation(
        `Se han detectado ${n} posible(s) frase(s) incompleta(s) en la memoria.`,
        `Puede tratarse de un error de formato, conversión PDF/Word o redacción que afecte la presentación del cierre.`,
        `Revise los párrafos señalados y corrija antes de la presentación definitiva.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      return buildFraseCortadaEvidence(
        ((outcome.data.hallazgos as FraseCortadaHallazgo[]) ?? []).slice(0, 3)
      );
    },
  },
  {
    id: "FORMAL_002",
    title: "Secciones duplicadas",
    type: "formal",
    defaultSeverity: "warning",
    normativa: "PGC",
    referencia: "Memoria — estructura",
    execute(data) {
      const repetidos = data.memory?.formal.apartadosRepetidos ?? [];
      return {
        passed: repetidos.length === 0,
        severity: "warning",
        sugerencia: "Elimine o renombre los apartados duplicados.",
        data: { repetidos },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("No hay apartados duplicados en la memoria.");
      }
      const repetidos = (outcome.data.repetidos as string[]) ?? [];
      return seniorExplanation(
        `Apartados duplicados detectados: ${repetidos.join(", ")}.`,
        `La duplicidad puede generar confusión en la revisión del cierre y en la lectura por parte del usuario.`,
        `Elimine o renombre los apartados repetidos manteniendo la estructura PGC.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      return ((outcome.data.repetidos as string[]) ?? []).map((r) =>
        withText("memory", r, "Apartado duplicado", "medium")
      );
    },
  },
];
