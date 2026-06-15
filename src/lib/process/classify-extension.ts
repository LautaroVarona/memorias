import type { TipoArchivo } from "@/types/domain";

export function getExtension(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i).toLowerCase() : "";
}

/** Clasificación rápida por extensión — sin parsers pesados (se refinan al procesar). */
export function classifyByExtension(fileName: string): TipoArchivo {
  const ext = getExtension(fileName);
  if ([".doc", ".docx", ".rtf"].includes(ext)) return "memoria_word";
  if (ext === ".pdf") return "memoria_pdf";
  if (ext === ".xlsm") return "excel_cierre";
  if ([".xlsx", ".xls"].includes(ext)) return "excel_balance";
  throw new Error(`Tipo de archivo no soportado: ${ext || fileName}`);
}
