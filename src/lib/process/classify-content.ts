import { classifyExcelFile } from "@/lib/parsers/excel/parser";
import { detectarFormatoMemoria } from "@/lib/parsers/memoria/parser";
import type { TipoArchivo } from "@/types/domain";
import { getExtension } from "@/lib/process/classify-extension";

export async function classifyUploadedFile(
  buffer: Buffer,
  fileName: string
): Promise<TipoArchivo> {
  const ext = getExtension(fileName);

  if ([".doc", ".docx", ".rtf"].includes(ext)) {
    const formato = detectarFormatoMemoria(buffer);
    if (formato === "pdf") return "memoria_pdf";
    if (formato === null) throw new Error(`No se reconoce el formato del documento: ${fileName}`);
    return "memoria_word";
  }
  if (ext === ".pdf") return "memoria_pdf";
  if ([".xlsx", ".xls", ".xlsm"].includes(ext)) {
    return classifyExcelFile(buffer, fileName);
  }
  throw new Error(`Tipo de archivo no soportado: ${ext}`);
}
