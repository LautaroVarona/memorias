import type { TablaMemoria } from "@/types/domain";
import type { DocumentoOrigen, TrackingValue } from "@/types/tracking";
import { trackingValue } from "@/types/tracking";

export interface CeldaMemoriaContext {
  tabla: TablaMemoria;
  filaEtiqueta: string;
  columnaIdx: number;
  celdaRaw: string;
  documento: DocumentoOrigen;
  ejercicio?: number;
}

function etiquetaColumna(tabla: TablaMemoria, columnaIdx: number, ejercicio?: number): string {
  const cabecera = (tabla.cabecera[columnaIdx] ?? "").trim();
  if (/^20\d{2}$/.test(cabecera)) return cabecera;
  if (cabecera) return cabecera;
  if (columnaIdx === 1 && ejercicio !== undefined) return String(ejercicio);
  if (columnaIdx === 2 && ejercicio !== undefined) return String(ejercicio - 1);
  return columnaIdx === 1 ? "ejercicio actual" : "ejercicio anterior";
}

export function ubicacionMemoriaTabla(ctx: CeldaMemoriaContext): string {
  const apartado = ctx.tabla.apartado
    ? `Apartado ${ctx.tabla.apartado.padStart(2, "0")}`
    : "Apartado desconocido";
  const pagina = ctx.tabla.pagina !== undefined ? ` / Pág. ${ctx.tabla.pagina}` : "";
  const fila = ctx.tabla.linea !== undefined ? ` / Línea tabla: ${ctx.tabla.linea}` : "";
  const columna = etiquetaColumna(ctx.tabla, ctx.columnaIdx, ctx.ejercicio);
  return `${apartado}${pagina}${fila} / Fila: '${ctx.filaEtiqueta}' / Columna: ${columna}`;
}

/** Convierte una celda de tabla de memoria en TrackingValue numérico */
export function celdaMemoriaATracking(
  valor: number,
  ctx: CeldaMemoriaContext
): TrackingValue<number> {
  return trackingValue(
    valor,
    ctx.documento,
    ubicacionMemoriaTabla(ctx),
    ctx.celdaRaw.trim() || undefined
  );
}
