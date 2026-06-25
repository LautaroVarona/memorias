import {
  extractApartadoInfo,
  type ValidationApartadoSource,
} from "@/lib/evidence/apartado-ref";

export interface ValidacionApartadoLike extends ValidationApartadoSource {
  ruleId: string;
}

const LEGACY_GLOBAL_TITLE_PATTERNS = [
  /an[aá]lisis\s+de\s+nombres?\s+propios?/i,
  /referencias?\s+al?\s+a[nñ]o/i,
  /otras?\s+posibles?\s+inconsistencias?/i,
];

const LEGACY_GLOBAL_RULE_PREFIXES = [
  "CONSISTENCIA_GLOBAL_",
  "NARR_ADV_",
];

const LEGACY_GLOBAL_RULE_IDS = new Set([
  "INTER_002",
  "INTER_003",
  "INTER_004",
  "TEMP_003",
]);

function textMatchesLegacyGlobal(text?: string | null): boolean {
  if (!text) return false;
  return LEGACY_GLOBAL_TITLE_PATTERNS.some((pattern) => pattern.test(text));
}

export function isLegacyGlobalValidation(v: ValidacionApartadoLike): boolean {
  if (LEGACY_GLOBAL_RULE_IDS.has(v.ruleId)) return true;
  if (LEGACY_GLOBAL_RULE_PREFIXES.some((prefix) => v.ruleId.startsWith(prefix))) return true;

  return (
    textMatchesLegacyGlobal(v.title) ||
    textMatchesLegacyGlobal(v.referencia) ||
    textMatchesLegacyGlobal(v.explanation) ||
    textMatchesLegacyGlobal(v.mensaje)
  );
}

export function hasApartadoTarget(v: ValidationApartadoSource): boolean {
  return Boolean(extractApartadoInfo(v));
}

/** Mantiene solo validaciones mapeables a apartados y excluye análisis globales legacy. */
export function filterApartadoOnlyValidaciones<T extends ValidacionApartadoLike>(items: T[]): T[] {
  return items.filter((v) => !isLegacyGlobalValidation(v) && hasApartadoTarget(v));
}

