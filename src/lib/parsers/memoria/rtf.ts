/**
 * Extractor de texto RTF sin dependencias.
 *
 * Las memorias del despacho llegan como .DOC que en realidad son RTF
 * (generadas por A3SOC). Convierte el cuerpo a texto plano preservando
 * párrafos (\par) y tablas (\cell / \row se convierten en filas con "|").
 */

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

export function extraerTextoRtf(buffer: Buffer): string {
  const s = buffer.toString("latin1");
  let out = "";
  let i = 0;
  let depth = 0;
  let skipUntil = -1;

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
        out += String.fromCharCode(parseInt(s.substr(i + 2, 2), 16));
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
        } else if (word === "par" || word === "line") {
          out += "\n";
        } else if (word === "tab") {
          out += "\t";
        } else if (word === "cell" || word === "nestcell") {
          out += " | ";
        } else if (word === "row" || word === "nestrow") {
          out += "\n";
        } else if (word === "u" && m[2]) {
          const code = parseInt(m[2], 10);
          out += String.fromCharCode(code < 0 ? code + 65536 : code);
        }
        i += m[0].length;
        continue;
      }

      // Carácter escapado: \{ \} \\
      out += s[i + 1] ?? "";
      i += 2;
      continue;
    }

    // Los saltos de línea del fichero RTF no son saltos reales
    if (c === "\n" || c === "\r") {
      i++;
      continue;
    }

    out += c;
    i++;
  }

  return out
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}
