/**
 * Agrupa líneas sueltas (volcado Word/RTF) en unidades lógicas de párrafo o ítem
 * de lista, evitando comparar saltos de línea de maquetación como rupturas.
 */

const PATRON_ITEM_LISTA = /^(?:[a-z]\)|-\s|•\s|–\s|—\s)/i;
const PATRON_APARTADO = /^\d{2}\s+[A-ZÁÉÍÓÚÑ]/;
const PATRON_TITULO_SECCION =
  /^(?:identificaci[oó]n|actividad\s+de\s+la\s+empresa|objeto\s+social|pertenece\s+a\s+un\s+grupo|normas\s+de|pol[ií]tica|criterios|riesgo|nota\s+\d|en todo caso)/i;

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
  if (esTituloCorto(t)) return true;
  return false;
}

/** Encabezados breves tipo "Imagen fiel", "Disposiciones legales". */
function esTituloCorto(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 56) return false;
  if (/[.;:]$/.test(t)) return false;
  if (/\b20\d{2}\b/.test(t)) return false;
  const palabras = t.split(/\s+/);
  if (palabras.length > 6) return false;
  return /^[A-ZÁÉÍÓÚÑ]/.test(t);
}

function prefijoListaIncompleto(text: string): boolean {
  const t = text.trim();
  if (/^[a-z]\)$/i.test(t)) return true;
  if (t.endsWith(":") && t.length < 48) return true;
  // "a) Activos financieros" sin dos puntos: la línea siguiente suele ser ": - ítem"
  if (/^[a-z]\)\s+\S/i.test(t) && !/:\s*$/.test(t)) return true;
  return false;
}

/** Línea huérfana de maquetación Word: ": - ítem" o ": ítem" tras un subtítulo. */
function lineaEsPrefijoColonLista(line: string): boolean {
  return /^:\s*([-–—]\s*)?\S/.test(line.trim());
}

function encabezadoSubseccionLista(text: string): boolean {
  return /^[a-z]\)\s+\S/i.test(text.trim()) && !text.trim().endsWith(":");
}

function lineaEsContinuacionForzada(anterior: string): boolean {
  if (prefijoListaIncompleto(anterior)) return true;
  if (/^[a-z]\)\s/i.test(anterior.trim()) && anterior.trim().length <= 4) return true;
  if (encabezadoSubseccionLista(anterior)) return true;
  return false;
}

function lineaEsNuevoParrafoProsa(anterior: string, line: string): boolean {
  const p = anterior.trim();
  const t = line.trim();
  if (t.length < 36 || !/^[A-ZÁÉÍÓÚÑ]/.test(t)) return false;
  if (PATRON_ITEM_LISTA.test(t) || /^[a-z]\)\s/i.test(t)) return false;
  if (/[.!?]$/.test(p)) return true;
  return t.length >= 72;
}

function lineaEsContinuacion(anterior: string, line: string): boolean {
  const p = anterior.trim();
  const t = line.trim();
  if (!p || !t) return false;
  if (lineaEsNuevoParrafoProsa(p, t)) return false;
  if (prefijoListaIncompleto(p)) return true;
  if (encabezadoSubseccionLista(p) && lineaEsPrefijoColonLista(t)) return true;
  // Un encabezado de sección (p. ej. "Identificación") no se fusiona con el párrafo siguiente.
  if (lineaIniciaUnidad(p) && !prefijoListaIncompleto(p)) return false;
  if (lineaIniciaUnidad(t) && !lineaEsContinuacionForzada(p)) return false;
  if (p.endsWith("-")) return true;
  if (!/[.!?:;]$/.test(p)) {
    if (/^[a-záéíóúñ(,]/.test(t) && t.length < 120) return true;
    if (t.length <= 48 && !/^[A-ZÁÉÍÓÚÑ]/.test(t)) return true;
    return false;
  }
  if (/^[a-záéíóúñ(,]/.test(t) && t.length < 120) return true;
  if (t.length <= 40 && /^[a-záéíóúñ]/.test(t) && /[.,]$/.test(t)) return true;
  return false;
}

function unirLineas(anterior: string, line: string): string {
  const p = anterior.trim();
  const t = line.trim();
  if (p.endsWith("-")) return p.slice(0, -1) + t;
  if (lineaEsPrefijoColonLista(t)) {
    return `${p.replace(/:?\s*$/, "")}: ${t.replace(/^:\s*/, "")}`;
  }
  return `${p} ${t}`;
}

/**
 * Word parte a veces "a) Título" y ": - ítem" en líneas distintas; otras veces en una sola.
 * Une esas líneas antes de agrupar párrafos.
 */
export function normalizarLineasVolcado(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (lineaEsPrefijoColonLista(line) && out.length > 0) {
      const prev = out[out.length - 1]!;
      if (
        encabezadoSubseccionLista(prev) ||
        prefijoListaIncompleto(prev) ||
        /^[a-z]\)\s/i.test(prev)
      ) {
        out[out.length - 1] = unirLineas(prev, line);
        continue;
      }
    }
    out.push(line);
  }
  return out;
}

