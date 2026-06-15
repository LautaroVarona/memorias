import type { EvidenceItem } from "./types";
import { evRef, evValue, normalizeEvidenceType } from "./parse-issue";

export function evText(ev: EvidenceItem): string {
  return ev.text ?? ev.detalle ?? "";
}

/** Fragmento corto para buscar en Word con Ctrl+F */
export function extractSearchSnippet(text: string): string {
  const clean = text.replace(/^…+|…+$/g, "").trim();
  if (!clean) return "";

  const words = clean.split(/\s+/).filter((w) => w.length > 1);
  if (words.length <= 5) return clean.slice(0, 100);

  return words.slice(0, 5).join(" ");
}

function parseEuroAmount(raw: string): number | null {
  const normalized = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

export function valuesMismatch(excel?: string, memory?: string): boolean {
  if (!excel || !memory) return false;
  const a = parseEuroAmount(excel);
  const b = parseEuroAmount(memory);
  if (a === null || b === null) return excel.trim() !== memory.trim();
  return Math.abs(a - b) > 0.01;
}

export function formatExcelBadgeLabel(reference: string): string {
  const filaMatch = reference.match(/^(.+?)\s+fila\s+(\d+)/i);
  if (filaMatch) return `Excel ➔ ${filaMatch[1].trim()}: fila ${filaMatch[2]}`;

  const cuentaMatch = reference.match(/(?:cta\.?|cuenta)\s*(\d{3,10})/i);
  if (cuentaMatch) {
    const hoja = reference.split(/[—:]/)[0].trim();
    return `Excel ➔ ${hoja}: Cta ${cuentaMatch[1]}`;
  }

  const hojaKnown = /^(SYS_|BALANCE|PG|AJUIS|CALCIS|Inmovilizado|PAGOS)/i.test(reference);
  if (hojaKnown && reference.includes(" ")) {
    const [hoja, ...rest] = reference.split(/\s+/);
    return `Excel ➔ ${hoja}: ${rest.join(" ")}`;
  }

  return `Excel ➔ ${reference}`;
}

export function formatMemoryBadgeLabel(reference: string): string {
  const apartadoRef = reference.match(/apartado\s*(\d{1,2})/i);
  if (apartadoRef) {
    return `Memoria ➔ Apartado ${apartadoRef[1].padStart(2, "0")}`;
  }

  const leadingNum = reference.match(/^(\d{1,2})\s/);
  if (leadingNum) {
    return `Memoria ➔ Apartado ${leadingNum[1].padStart(2, "0")}`;
  }

  if (/^Apartado\s+\d{2}/i.test(reference)) {
    return `Memoria ➔ ${reference}`;
  }

  return `Memoria ➔ ${reference}`;
}

export function formatEvidenceBadgeLabel(ev: EvidenceItem): string {
  const type = normalizeEvidenceType(ev);
  const ref = evRef(ev);
  return type === "excel" ? formatExcelBadgeLabel(ref) : formatMemoryBadgeLabel(ref);
}

export function evidenceDisplayValue(ev: EvidenceItem): string | undefined {
  const value = evValue(ev);
  const text = evText(ev);
  if (value) return value;
  if (text && text.length <= 60) return text;
  return undefined;
}

export function isNarrativeEvidence(ev: EvidenceItem): boolean {
  const text = evText(ev);
  return text.length > 80 || text.includes("\n");
}
