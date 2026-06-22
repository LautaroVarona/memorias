import type { ReportValidation } from "./checklist";
import {
  extractApartadoInfo,
  formatApartadoLabel,
} from "@/lib/evidence/apartado-ref";

function stripLabel(text: string, labels: string[]): string {
  let out = text.trim();
  for (const label of labels) {
    if (out.toLowerCase().startsWith(label.toLowerCase())) {
      out = out.slice(label.length).trim();
    }
  }
  return out;
}

function parseExplanation(text: string): { hallazgo: string; accion: string } {
  const parts = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    const hallazgo = [parts[0], stripLabel(parts[1], ["Impacto:", "Implica:", "Por qué importa:"])]
      .filter(Boolean)
      .join(" ");
    const accion = stripLabel(parts[2], ["Acción:", "Revisar:", "Qué hacer:", "Sugerencia:"]);
    return { hallazgo, accion };
  }

  if (parts.length === 2) {
    return { hallazgo: parts[0], accion: parts[1] };
  }

  return { hallazgo: parts[0] || text, accion: "" };
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isRedundant(part: string, reference: string): boolean {
  const a = normalizeText(part);
  const b = normalizeText(reference);
  if (!a || !b) return true;
  return a === b || a.includes(b) || b.includes(a);
}

export function humanProblemDescription(v: ReportValidation): string {
  return v.title?.trim() || v.mensaje.split(/[.!?\n]/)[0]?.trim() || "Incidencia detectada";
}

export function buildHallazgoAccionText(v: ReportValidation): string {
  const explanation = (v.explanation ?? v.mensaje).trim();
  const { hallazgo, accion: parsedAction } = parseExplanation(explanation);
  const accion = (parsedAction || v.sugerencia || "").trim();
  const title = humanProblemDescription(v);

  const hallazgoText = isRedundant(hallazgo, title) ? hallazgo : hallazgo || title;
  const segments: string[] = [];

  if (hallazgoText && !isRedundant(hallazgoText, accion)) {
    segments.push(hallazgoText);
  }
  if (accion) {
    segments.push(accion);
  }

  return segments.join(" — ") || "Revise el apartado indicado en la memoria.";
}

export function buildHallazgoAccion(v: ReportValidation): string {
  const text = buildHallazgoAccionText(v);
  return `Hallazgo y Acción: ${text}`;
}

export function buildFindingLine(v: ReportValidation): string {
  const badge = v.severidad === "critical" ? "[X]" : "[!]";
  const title = humanProblemDescription(v);
  const detail = buildHallazgoAccionText(v);
  const apartado = extractApartadoInfo(v);
  const origin = apartado ? `Origen memoria: ${formatApartadoLabel(apartado)} | ` : "";
  return `${badge} ${origin}Problema detectado: ${title} | Hallazgo y Acción: ${detail}`;
}
