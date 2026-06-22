/**
 * Hojas del libro de cierre .xlsm del despacho que deben validarse.
 * Son las que se reportan al ministerio y deben cuadrar con la memoria.
 * El resto de pestañas del libro se ignoran.
 */
export const HOJAS_LIBRO_CIERRE = [
  "SYS_4_3_Digitos",
  "Sys4_digital",
  "balance",
  "pg",
  "inmovilizado",
  "ajuis",
  "calcis",
  "bonificacion",
  "bonificaciones",
  "pagos proveedores",
  "dana",
  "retribucion administradores",
  "pendientes",
  "incidencias",
] as const;

/** Hojas estructurales: contabilidad, balance y PyG */
export const HOJA_CONTABILIDAD = "SYS_4_3_Digitos";
export const HOJA_BALANCE = "balance";
export const HOJA_PG = "pg";

/** Alias de contabilidad: SYS_4_3_Digitos es la única fuente operativa (SYS_cliente no se usa) */
export const ALIASES_CONTABILIDAD = ["SYS_4_3_Digitos", "Sys4_digital"] as const;
export const ALIASES_BALANCE = ["balance", "BCE ABREVIADO"] as const;
export const ALIASES_PG = ["pg"] as const;

export function normalizeSheetName(name: string): string {
  return name
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function isAllowedCierreSheet(name: string): boolean {
  const normalized = normalizeSheetName(name);
  return HOJAS_LIBRO_CIERRE.some((h) => normalizeSheetName(h) === normalized);
}

/** Hojas presentes en el archivo que están en la whitelist */
export function sheetsToLoad(sheetNames: string[]): string[] {
  return sheetNames.filter(isAllowedCierreSheet);
}

/** Resuelve la hoja de contabilidad (SYS_4_3_Digitos o Sys4_digital legacy). */
export function resolveContabilidadSheet(sheetNames: string[]): string | undefined {
  return resolveSheet(sheetNames, ...ALIASES_CONTABILIDAD);
}

/** Resuelve el nombre real de la hoja en el workbook (insensible a mayúsculas/espacios) */
export function resolveSheet(
  sheetNames: string[],
  ...candidates: string[]
): string | undefined {
  for (const candidate of candidates) {
    const target = normalizeSheetName(candidate);
    const found = sheetNames.find((n) => normalizeSheetName(n) === target);
    if (found) return found;
  }
  return undefined;
}

/** Hojas ministeriales auxiliares (todas excepto contabilidad, balance y pg) */
export function isHojaMinisterioAux(nombre: string): boolean {
  const n = normalizeSheetName(nombre);
  const core = [...ALIASES_CONTABILIDAD, ...ALIASES_BALANCE, ...ALIASES_PG].map(normalizeSheetName);
  return isAllowedCierreSheet(nombre) && !core.includes(n);
}
