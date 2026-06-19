import type { EvidenceItem } from "./types";
import type { DataOrigen } from "@/types/tracking";
import { evRef, evValue, normalizeEvidenceType } from "./parse-issue";

/**
 * Formatea de manera homogénea y legible el origen de un dato trazado
 * para su visualización en badges, copiado en portapapeles y herramientas de revisión.
 */
/** Formato compacto para tablas densas (p. ej. procedencia en vinculadas). */
export function formatOrigenCompact(origen?: DataOrigen | null, maxLen = 44): string {
  if (!origen) return "—";

  const { documento, ubicacion } = origen;
  let prefix = "Desconocido";
  if (documento === "memoria_actual") prefix = "Memoria";
  else if (documento === "memoria_anterior") prefix = "Mem. N-1";
  else if (documento === "excel") prefix = "Excel";

  const loc = ubicacion
    .replace(/Apartado\s+(\d{1,2})/gi, (_, n: string) => `Ap. ${n.padStart(2, "0")}`)
    .replace(/Hoja:\s*/gi, "")
    .replace(/fila\s+/gi, "f.")
    .replace(/col\.\s*/gi, "c.")
    .replace(/\s+/g, " ")
    .trim();

  const formatted = `${prefix} ➔ [${loc}]`;
  if (formatted.length <= maxLen) return formatted;
  return `${formatted.slice(0, maxLen - 1)}…`;
}

export function formatOrigen(origen?: DataOrigen | null): string {
  if (!origen) return "Origen no documentado (Legacy)";

  const { documento, ubicacion, detalleRaw } = origen;
  const rawSuffix = detalleRaw ? ` [Raw: "${detalleRaw}"]` : "";

  switch (documento) {
    case "memoria_actual":
      return `Memoria ➔ [${ubicacion}]${rawSuffix}`;

    case "memoria_anterior":
      return `Memoria N-1 ➔ [${ubicacion}]${rawSuffix}`;

    case "excel":
      return `Excel ➔ [${ubicacion}]${rawSuffix}`;

    default:
      return `Desconocido ➔ [${ubicacion}]`;
  }
}

/** Helper para formatear el copy al portapapeles enriquecido (un valor trazado). */
export function formatEvidenceForCopy(
  label: string,
  valor: number,
  origen: DataOrigen
): string {
  const valorFormateado = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(valor);
  return `${label}: ${valorFormateado} (${formatOrigen(origen)})`;
}

/** Texto plano de toda la evidencia para copiar al portapapeles. */
export function formatEvidenceListForCopy(evidencia: EvidenceItem[]): string {
  return evidencia
    .map((ev) => {
      const ref = evRef(ev);
      const val = ev.value ?? ev.valor;
      if (ev.origen && typeof val === "number" && Number.isFinite(val)) {
        return formatEvidenceForCopy(ref, val, ev.origen);
      }
      const parts = [ref];
      const formatted = evValue(ev);
      const text = evText(ev);
      if (formatted) parts.push(formatted);
      if (text) parts.push(text);
      if (ev.diffPrior) parts.push(`[N-1]\n${ev.diffPrior}`);
      if (ev.diffCurrent) parts.push(`[N]\n${ev.diffCurrent}`);
      return parts.join(" — ");
    })
    .join("\n\n");
}

/** Construye DataOrigen desde campos legacy cuando el motor aún no pobló `origen`. */
export function evidenceToOrigen(ev: EvidenceItem): DataOrigen {
  if (ev.origen?.ubicacion) return ev.origen;

  const type = normalizeEvidenceType(ev);
  const documento = type === "excel" ? "excel" : "memoria_actual";
  const parts: string[] = [];

  if (type === "excel") {
    if (ev.sheet) parts.push(`Hoja: ${ev.sheet}`);
    if (ev.row !== undefined) parts.push(`fila ${ev.row}`);
    if (ev.column) parts.push(`col. ${ev.column}`);
  } else {
    if (ev.section) parts.push(`Apartado ${ev.section.padStart(2, "0")}`);
    if (ev.sectionTitle) parts.push(ev.sectionTitle);
    if (ev.page !== undefined) parts.push(`pág. ${ev.page}`);
    if (ev.rowLabel) parts.push(`Fila: ${ev.rowLabel}`);
  }

  return { documento, ubicacion: parts.length > 0 ? parts.join(" / ") : evRef(ev) };
}

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

