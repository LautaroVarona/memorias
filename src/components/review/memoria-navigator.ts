export interface MemoriaNavigateTarget {
  apartado?: string;
  highlightText?: string;
}

const EVENT = "memoria-navigate";

export function navigateToMemoriaSection(target: MemoriaNavigateTarget): void {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent<MemoriaNavigateTarget>(EVENT, { detail: target }));

  if (target.apartado) {
    const normalized = target.apartado.replace(/\D/g, "").padStart(2, "0");
    const section = document.getElementById(`apartado-${normalized}`);
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
  }

  const panel = document.getElementById("memoria-viewer-panel");
  if (panel) {
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export function subscribeMemoriaNavigate(
  handler: (target: MemoriaNavigateTarget) => void
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<MemoriaNavigateTarget>).detail);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
