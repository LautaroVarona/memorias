/**
 * Agrupa líneas sueltas (volcado Word/RTF) en unidades lógicas de párrafo o ítem
 * de lista, evitando comparar saltos de línea de maquetación como rupturas.
 */

const PATRON_ITEM_LISTA = /^(?:[a-z]\)|-\s|•\s|–\s|—\s)/i;
const PATRON_APARTADO = /^\d{2}\s+[A-ZÁÉÍÓÚÑ]/;
const PATRON_TITULO_SECCION =
  /^(?:identificaci[oó]n|objeto\s+social|normas\s+de|pol[ií]tica|criterios|riesgo|nota\s+\d)/i;

function lineaIniciaUnidad(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (PATRON_APARTADO.test(t)) return true;
  if (PATRON_ITEM_LISTA.test(t)) return true;
  if (PATRON_TITULO_SECCION.test(t)) return true;
  if (t.length <= 72 && /:$/.test(t) && !/\d/.test(t)) return true;
  if (t.length >= 8 && t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{4}/.test(t) && !/\d/.test(t)) {
    return true;
  }
  return false;
}

/** Prefijo de lista incompleto en la línea anterior (p. ej. solo "a)"). */
function prefijoListaIncompleto(text: string): boolean {
  const t = text.trim();
  return /^[a-z]\)$/i.test(t) || (t.endsWith(":") && t.length < 48);
}

function lineaEsContinuacion(anterior: string, line: string): boolean {
  const p = anterior.trim();
  const t = line.trim();
  if (!p || !t) return false;
  if (prefijoListaIncompleto(p)) return true;

  if (lineaIniciaUnidad(t) && !lineaEsContinuacionForzada(p, t)) return false;

  if (p.endsWith("-")) return true;
  if (!/[.!?:;]$/.test(p)) return true;
  if (/^[a-záéíóúñ(,]/.test(t) && t.length < 120) return true;
  if (t.length <= 40 && /^[a-záéíóúñ]/.test(t) && /[.,]$/.test(t)) return true;

  return false;
}

/** "a)" seguido de texto en la línea siguiente siempre continúa. */
function lineaEsContinuacionForzada(anterior: string, line: string): boolean {
  if (prefijoListaIncompleto(anterior)) return true;
  if (/^[a-z]\)\s/i.test(anterior.trim()) && anterior.trim().length <= 4) return true;
  return false;
}

function unirLineas(anterior: string, line: string): string {
  const p = anterior.trim();
  const t = line.trim();
  if (p.endsWith("-")) return p.slice(0, -1) + t;
  return `${p} ${t}`;
}

/**
 * Convierte líneas físicas del extractor en bloques lógicos para diff interanual.
 */
export function agruparLineasEnParrafos(lines: string[]): string[] {
  const blocks: string[] = [];
  let buf = "";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (buf) {
        blocks.push(buf.trim());
        buf = "";
      }
      continue;
    }

    if (!buf) {
      buf = line;
      continue;
    }

    if (lineaEsContinuacion(buf, line)) {
      buf = unirLineas(buf, line);
    } else if (lineaIniciaUnidad(line)) {
      blocks.push(buf.trim());
      buf = line;
    } else {
      blocks.push(buf.trim());
      buf = line;
    }
  }

  if (buf) blocks.push(buf.trim());
  return blocks;
}

/** Extrae líneas no tabulares de un bloque de texto. */
export function lineasDeTexto(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.includes("|"));
}
