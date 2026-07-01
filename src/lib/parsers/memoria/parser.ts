import mammoth from "mammoth";
import type { MemoriaNormalizada } from "@/types/domain";
import {
  analizarFormal,
  contarPaginasPdf,
  crearBloqueTabla,
  deduplicarVariantesAnualesTexto,
  detectarAnioPortada,
  ejercicioDesdeNombreArchivo,
  extraerApartadosDesdeBloques,
  extraerAniosMencionados,
  extraerCifras,
  extraerDatosClave,
  extraerStatements,
  extraerTablasDesdeBloques,
  segmentarBloquesDeTexto,
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

/** Separa celdas tabulares respetando celdas vacías (cada \\t o \\u0007 es un límite). */
function splitCeldasTabulares(segmento: string): string[] {
  const cells: string[] = [];
  let buf = "";
  for (let i = 0; i < segmento.length; i++) {
    const c = segmento[i];
    if (c === "\t" || c === "\u0007") {
      cells.push(limpiarCeldaTabular(buf));
      buf = "";
    } else {
      buf += c;
    }
  }
  if (buf.length > 0) cells.push(limpiarCeldaTabular(buf));
  return cells;
}

function filaTabularDesdeSegmento(segmento: string): string {
  return splitCeldasTabulares(segmento).join(" | ");
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
      return splitCeldasTabulares(line).join(" | ").trimEnd();
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
      const partes: string[] = [];

      const cabeceras = doc.getHeaders({ includeFooters: false })?.trim();
      if (cabeceras) partes.push(cabeceras);

      // A3SOC suele poner portada y párrafos clave en cuadros de texto no incluidos en getBody().
      const docExtendido = doc as {
        getTextboxes?: (opts?: {
          includeHeadersAndFooters?: boolean;
          includeBody?: boolean;
        }) => string;
        getFooters?: () => string;
      };
      if (docExtendido.getTextboxes) {
        const cajas = docExtendido
          .getTextboxes({ includeHeadersAndFooters: false, includeBody: true })
          ?.trim();
        if (cajas) partes.push(cajas);
      }

      const cuerpo = doc.getBody()?.trim();
      if (cuerpo) partes.push(cuerpo);

      if (docExtendido.getFooters) {
        const pies = docExtendido.getFooters()?.trim();
        if (pies) partes.push(pies);
      }

      const texto = partes.join("\n\n");
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
  tipo: "memoria_word" | "memoria_pdf",
  ejercicioActual?: number
): Promise<MemoriaNormalizada> {
  const formato = detectarFormatoMemoria(buffer) ?? (tipo === "memoria_pdf" ? "pdf" : "docx");
  const { texto: bruto, paginas } = await extraerTexto(buffer, formato);
  const brutoNormalizado = normalizarTexto(bruto);

  const ejercicioPreliminar =
    ejercicioActual ??
    ejercicioDesdeNombreArchivo(fileName) ??
    detectarAnioPortada(brutoNormalizado);

  const texto = deduplicarVariantesAnualesTexto(brutoNormalizado, ejercicioPreliminar);

  // Flujo de bloques inline (texto/tabla) en orden de aparición:
  //  - RTF (A3SOC): se reconstruye desde los controles \\trowd/\\cell/\\row/\\lastrow.
  //  - resto: se segmenta el texto normalizado (celdas " | "), separando tablas anuales.
  const bloquesDocumento: MemoriaBloque[] =
    formato === "rtf"
      ? extraerBloquesRtf(buffer).map((b) =>
          b.type === "text"
            ? { type: "text", content: normalizarTexto(b.content) }
            : crearBloqueTabla(b.content.map((fila) => fila.map((celda) => limpiarCeldaTabular(celda))))
        )
      : segmentarBloquesDeTexto(texto);

  const apartados = extraerApartadosDesdeBloques(bloquesDocumento);

  // Anclaje temporal: ejercicio explícito > nombre archivo > detección en contenido
  const datosClave = extraerDatosClave(texto, fileName, ejercicioActual);
  const ejercicioAncla = ejercicioActual ?? datosClave.ejercicio;

  const tablas = extraerTablasDesdeBloques(bloquesDocumento, texto, ejercicioAncla);
  const cifras = extraerCifras(texto);
  const statements = extraerStatements(texto);
  const formal = analizarFormal(texto);
  const anios = extraerAniosMencionados(texto, ejercicioAncla);

  const erroresParseo = tablas
    .filter((t) => t.tabla_rota && t.errorParseo)
    .map((t) => {
      const ref = t.apartado ? `Apartado ${t.apartado}` : t.titulo?.slice(0, 60) || "Tabla";
      return `${ref}: ${t.errorParseo}`;
    });

  return {
    apartados,
    tablas,
    statements,
    cifras,
    formal,
    datosClave,
    anios,
    textoCompleto: texto,
    metadata: {
      paginas,
      archivo: fileName,
      formato,
      ...(erroresParseo.length > 0 ? { erroresParseo } : {}),
    },
  };
}
