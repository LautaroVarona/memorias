import type { ApartadoMemoria } from "@/types/domain";

/** Umbral de variación relativa de longitud entre ejercicios (10 %). */
export const UMBRAL_VARIACION_TEXTO_APARTADO = 0.1;

/** Umbral de reducción de texto respecto al ejercicio anterior (50 %). */
export const UMBRAL_REDUCCION_TEXTO_APARTADO = 0.5;

const MESES_ES =
  "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre";

/**
 * Normaliza texto para comparación interanual ignorando años, fechas e importes.
 * Dos memorias consecutivas suelen diferir solo en cifras y ejercicios; eso no es un error.
 */
export function normalizarTextoComparacionInteranual(texto: string): string {
  return normalizarTextoApartado(texto)
    .replace(
      new RegExp(`\\b\\d{1,2}\\s+de\\s+(?:${MESES_ES})\\s+de\\s+\\d{4}\\b`, "gi"),
      " "
    )
    .replace(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/g, " ")
    .replace(/\ba\s+31\s+de\s+diciembre\b/g, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\d[\d.,\s]*(?:€|eur(?:os?)?)?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normaliza el texto de un apartado para comparación interanual:
 * minúsculas, sin tildes, saltos de línea extra colapsados y espacios consecutivos unificados.
 */
export function normalizarTextoApartado(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Convierte el título de un apartado en slug resiliente:
 * minúsculas, sin tildes, sin numeración inicial ni signos de puntuación.
 */
export function tituloApartadoSlug(titulo: string): string {
  return normalizarTextoApartado(titulo)
    .replace(/^\d{1,2}\s*[.\-–:]?\s*/, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Slug del apartado; si el título queda vacío, usa el id como respaldo. */
export function apartadoSlug(section: ApartadoMemoria): string {
  const slug = tituloApartadoSlug(section.titulo);
  if (slug) return slug;
  return normalizarTextoApartado(section.id);
}

export function variacionLongitudPct(actual: number, anterior: number): number {
  if (anterior === 0) return actual === 0 ? 0 : 1;
  return Math.abs((actual - anterior) / anterior);
}

export function reduccionLongitudPct(actual: number, anterior: number): number {
  if (anterior === 0 || actual >= anterior) return 0;
  return (anterior - actual) / anterior;
}

export type MotivoVariacionTexto = "variacion" | "reduccion";

export interface ApartadoVariacionTexto {
  slug: string;
  nombre: string;
  numero?: number;
  lenActual: number;
  lenAnterior: number;
  variacionPct: number;
  reduccionPct: number;
  motivo: MotivoVariacionTexto;
  textoAnterior: string;
  textoActual: string;
}

export interface ApartadoOmitido {
  slug: string;
  nombre: string;
  numero?: number;
}

const MAX_TEXTO_DIFF = 5000;

function truncarTextoDiff(texto: string): string {
  if (texto.length <= MAX_TEXTO_DIFF) return texto;
  return `${texto.slice(0, MAX_TEXTO_DIFF)}…`;
}

/** Apartados presentes en el ejercicio anterior que no aparecen en el actual (por slug). */
export function detectarApartadosOmitidos(
  actuales: ApartadoMemoria[],
  anteriores: ApartadoMemoria[]
): ApartadoOmitido[] {
  const slugsActuales = new Set(actuales.map(apartadoSlug));
  const omitidos: ApartadoOmitido[] = [];
  const vistos = new Set<string>();

  for (const section of anteriores) {
    const slug = apartadoSlug(section);
    if (slugsActuales.has(slug) || vistos.has(slug)) continue;
    vistos.add(slug);
    omitidos.push({
      slug,
      nombre: section.titulo,
      numero: section.numero,
    });
  }

  return omitidos;
}

export function apartadoTextoCambioSignificativo(
  lenActual: number,
  lenAnterior: number,
  umbralVariacion = UMBRAL_VARIACION_TEXTO_APARTADO,
  umbralReduccion = UMBRAL_REDUCCION_TEXTO_APARTADO
): { significativo: boolean; motivo?: MotivoVariacionTexto } {
  const variacionPct = variacionLongitudPct(lenActual, lenAnterior);
  const reduccionPct = reduccionLongitudPct(lenActual, lenAnterior);

  if (reduccionPct > umbralReduccion) {
    return { significativo: true, motivo: "reduccion" };
  }
  if (variacionPct > umbralVariacion) {
    return { significativo: true, motivo: "variacion" };
  }
  return { significativo: false };
}

export function detectarVariacionesTextoApartados(
  actuales: ApartadoMemoria[],
  anteriores: ApartadoMemoria[],
  umbralVariacion = UMBRAL_VARIACION_TEXTO_APARTADO,
  umbralReduccion = UMBRAL_REDUCCION_TEXTO_APARTADO
): ApartadoVariacionTexto[] {
  const priorMap = new Map<string, ApartadoMemoria>();
  for (const section of anteriores) {
    const slug = apartadoSlug(section);
    if (!priorMap.has(slug)) priorMap.set(slug, section);
  }

  const variados: ApartadoVariacionTexto[] = [];

  for (const current of actuales) {
    const slug = apartadoSlug(current);
    const prior = priorMap.get(slug);
    if (!prior) continue;

    const textoActualNorm = normalizarTextoComparacionInteranual(current.contenido);
    const textoAnteriorNorm = normalizarTextoComparacionInteranual(prior.contenido);

    if (textoActualNorm === textoAnteriorNorm) continue;

    const lenActual = textoActualNorm.length;
    const lenAnterior = textoAnteriorNorm.length;
    const variacionPct = variacionLongitudPct(lenActual, lenAnterior);
    const reduccionPct = reduccionLongitudPct(lenActual, lenAnterior);
    const cambio = apartadoTextoCambioSignificativo(
      lenActual,
      lenAnterior,
      umbralVariacion,
      umbralReduccion
    );

    if (cambio.significativo) {
      variados.push({
        slug,
        nombre: current.titulo,
        numero: current.numero ?? prior.numero,
        lenActual,
        lenAnterior,
        variacionPct,
        reduccionPct,
        motivo: cambio.motivo ?? "variacion",
        textoAnterior: truncarTextoDiff(normalizarTextoApartado(prior.contenido)),
        textoActual: truncarTextoDiff(normalizarTextoApartado(current.contenido)),
      });
    }
  }

  return variados;
}
