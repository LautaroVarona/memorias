/** Desplaza la vista al apartado en el visualizador de memoria (si existe). */
export function scrollToApartado(section?: string): boolean {
  if (!section) return false;
  const normalized = section.replace(/\D/g, "").padStart(2, "0");
  const selectors = [
    `#apartado-${normalized}`,
    `[data-apartado="${normalized}"]`,
    `#apartado-${parseInt(normalized, 10)}`,
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("ring-2", "ring-amber-400", "ring-offset-2");
      window.setTimeout(() => {
        el.classList.remove("ring-2", "ring-amber-400", "ring-offset-2");
      }, 2000);
      return true;
    }
  }
  const preview = document.getElementById("memoria-apartados");
  preview?.scrollIntoView({ behavior: "smooth", block: "start" });
  return false;
}
