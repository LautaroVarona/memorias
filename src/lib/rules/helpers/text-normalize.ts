import type { ApartadoMemoria } from "@/types/domain";

/** Umbral de variación relativa de longitud entre ejercicios (10 %). */
export const UMBRAL_VARIACION_TEXTO_APARTADO = 0.1;

/** Umbral de reducción de texto respecto al ejercicio anterior (50 %). */
export const UMBRAL_REDUCCION_TEXTO_APARTADO = 0.5;

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

    const lenActual = normalizarTextoApartado(current.contenido).length;
    const lenAnterior = normalizarTextoApartado(prior.contenido).length;
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
