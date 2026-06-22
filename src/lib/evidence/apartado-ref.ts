/** Fuente mínima para resolver el apartado de memoria (UI, informes, reglas). */
export interface ApartadoRefSource {
  type?: string;
  tipo?: string;
  section?: string;
  sectionTitle?: string;
  reference?: string;
  referencia?: string;
  text?: string;
  detalle?: string;
  origen?: { ubicacion?: string };
}

export interface ValidationApartadoSource {
  evidencia: readonly unknown[];
  explanation?: string | null;
  mensaje?: string;
  referencia?: string | null;
  title?: string | null;
}

export interface ApartadoInfo {
  num: string;
  title?: string;
}

const APARTADO_NUM_RE = /(?:^|[\s/[(—–-])(?:apartado|ap\.?)\s*(\d{1,2})\b/i;
const APARTADO_WITH_TITLE_RE =
  /(?:apartado|ap\.?)\s*(\d{1,2})\s*(?:[—–\-/(]\s*([^/)\n]+?)(?:\)|\s*\/|$))?/i;

function padApartadoNum(num: string): string {
  const digits = num.replace(/\D/g, "");
  if (!digits) return num.padStart(2, "0");
  return digits.padStart(2, "0");
}

function cleanSectionTitle(title?: string): string | undefined {
  if (!title) return undefined;
  const cleaned = title
    .trim()
    .replace(/\s*\/\s*$/, "")
    .replace(/^["'«»]+|["'«»]+$/g, "");
  if (!cleaned || /^p[aá]g\.?\s*\d/i.test(cleaned) || /^fila:/i.test(cleaned)) {
    return undefined;
  }
  return cleaned;
}

function isMemoryEvidence(ev: ApartadoRefSource): boolean {
  const t = (ev.type ?? ev.tipo ?? "").toLowerCase();
  return t === "memory" || t === "memoria";
}

function asApartadoRefSource(ev: unknown): ApartadoRefSource | null {
  if (ev == null || typeof ev !== "object" || Array.isArray(ev)) return null;
  return ev as ApartadoRefSource;
}

/** Extrae número (y título opcional) de un texto libre. */
export function parseApartadoFromText(text: string): ApartadoInfo | undefined {
  const withTitle = text.match(APARTADO_WITH_TITLE_RE);
  if (withTitle) {
    return {
      num: padApartadoNum(withTitle[1]),
      title: cleanSectionTitle(withTitle[2]),
    };
  }

  const numMatch = text.match(APARTADO_NUM_RE);
  if (numMatch) {
    return { num: padApartadoNum(numMatch[1]) };
  }

  const leadingNum = text.match(/^(\d{1,2})\s+[A-ZÁÉÍÓÚÑ]/);
  if (leadingNum) {
    return { num: padApartadoNum(leadingNum[1]) };
  }

  return undefined;
}

function titleFromUbicacion(ubicacion: string, num: string): string | undefined {
  const parts = ubicacion
    .split(/\s*\/\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    if (new RegExp(`^(?:apartado|ap\\.?)\\s*${parseInt(num, 10)}\\b`, "i").test(part)) {
      continue;
    }
    if (/^p[aá]g\.?\s*\d/i.test(part) || /^fila:/i.test(part) || /^col\./i.test(part)) {
      continue;
    }
    const parsed = parseApartadoFromText(part);
    if (parsed?.title) return parsed.title;
    if (!/(?:apartado|ap\.?)\s*\d/i.test(part)) {
      return cleanSectionTitle(part);
    }
  }

  return undefined;
}

/** Resuelve apartado desde un ítem de evidencia. */
export function extractApartadoFromEvidence(ev: ApartadoRefSource): ApartadoInfo | undefined {
  if (ev.section) {
    const num = padApartadoNum(ev.section);
    return {
      num,
      title: cleanSectionTitle(ev.sectionTitle) ?? titleFromUbicacion(ev.origen?.ubicacion ?? "", num),
    };
  }

  const candidates = [
    ev.origen?.ubicacion,
    ev.reference,
    ev.referencia,
    ev.text,
    ev.detalle,
  ].filter((s): s is string => typeof s === "string" && s.trim().length > 0);

  for (const text of candidates) {
    const parsed = parseApartadoFromText(text);
    if (parsed) {
      return {
        num: parsed.num,
        title:
          cleanSectionTitle(ev.sectionTitle) ??
          parsed.title ??
          titleFromUbicacion(text, parsed.num),
      };
    }
  }

  return undefined;
}

/** Apartado principal de una validación (prioriza evidencia de memoria). */
export function extractApartadoInfo(source: ValidationApartadoSource): ApartadoInfo | undefined {
  const items = source.evidencia
    .map(asApartadoRefSource)
    .filter((ev): ev is ApartadoRefSource => ev !== null);
  const memoryEvs = items.filter(isMemoryEvidence);
  const ordered = [...memoryEvs, ...items.filter((ev) => !isMemoryEvidence(ev))];

  for (const ev of ordered) {
    const info = extractApartadoFromEvidence(ev);
    if (info) return info;
  }

  const texts = [source.referencia, source.explanation, source.mensaje, source.title].filter(
    (s): s is string => typeof s === "string" && s.trim().length > 0
  );

  for (const text of texts) {
    const info = parseApartadoFromText(text);
    if (info) return info;
  }

  return undefined;
}

/** Número de apartado (p. ej. "09") o undefined. */
export function extractApartadoRef(source: ValidationApartadoSource): string | undefined {
  return extractApartadoInfo(source)?.num;
}

export function formatApartadoShort(info: ApartadoInfo): string {
  return `Ap. ${info.num}`;
}

export function formatApartadoLabel(info: ApartadoInfo): string {
  const base = `Apartado ${info.num}`;
  return info.title ? `${base} (${info.title})` : base;
}

export function textIncludesApartado(text: string, num: string): boolean {
  const normalized = text.toLowerCase();
  const n = parseInt(num, 10);
  return (
    normalized.includes(`apartado ${num}`) ||
    normalized.includes(`apartado ${n}`) ||
    normalized.includes(`ap. ${num}`) ||
    normalized.includes(`ap. ${n}`) ||
    normalized.includes(`ap ${num}`) ||
    normalized.includes(`ap ${n}`)
  );
}
