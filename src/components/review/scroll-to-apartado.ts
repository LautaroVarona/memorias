import { navigateToMemoriaSection } from "./memoria-navigator";

/** Desplaza la vista al apartado en el visualizador de memoria (si existe). */
export function scrollToApartado(section?: string, highlightText?: string): boolean {
  if (!section) return false;
  navigateToMemoriaSection({ apartado: section, highlightText });
  return true;
}
