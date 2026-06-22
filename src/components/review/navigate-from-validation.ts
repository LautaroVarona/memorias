import type { ValidacionView } from "./types";
import { extractApartadoInfo } from "@/lib/evidence/apartado-ref";
import { extractSearchSnippet, evText } from "./evidence-utils";
import { normalizeEvidenceType } from "./parse-issue";
import { navigateToMemoriaSection } from "./memoria-navigator";

function findHighlightSnippet(validacion: ValidacionView): string | undefined {
  for (const ev of validacion.evidencia) {
    if (normalizeEvidenceType(ev) !== "memory") continue;
    const text = evText(ev);
    if (!text) continue;
    const snippet = extractSearchSnippet(text);
    if (snippet) return snippet;
  }
  return undefined;
}

/** Lleva al visor de memoria al apartado (y fragmento) asociado a una validación. */
export function navigateToMemoriaFromValidation(validacion: ValidacionView): boolean {
  const apartado = extractApartadoInfo(validacion);
  if (!apartado) return false;

  navigateToMemoriaSection({
    apartado: apartado.num,
    highlightText: findHighlightSnippet(validacion),
  });
  return true;
}
