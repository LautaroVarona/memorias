/**
 * Extractor de texto RTF sin dependencias.
 *
 * Las memorias del despacho llegan como .DOC que en realidad son RTF
 * (generadas por A3SOC). Convierte el cuerpo a texto plano preservando
 * párrafos (\par) y tablas (\cell / \row se convierten en filas con "|").
 */

/** Propiedades de fila/celda RTF: no aportan texto visible. */
const RTF_TABLE_LAYOUT_KEYWORDS = new Set([
  "trowd",
  "irow",
  "irowband",
  "row",
  "nestrow",
  "cell",
  "nestcell",
  "cellx",
  "clvertalt",
  "clvertalc",
  "clvertalb",
  "clmgf",
  "clmrg",
  "clFitText",
  "clNoWrap",
  "clbrdrt",
  "clbrdrl",
  "clbrdrb",
  "clbrdrr",
  "trgaph",
  "trleft",
  "trqc",
  "trql",
  "trqr",
  "trrh",
  "trhdr",
  "trkeep",
  "trkeepfollow",
  "trpaddl",
  "trpaddr",
  "trpaddfl",
  "trpaddfr",
  "trpaddft",
  "trpaddfb",
  "intbl",
  "itap",
  "lastrow",
]);

const DESTINATIONS_TO_SKIP = new Set([
  "fonttbl",
  "colortbl",
  "stylesheet",
  "info",
  "listtable",
  "listoverridetable",
  "pgptbl",
  "rsidtbl",
  "themedata",
  "colorschememapping",
  "latentstyles",
  "datastore",
  "generator",
  "xmlnstbl",
  // Los encabezados se conservan: contienen la portada ("MEMORIA ABREVIADA 2024").
  // Los pies se descartan (numeración de página).
  "footer",
  "footerr",
  "footerl",
  "footerf",
  "ftnsep",
  "ftnsepc",
  "aftnsep",
  "aftnsepc",
  "fldinst",
  "pict",
  "object",
  "pnseclvl1",
  "pnseclvl2",
  "pnseclvl3",
  "pnseclvl4",
  "pnseclvl5",
  "pnseclvl6",
  "pnseclvl7",
  "pnseclvl8",
  "pnseclvl9",
]);

export function esRtf(buffer: Buffer): boolean {
  return buffer.length > 5 && buffer.slice(0, 5).toString("latin1") === "{\\rtf";
}

export interface RtfTablaExtraida {
  filas: string[][];
}

/**
 * Reconstruye tablas RTF detectando explícitamente \\trowd, \\cell y \\row.
 * Complementa el volcado textual para tablas con celdas en líneas separadas.
 */
export function extraerTablasRtf(buffer: Buffer): RtfTablaExtraida[] {
  const s = buffer.toString("latin1");
  const tablas: RtfTablaExtraida[] = [];
  let filaActual: string[] = [];
  let celdaActual = "";
  let i = 0;
  let depth = 0;
  let skipUntil = -1;
  let enDefinicionFila = false;

  const flushCelda = () => {
    filaActual.push(celdaActual.replace(/\s+/g, " ").trim());
    celdaActual = "";
  };

  const flushFila = () => {
    if (filaActual.some((c) => c.length > 0)) {
      if (tablas.length === 0 || tablas[tablas.length - 1].filas.length > 0) {
        // Agrupa filas consecutivas en una misma tabla lógica
        if (tablas.length === 0) tablas.push({ filas: [] });
      }
      tablas[tablas.length - 1].filas.push([...filaActual]);
    }
    filaActual = [];
    celdaActual = "";
    enDefinicionFila = false;
  };

  while (i < s.length) {
    const c = s[i];

    if (c === "{") {
      depth++;
      i++;
      continue;
    }
    if (c === "}") {
      if (skipUntil === depth) skipUntil = -1;
      depth--;
      i++;
      continue;
    }
    if (skipUntil !== -1 && depth >= skipUntil) {
      i++;
      continue;
    }

    if (c === "\\") {
      const next = s[i + 1];

      if (next === "'") {
        celdaActual += String.fromCharCode(parseInt(s.substr(i + 2, 2), 16));
        i += 4;
        continue;
      }

      if (next === "*") {
        const m = /^\\\*\\([a-zA-Z]+)/.exec(s.slice(i));
        if (m) {
          skipUntil = depth;
          i += m[0].length;
          continue;
        }
      }

      const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(s.slice(i));
      if (m) {
        const word = m[1];
        if (DESTINATIONS_TO_SKIP.has(word)) {
          skipUntil = depth;
        } else if (word === "trowd") {
          enDefinicionFila = true;
        } else if (word === "intbl" || word === "pard") {
          enDefinicionFila = false;
        } else if (word === "cell" || word === "nestcell") {
          flushCelda();
        } else if (word === "row" || word === "nestrow") {
          flushFila();
        } else if (word === "par" || word === "line") {
          if (!enDefinicionFila) celdaActual += " ";
        } else if (word === "tab") {
          if (!enDefinicionFila) celdaActual += "\t";
        } else if (word === "u" && m[2]) {
          const code = parseInt(m[2], 10);
          celdaActual += String.fromCharCode(code < 0 ? code + 65536 : code);
        } else if (!RTF_TABLE_LAYOUT_KEYWORDS.has(word) && !enDefinicionFila) {
          // Palabras desconocidas dentro de \\trowd no generan texto
        }
        i += m[0].length;
        continue;
      }

      if (!enDefinicionFila) celdaActual += s[i + 1] ?? "";
      i += 2;
      continue;
    }

    if (c === "\n" || c === "\r") {
      i++;
      continue;
    }

    if (!enDefinicionFila) celdaActual += c;
    i++;
  }

  flushFila();
  return tablas.filter((t) => t.filas.length > 0);
}

