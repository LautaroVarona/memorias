/** Documento de origen de un dato extraído en el motor de reglas */
export type DocumentoOrigen = "excel" | "memoria_actual" | "memoria_anterior";

/** Metadatos de procedencia de un valor numérico o textual extraído */
export interface DataOrigen {
  documento: DocumentoOrigen;
  /** Ej: "Hoja: SYS_4_3_Digitos / Cuenta: 113 (Sumatorio)" o "Apartado 03 / Fila: 'A reservas voluntarias' / Columna: 2025" */
  ubicacion: string;
  /** Contenido original de la celda antes de limpiar y parsear */
  detalleRaw?: string;
}

/** Valor extraído con trazabilidad nativa hacia su fuente */
export interface TrackingValue<T = number> {
  valor: T;
  origen: DataOrigen;
}

export function isTrackingValue<T>(v: unknown): v is TrackingValue<T> {
  return (
    typeof v === "object" &&
    v !== null &&
    "valor" in v &&
    "origen" in v &&
    typeof (v as TrackingValue<T>).origen?.ubicacion === "string"
  );
}

/** Obtiene el valor plano de un número o TrackingValue */
export function unwrapValue<T>(v: T | TrackingValue<T> | undefined): T | undefined {
  if (v === undefined) return undefined;
  if (isTrackingValue<T>(v)) return v.valor;
  return v;
}

/** Construye un TrackingValue de forma explícita */
export function trackingValue<T>(
  valor: T,
  documento: DocumentoOrigen,
  ubicacion: string,
  detalleRaw?: string
): TrackingValue<T> {
  return { valor, origen: { documento, ubicacion, detalleRaw } };
}

/** Tipo de evidencia UI derivado del documento de origen */
export function origenToEvidenceType(
  documento: DocumentoOrigen
): "excel" | "memory" {
  return documento === "excel" ? "excel" : "memory";
}
