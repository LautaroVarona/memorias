import mammoth from "mammoth";
import type { MemoriaNormalizada } from "@/types/domain";
import {
  analizarFormal,
  contarPaginasPdf,
  extraerApartados,
  extraerApartadosDesdeBloques,
  extraerAniosMencionados,
  extraerCifras,
  extraerDatosClave,
  extraerStatements,
  extraerTablas,
  extraerTablasDesdeBloques,
} from "./extractors";
import { esRtf, extraerBloquesRtf, extraerTextoRtf } from "./rtf";
import type { MemoriaBloque } from "@/types/domain";

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

/** Separador de celda en tablas Word binarias (A3SOC): tab o BEL \\u0007. */
const SEPARADOR_CELDA_TABULAR = /[\t\u0007]+/;

function limpiarCeldaTabular(celda: string): string {
  return celda.replace(/[\u0000-\u0006\u0008-\u001F\u007F]/g, "").trim();
}

function filaTabularDesdeSegmento(segmento: string): string {
  return segmento
    .split(/[\t\u0007]+/)
    .map(limpiarCeldaTabular)
    .filter((c) => c.length > 0)
    .join(" | ");
}

/**
 * Word binario (A3SOC) concatena varias filas de una misma tabla en una línea,
 * separadas por tabuladores dobles (celda vacía entre filas). Las reconstruye.
 */
function reconstruirFilasTabulares(texto: string): string {
  return texto
    .split("\n")
    .flatMap((line) => {
      if (!SEPARADOR_CELDA_TABULAR.test(line)) return [line.trimEnd()];

      if (/\t{2,}/.test(line) || /\u0007{2,}/.test(line)) {
        const filas = line
          .split(/\t{2,}|\u0007{2,}/)
          .map(filaTabularDesdeSegmento)
          .filter((f) => f.replace(/\s\|\s/g, "").trim().length > 0);
        if (filas.length > 1) return filas;
      }

      return [filaTabularDesdeSegmento(line)];
    })
    .join("\n");
}

/**
 * Normaliza el texto extraído: las tablas de word-extractor usan tabuladores
 * o el carácter de control \\u0007 (BEL) como separador de celda; las
 * convertimos al formato "a | b | c" que produce el extractor RTF, para que
 * los extractores trabajen sobre un único formato.
 */
function normalizarTexto(texto: string): string {
  return reconstruirFilasTabulares(texto)
    .split("\n")
    .map((line) => {
      if (!SEPARADOR_CELDA_TABULAR.test(line)) return line.trimEnd();
      return line
        .split(SEPARADOR_CELDA_TABULAR)
        .map(limpiarCeldaTabular)
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
  const bloquesDocumento: MemoriaBloque[] =
    formato === "rtf"
      ? extraerBloquesRtf(buffer).map((b) =>
          b.type === "text"
            ? { type: "text", content: normalizarTexto(b.content) }
            : {
                type: "table",
                content: b.content.map((fila) => fila.map((celda) => limpiarCeldaTabular(celda))),
              }
        )
      : [{ type: "text", content: texto }];

  const apartados = bloquesDocumento.length > 0 ? extraerApartadosDesdeBloques(bloquesDocumento) : extraerApartados(texto);
  const tablas =
    bloquesDocumento.length > 0 ? extraerTablasDesdeBloques(bloquesDocumento, texto) : extraerTablas(texto);
  const cifras = extraerCifras(texto);
  const statements = extraerStatements(texto);
  const formal = analizarFormal(texto);
  const datosClave = extraerDatosClave(texto, fileName);
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