function formatMemoryLocationLabel(ev: EvidenceItem): string {
  const ref = evRef(ev);
  const apartadoRef = ref.match(/apartado\s*(\d{1,2})/i);
  if (apartadoRef) {
    const num = apartadoRef[1].padStart(2, "0");
    const title = ev.sectionTitle ? ` (${ev.sectionTitle})` : "";
    return `Memoria ➔ Apartado ${num}${title}`;
  }
  return formatMemoryBadgeLabel(ref);
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
  const value = evidenceDisplayValue(ev);
  const origen = ev.origen as DataOrigen | undefined;

  if (origen?.ubicacion) {
    const formatted = formatOrigen(origen);
    return value ? `${formatted} ➔ ${value}` : formatted;
  }

  const base = type === "excel" ? formatExcelBadgeLabel(ref) : formatMemoryLocationLabel(ev);
  if (!value) return base;
  const statusFromText = !evValue(ev) && evText(ev) === value;
  return statusFromText ? `${base} · ${value}` : `${base} ➔ ${value}`;
}

export function hasStructuredLocator(ev: EvidenceItem): boolean {
  return !!(
    ev.documentName ||
    ev.page !== undefined ||
    ev.sheet ||
    ev.row !== undefined ||
    ev.column
  );
}

export function formatEvidenceLocator(ev: EvidenceItem): string | undefined {
  const origen = ev.origen as DataOrigen | undefined;
  if (origen?.ubicacion) {
    return formatOrigen(origen);
  }

  if (hasStructuredLocator(ev)) {
    const type = normalizeEvidenceType(ev);
    if (type === "memory") {
      const parts: string[] = [];
      if (ev.documentName) parts.push(ev.documentName);
      if (ev.page !== undefined) parts.push(`pág. ${ev.page}`);
      return parts.length > 0 ? parts.join(" · ") : undefined;
    }
    const parts: string[] = [];
    if (ev.sheet) parts.push(`Hoja ${ev.sheet}`);
    if (ev.row !== undefined) parts.push(`fila ${ev.row}`);
    if (ev.column) parts.push(`col. ${ev.column}`);
    return parts.length > 0 ? parts.join(" · ") : undefined;
  }

  const ref = evRef(ev);
  const type = normalizeEvidenceType(ev);
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

/** Evidencia corta cuyo texto de estado ya está en la etiqueta (p. ej. apartados omitidos). */
export function isSimpleStatusEvidence(ev: EvidenceItem): boolean {
  const text = evText(ev);
  if (!text || isNarrativeEvidence(ev)) return false;
  if (ev.origen?.ubicacion) return false;
  if (hasStructuredLocator(ev)) return false;
  const displayValue = evidenceDisplayValue(ev);
  return displayValue === text;
}

/** Subtítulo de trazabilidad para evidencias de memoria (página, apartado, fila). */
export function formatMemoryTracingSubtitle(ev: EvidenceItem): string | undefined {
  const parts: string[] = [];
  if (ev.page !== undefined) parts.push(`Página ${ev.page}`);
  if (ev.section) {
    const apartado = `Apartado ${ev.section.padStart(2, "0")}`;
    parts.push(
      ev.sectionTitle ? `${apartado} (${ev.sectionTitle})` : apartado
    );
  } else if (ev.sectionTitle) {
    parts.push(ev.sectionTitle);
  }
  if (ev.rowLabel) parts.push(`Fila: ${ev.rowLabel}`);
  return parts.length > 0 ? parts.join(" - ") : undefined;
}

export function formatExcelCellRef(ev: EvidenceItem): string | undefined {
  if (!ev.column && ev.row === undefined) return undefined;
  const col = ev.column ?? "";
  const row = ev.row !== undefined ? String(ev.row) : "";
  if (!col && !row) return undefined;
  return `${col}${row}`;
}

export interface ParsedAccountEvidence {
  cuenta: string;
  descripcion: string;
}

/** Parsea referencias del tipo "Cta 4330001 — Descripción". */
export function parseAccountEvidence(ev: EvidenceItem): ParsedAccountEvidence | null {
  const ref = evRef(ev);
  const match = ref.match(/^Cta\s+(\S+)\s*[—–-]\s*(.+)$/i);
  if (!match) return null;
  return { cuenta: match[1], descripcion: match[2].trim() };
}

export function numericEvidenceValue(ev: EvidenceItem): number {
  if (typeof ev.value === "number" && Number.isFinite(ev.value)) return ev.value;
  const raw = ev.formattedValue ?? (typeof ev.value === "string" ? ev.value : "");
  const normalized = raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}