export function agruparLineasEnParrafos(lines: string[]): string[] {
  const blocks: string[] = [];
  let buf = "";
  const fuente = normalizarLineasVolcado(lines);

  for (const raw of fuente) {
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

function asegurarPrefijoGuion(texto: string): string {
  const t = texto.trim();
  if (/^[-–—]\s/.test(t)) return t.replace(/^[-–—]/, "-");
  return `- ${t}`;
}

function esEncabezadoConDosPuntos(texto: string): boolean {
  const t = texto.trim();
  return /^(?:[a-z]\)\s*)?[^:]+:\s*$/.test(t) && !/^[-–—]/.test(t);
}

function esIntroProsaSubseccion(texto: string): boolean {
  const t = texto.trim().replace(/^[-–—]\s*/, "");
  if (t.length < 40) return false;
  return /^(?:son|se |la |los |las |el |en |para |cuando|calificaci|durante|asimismo)/i.test(t);
}

/**
 * Descompone cualquier bloque en unidades atómicas comparables:
 * encabezado a)/b)/c), viñetas - y párrafos sueltos.
 */
export function explotarBloqueUniforme(block: string): string[] {
  const t = block
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/[\u2212\u2013\u2014]/g, "-");
  if (!t) return [];

  if (t.includes("\n")) {
    return agruparLineasEnParrafos(t.split("\n").map((l) => l.trim()).filter(Boolean)).flatMap(
      (p) => explotarBloqueUniforme(p)
    );
  }

  const secciones = t
    .split(/(?=(?:^|\s)[a-z]\)\s+[A-ZÁÉÍÓÚÑ])/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const fuente = secciones.length > 1 ? secciones : [t];

  const out: string[] = [];
  for (const sec of fuente) {
    const colonGuion = sec.match(/^((?:[a-z]\)\s*)?[^:]+:\s*)\s*-\s+([\s\S]+)$/i);
    if (colonGuion) {
      out.push(colonGuion[1].trim());
      const resto = colonGuion[2].trim();
      if (esIntroProsaSubseccion(resto)) {
        out.push(resto.replace(/^[-–—]\s*/, ""));
        continue;
      }
      const viñetas = resto
        .split(/(?=\s+-\s+)/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (viñetas.length > 1) {
        out.push(...viñetas.map(asegurarPrefijoGuion));
      } else {
        out.push(asegurarPrefijoGuion(resto));
      }
      continue;
    }

    const viñetas = sec
      .split(/(?=(?:^|\s)-\s+)/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (viñetas.length > 1) {
      if (!/^-\s/.test(viñetas[0]) && esEncabezadoConDosPuntos(viñetas[0])) {
        out.push(viñetas[0]);
        out.push(...viñetas.slice(1).map(asegurarPrefijoGuion));
      } else if (!/^-\s/.test(viñetas[0]) && /:\s*$/.test(viñetas[0])) {
        out.push(viñetas[0]);
        out.push(...viñetas.slice(1).map(asegurarPrefijoGuion));
      } else {
        out.push(...viñetas.map(asegurarPrefijoGuion));
      }
      continue;
    }

    if (esEncabezadoConDosPuntos(sec)) {
      out.push(sec);
      continue;
    }

    out.push(sec.startsWith("-") ? asegurarPrefijoGuion(sec) : sec);
  }

  return out.filter(Boolean);
}

/** Separa ítems a) b) c), viñetas y párrafos pegados en un mismo bloque. */
export function desglosarItemsLista(block: string): string[] {
  return explotarBloqueUniforme(block);
}

/** Encabezado de subsección tipo "a) Activos financieros:" (sin viñeta). */
export function esEncabezadoSubseccionLista(text: string): boolean {
  const s = text.trim();
  if (s.length >= 90 || /^[-–—]/.test(s)) return false;
  if (/^:\s*[-–—]/.test(s)) return false;
  if (/:\s*$/.test(s)) return true;
  // "a) Activos financieros" sin dos puntos (Word partió antes de ": -")
  return /^[a-z]\)\s+\S/i.test(s) && !/[-–—]/.test(s);
}

/** Etiqueta canónica de un encabezado (ignora prefijo a) y dos puntos finales). */
export function etiquetaEncabezadoSubseccion(text: string): string {
  return text
    .trim()
    .replace(/^[a-z]\)\s*/i, "")
    .replace(/:+\s*$/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fusiona bloques ": - ítem" huérfanos con el encabezado anterior. */
function fusionarPrefijosColonHuérfanos(blocks: string[]): string[] {
  const result: string[] = [];
  for (const b of blocks) {
    const t = b.trim();
    if (lineaEsPrefijoColonLista(t) && result.length > 0) {
      result[result.length - 1] = unirLineas(result[result.length - 1]!, t);
      continue;
    }
    result.push(t);
  }
  return result;
}

/** Descompone bloques en ítems homogéneos para alinear memorias con distinta maquetación. */
export function normalizarBloquesComparacion(blocks: string[]): string[] {
  const desglosados = blocks.flatMap((b) => explotarBloqueUniforme(b));
  return fusionarPrefijosColonHuérfanos(desglosados);
}

/** Clave semántica estable para emparejar bloques entre memorias con distinta maquetación. */
export function claveSemanticaBloque(block: string): string {
  const t = block.trim();
  if (!t) return "";

  if (esEncabezadoSubseccionLista(t) || esEncabezadoConDosPuntos(t)) {
    return `h:${etiquetaEncabezadoSubseccion(t)}`;
  }

  const sinGuion = t.replace(/^[-–—]\s*/, "").trim();
  if (/^[-–—]/.test(t)) {
    return `b:${normalizarClaveTexto(sinGuion)}`;
  }

  return `p:${normalizarClaveTexto(t)}`;
}

function normalizarClaveTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function lineasDeTexto(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.includes("|"));
}