/** Convierte filas de tabla a líneas con separador " | " (formato unificado del parser). */
export function tablasRtfATexto(tablas: RtfTablaExtraida[]): string {
  return tablas
    .map((tabla) => tabla.filas.map((fila) => fila.filter((c) => c.length > 0).join(" | ")).join("\n"))
    .filter(Boolean)
    .join("\n\n");
}

export function extraerTextoRtf(buffer: Buffer): string {
  const s = buffer.toString("latin1");
  let out = "";
  let i = 0;
  let depth = 0;
  let skipUntil = -1;
  let enDefinicionFila = false;

  while (i < s.length) {
    const c = s[i];

    if (c === "{") {
      depth++;
      i++;
      continue;
    }
    if (c === "}") {
      if (skipUntil === depth) skipUntil = -1;
      depth--;
      i++;
      continue;
    }
    if (skipUntil !== -1 && depth >= skipUntil) {
      i++;
      continue;
    }

    if (c === "\\") {
      const next = s[i + 1];

      // Carácter codificado en hex: \'xx (cp1252)
      if (next === "'") {
        if (!enDefinicionFila) {
          out += String.fromCharCode(parseInt(s.substr(i + 2, 2), 16));
        }
        i += 4;
        continue;
      }

      // Destino opcional \*\keyword → saltar el grupo completo
      if (next === "*") {
        const m = /^\\\*\\([a-zA-Z]+)/.exec(s.slice(i));
        if (m) {
          skipUntil = depth;
          i += m[0].length;
          continue;
        }
      }

      const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(s.slice(i));
      if (m) {
        const word = m[1];
        if (DESTINATIONS_TO_SKIP.has(word)) {
          skipUntil = depth;
        } else if (word === "trowd") {
          enDefinicionFila = true;
        } else if (word === "intbl" || word === "pard") {
          enDefinicionFila = false;
        } else if (word === "row" || word === "nestrow") {
          enDefinicionFila = false;
          out += "\n";
        } else if (word === "cell" || word === "nestcell") {
          enDefinicionFila = false;
          out += " | ";
        } else if (word === "par" || word === "line") {
          if (!enDefinicionFila) out += "\n";
        } else if (word === "tab") {
          if (!enDefinicionFila) out += "\t";
        } else if (word === "u" && m[2]) {
          if (!enDefinicionFila) {
            const code = parseInt(m[2], 10);
            out += String.fromCharCode(code < 0 ? code + 65536 : code);
          }
        } else if (!RTF_TABLE_LAYOUT_KEYWORDS.has(word) && !enDefinicionFila) {
          // Ignorar propiedades de celda/fila; el texto visible se emite fuera de \\trowd
        }
        i += m[0].length;
        continue;
      }

      // Carácter escapado: \{ \} \\
      if (!enDefinicionFila) out += s[i + 1] ?? "";
      i += 2;
      continue;
    }

    // Los saltos de línea del fichero RTF no son saltos reales
    if (c === "\n" || c === "\r") {
      i++;
      continue;
    }

    if (!enDefinicionFila) {
      out += c;
    }
    i++;
  }

  return out
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}
