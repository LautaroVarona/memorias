import { parseImporte, tablaEsCualitativa } from "@/lib/parsers/memoria/extractors";
import type { TablaMemoria } from "@/types/domain";
import { normalizarTextoApartado, tituloApartadoSlug } from "./text-normalize";

export interface TablaDegradadaInteranual {
  clave: string;
  titulo: string;
  apartado?: string;
  celdasAnterior: number;
  celdasActual: number;
  vaciaActual: boolean;
  pagina?: number;
}

function celdaTieneContenido(celda: string): boolean {
  const t = celda.trim();
  if (!t) return false;
  if (/^[-—–]$/.test(t)) return false;
  return /\d/.test(t) || t.length >= 2;
}

/** Celda de importe con dato (cifra o valor numérico parseable). */
export function celdaImporteTieneValor(celda: string): boolean {
  const t = celda.trim();
  if (!t) return false;
  if (/^[-—–_=.\s]+$/.test(t)) return false;
  if (parseImporte(t) !== null) return true;
  return /\d/.test(t);
}

function celdaTieneTextoSignificativo(celda: string): boolean {
  const t = celda.trim();
  if (!t) return false;
  if (/^[-—–]$/.test(t)) return false;
  if (/^(n\/?a|no aplica|s\.?d\.?|sin datos)$/i.test(t)) return true;
  return t.length >= 2;
}

function columnasDatosRelevantes(cabecera: string[]): number[] {
  const importeCols: number[] = [];
  for (let i = 1; i < cabecera.length; i++) {
    if (/IMPORTE\s+20\d{2}/i.test(cabecera[i])) importeCols.push(i);
  }
  if (importeCols.length > 0) return [importeCols[importeCols.length - 1]];
  return cabecera.slice(1).map((_, idx) => idx + 1);
}

/** Cuenta celdas de datos con contenido en una tabla. */
export function contarCeldasConDatos(tabla: TablaMemoria): number {
  const { cabecera, filas: datos } = tabla;
  if (datos.length === 0) return 0;

  if (tablaEsCualitativa(cabecera, datos)) {
    return datos.reduce(
      (n, fila) => n + fila.filter((c) => celdaTieneTextoSignificativo(c)).length,
      0
    );
  }

  const cols = columnasDatosRelevantes(cabecera);
  return datos.reduce(
    (n, fila) => n + cols.filter((c) => celdaTieneContenido(fila[c] ?? "")).length,
    0
  );
}

function claveTabla(tabla: TablaMemoria): string {
  const titulo = tituloApartadoSlug(tabla.titulo || "sin titulo");
  const apartado = tabla.apartado?.replace(/\D/g, "").padStart(2, "0") ?? "";
  return `${apartado}|${titulo.slice(0, 80)}`;
}

/**
 * Tablas que tenían datos en N-1 pero están vacías o claramente incompletas en N.
 */
export function detectarTablasDegradadasInteranual(
  actuales: TablaMemoria[],
  anteriores: TablaMemoria[]
): TablaDegradadaInteranual[] {
  const priorMap = new Map<string, TablaMemoria>();
  for (const t of anteriores) {
    const k = claveTabla(t);
    if (!priorMap.has(k)) priorMap.set(k, t);
  }

  const degradadas: TablaDegradadaInteranual[] = [];

  for (const actual of actuales) {
    const k = claveTabla(actual);
    const anterior = priorMap.get(k);
    if (!anterior) continue;

    const celdasAnterior = contarCeldasConDatos(anterior);
    const celdasActual = contarCeldasConDatos(actual);

    if (celdasAnterior < 2) continue;

    const vaciaActual = actual.vacia || celdasActual === 0;
    const perdidaSustancial = celdasActual < celdasAnterior * 0.5;

    if (vaciaActual || perdidaSustancial) {
      degradadas.push({
        clave: k,
        titulo: actual.titulo || anterior.titulo,
        apartado: actual.apartado ?? anterior.apartado,
        celdasAnterior,
        celdasActual,
        vaciaActual,
        pagina: actual.pagina,
      });
    }
  }

  return degradadas;
}

export function tituloTablaLegible(t: TablaDegradadaInteranual): string {
  const base = normalizarTextoApartado(t.titulo);
  if (base.length > 0) return t.titulo.trim() || base;
  return t.apartado ? `Tabla del apartado ${t.apartado}` : "Tabla sin título";
}
