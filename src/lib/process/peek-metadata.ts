import { readWorkbook } from "@/lib/parsers/excel/detector";
import { esLibroCierre, parseLibroCierre } from "@/lib/parsers/excel/cierre-despacho";
import { parseMemoria } from "@/lib/parsers/memoria/parser";
import type { TipoArchivo } from "@/types/domain";

export interface ArchivoMetadataPeek {
  cliente?: string;
  ejercicio?: number;
  formato?: string;
}

/** Extracción ligera de cliente/ejercicio al subir un archivo (sin ejecutar todas las reglas). */
export async function peekFileMetadata(
  buffer: Buffer,
  fileName: string,
  tipo: TipoArchivo
): Promise<ArchivoMetadataPeek> {
  try {
    if (tipo === "excel_cierre" || tipo.startsWith("excel")) {
      const workbook = readWorkbook(buffer);
      if (esLibroCierre(workbook)) {
        const { libro } = parseLibroCierre(workbook, fileName);
        return {
          cliente: libro.cliente,
          ejercicio: libro.ejercicio,
          formato: "libro_cierre",
        };
      }
    }

    if (tipo === "memoria_word" || tipo === "memoria_pdf") {
      const memoria = await parseMemoria(buffer, fileName, tipo);
      return {
        cliente: memoria.datosClave.denominacion,
        ejercicio: memoria.datosClave.ejercicio,
        formato: memoria.metadata.formato,
      };
    }
  } catch {
    // Si falla el peek, el procesamiento completo lo intentará de nuevo
  }
  return {};
}
