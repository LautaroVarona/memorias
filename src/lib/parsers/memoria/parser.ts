import mammoth from "mammoth";
import type { MemoriaNormalizada } from "@/types/domain";
import {
  analizarFormal,
  contarPaginasPdf,
  extraerApartados,
  extraerAniosMencionados,
  extraerCifras,
  extraerDatosClave,
  extraerStatements,
  extraerTablas,
} from "./extractors";
import { esRtf, extraerTextoRtf } from "./rtf";

export type FormatoMemoria = "rtf" | "doc_binario" | "docx" | "pdf";

async function loadPdfParse() {
  const mod = await import("pdf-parse");
  return mod.default || mod;
}

function esOle2(buffer: Buffer): boolean {
  return (
    buffer.length > 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  );
}

function esZip(buffer: Buffer): boolean {
  return buffer.length > 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function esPdf(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer.slice(0, 4).toString("latin1") === "%PDF";
}

/** Detecta el formato real del documento por contenido, no por extensión. */
export function detectarFormatoMemoria(buffer: Buffer): FormatoMemoria | null {
  if (esRtf(buffer)) return "rtf";
  if (esOle2(buffer)) return "doc_binario";
  if (esZip(buffer)) return "docx";
  if (esPdf(buffer)) return "pdf";
  return null;
}

/**
 * Normaliza el texto extraído: las tablas de word-extractor usan tabuladores
 * como separador de celda; las convertimos al formato "a | b | c" que produce
 * el extractor RTF, para que los extractores trabajen sobre un único formato.
 */
function normalizarTexto(texto: string): string {
  return texto
    .split("\n")
    .map((line) => {
      if (!line.includes("\t")) return line.trimEnd();
      return line
        .split("\t")
        .map((c) => c.trim())
        .join(" | ")
        .replace(/(\s\|\s)+$/, " |")
        .trimEnd();
    })
    .join("\n");
}

async function extraerTexto(buffer: Buffer, formato: FormatoMemoria): Promise<{ texto: string; paginas: number }> {
  switch (formato) {
    case "rtf": {
      const texto = extraerTextoRtf(buffer);
      return { texto, paginas: Math.max(1, Math.ceil(texto.length / 3000)) };
    }
    case "doc_binario": {
      const { default: WordExtractor } = await import("word-extractor");
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buffer);
      // Los encabezados contienen la portada ("MEMORIA ABREVIADA 2025")
      const cabeceras = doc.getHeaders({ includeFooters: false }) ?? "";
      const texto = [cabeceras.trim(), doc.getBody()].filter(Boolean).join("\n\n");
      return { texto, paginas: Math.max(1, Math.ceil(texto.length / 3000)) };
    }
    case "docx": {
      const result = await mammoth.extractRawText({ buffer });
      return { texto: result.value, paginas: Math.max(1, Math.ceil(result.value.length / 3000)) };
    }
    case "pdf": {
      const pdfParse = await loadPdfParse();
      const data = await pdfParse(buffer);
      const texto = data.text || "";
      return { texto, paginas: data.numpages || contarPaginasPdf(texto) };
    }
  }
}

export async function parseMemoria(
  buffer: Buffer,
  fileName: string,
  tipo: "memoria_word" | "memoria_pdf"
): Promise<MemoriaNormalizada> {
  const formato = detectarFormatoMemoria(buffer) ?? (tipo === "memoria_pdf" ? "pdf" : "docx");
  const { texto: bruto, paginas } = await extraerTexto(buffer, formato);
  const texto = normalizarTexto(bruto);

  const apartados = extraerApartados(texto);
  const tablas = extraerTablas(texto);
  const cifras = extraerCifras(texto);
  const statements = extraerStatements(texto);
  const formal = analizarFormal(texto);
  const datosClave = extraerDatosClave(texto);
  const anios = extraerAniosMencionados(texto);

  return {
    apartados,
    tablas,
    statements,
    cifras,
    formal,
    datosClave,
    anios,
    textoCompleto: texto,
    metadata: { paginas, archivo: fileName, formato },
  };
}
