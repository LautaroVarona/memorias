import apartadosPGC from "../../../../data/pgc/apartados-memoria.json";
import reglasFiscales from "../../../../data/pgc/reglas-fiscales.json";
import type { MemoryStatement, StatementType } from "@/types/case-data";
import type {
  AnioMencionado,
  ApartadoMemoria,
  CifrasMemoria,
  DatosClaveMemoria,
  FormalMemoria,
  TablaMemoria,
} from "@/types/domain";

export function parseImporte(str: string): number | null {
  const match = str.match(/(-?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|-?\d+(?:,\d{1,2})?)/);
  if (!match) return null;
  const n = parseFloat(match[1].replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

export function extraerCifras(texto: string): CifrasMemoria {
  const cifras: CifrasMemoria = {};
  const patterns: [keyof CifrasMemoria, RegExp][] = [
    ["activoTotal", /activo\s+total[:\s]+([\d.,]+)/i],
    ["pasivoTotal", /pasivo\s+total[:\s]+([\d.,]+)/i],
    ["patrimonioNeto", /patrimonio\s+neto[:\s]+([\d.,]+)/i],
    ["resultadoEjercicio", /resultado\s+(?:del\s+)?ejercicio[:\s]+([\d.,\-]+)/i],
    ["impuestoSociedades", /impuesto\s+sobre\s+(?:sociedades|beneficios)[:\s]+([\d.,]+)/i],
    ["activosFinancieros", /activos?\s+financieros?[:\s]+([\d.,]+)/i],
    ["provisiones", /provisiones[:\s]+([\d.,]+)/i],
    ["reservas", /reservas[:\s]+([\d.,]+)/i],
  ];

  for (const [key, regex] of patterns) {
    const match = texto.match(regex);
    if (match) {
      const val = parseImporte(match[1]);
      if (val !== null) cifras[key] = val;
    }
  }

  return cifras;
}

function detectStatement(texto: string, keywords: string[]): { found: boolean; sourceText?: string } {
  const lower = texto.toLowerCase();
  for (const kw of keywords) {
    const idx = lower.indexOf(kw.toLowerCase());
    if (idx !== -1) {
      const start = Math.max(0, idx - 20);
      const end = Math.min(texto.length, idx + kw.length + 40);
      return { found: true, sourceText: texto.slice(start, end).trim() };
    }
  }
  return { found: false };
}

function detectExistence(texto: string, patterns: RegExp[]): { found: boolean; sourceText?: string } {
  for (const pattern of patterns) {
    const match = texto.match(pattern);
    if (match) {
      return { found: true, sourceText: match[0].slice(0, 120) };
    }
  }
  return { found: false };
}

export function extraerStatements(texto: string): MemoryStatement[] {
  const statements: MemoryStatement[] = [];

  const configs: { type: StatementType; keywords?: string[]; existence?: RegExp[] }[] = [
    { type: "vinculadas", keywords: reglasFiscales.keywordsVinculadas as string[] },
    { type: "riesgos", keywords: reglasFiscales.keywordsRiesgos as string[] },
    { type: "provisiones", keywords: reglasFiscales.keywordsProvisiones as string[] },
    { type: "criterios", keywords: reglasFiscales.keywordsCriterios as string[] },
    { type: "deuda", keywords: reglasFiscales.keywordsSinDeuda as string[] },
    {
      type: "actividad",
      existence: [
        /actividad\s+principal/i,
        /objeto\s+social/i,
        /cifra\s+de\s+negocios/i,
        /ingresos\s+de\s+explotación/i,
        /ventas\s+netas/i,
      ],
    },
    { type: "continuidad", keywords: reglasFiscales.keywordsContinuidad as string[] },
    { type: "cambios_contables", keywords: reglasFiscales.keywordsCambiosContables as string[] },
    {
      type: "bases_negativas",
      existence: (reglasFiscales.keywordsBasesNegativas as string[]).map(
        (k) => new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
      ),
    },
    {
      type: "incentivos_fiscales",
      existence: (reglasFiscales.keywordsIncentivosExistencia as string[]).map(
        (k) => new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
      ),
    },
  ];

  for (const cfg of configs) {
    if (cfg.keywords) {
      const { found, sourceText } = detectStatement(texto, cfg.keywords);
      if (found) statements.push({ type: cfg.type, value: true, sourceText });
    } else if (cfg.existence) {
      const { found, sourceText } = detectExistence(texto, cfg.existence);
      if (found) statements.push({ type: cfg.type, value: false, sourceText });
    }
  }

  return statements;
}

/**
 * Encabezado canónico de las memorias del despacho: "01 Actividad de la empresa".
 * Dos dígitos + espacio + título que empieza por letra, sin celdas de tabla.
 */
const CANONICAL_HEADING = /^(\d{2})\s+([A-ZÁÉÍÓÚÑ].{2,120})$/;

const LEGACY_SECTION_PATTERNS = [
  /^(\d+\.)\s+(.+)$/,
  /^([IVXLC]+\.)\s+(.+)$/,
  /^([A-Z]\.)\s+(.+)$/,
  /^(\d+\.\d+\.)\s+(.+)$/,
];

interface CatalogoApartado {
  id: string;
  titulo: string;
  variantes: string[];
}

function esObligatorio(titulo: string): boolean {
  const catalogo = [
    ...(apartadosPGC.abreviada as CatalogoApartado[]),
    ...(apartadosPGC.normal as CatalogoApartado[]),
  ];
  const lower = titulo.toLowerCase();
  return catalogo.some(
    (a) => a.variantes.some((v) => lower.includes(v)) || lower.includes(a.titulo.toLowerCase())
  );
}

export function extraerApartados(texto: string): ApartadoMemoria[] {
  const lineas = texto.split(/\n/).map((l) => l.trim());
  const apartados: ApartadoMemoria[] = [];
  let current: ApartadoMemoria | null = null;

  // Primera pasada: numeración canónica "NN Título"
  const usaCanonica = lineas.some((l) => !l.includes("|") && CANONICAL_HEADING.test(l));

  for (const linea of lineas) {
    if (!linea) continue;
    let esTitulo = false;
    let titulo = linea;
    let numero: number | undefined;

    if (!linea.includes("|")) {
      const canonical = linea.match(CANONICAL_HEADING);
      if (canonical && parseInt(canonical[1], 10) <= 30) {
        esTitulo = true;
        numero = parseInt(canonical[1], 10);
        titulo = canonical[2].trim();
      } else if (!usaCanonica) {
        for (const pattern of LEGACY_SECTION_PATTERNS) {
          const match = linea.match(pattern);
          if (match) {
            titulo = match[2] || match[1];
            esTitulo = true;
            break;
          }
        }
        if (!esTitulo && linea.length < 80 && linea === linea.toUpperCase() && /[A-ZÁÉÍÓÚ]/.test(linea)) {
          esTitulo = true;
          titulo = linea;
        }
      }
    }

    if (esTitulo) {
      if (current) apartados.push(current);
      current = {
        id: numero !== undefined ? String(numero).padStart(2, "0") : `sec-${apartados.length + 1}`,
        titulo,
        contenido: "",
        obligatorio: esObligatorio(titulo),
        numero,
      };
    } else if (current) {
      current.contenido += (current.contenido ? "\n" : "") + linea;
    }
  }

  if (current) apartados.push(current);

  if (apartados.length === 0) {
    apartados.push({
      id: "sec-1",
      titulo: "Documento completo",
      contenido: texto,
      obligatorio: false,
    });
  }

  return apartados;
}

/**
 * Extrae las tablas del texto normalizado (filas con celdas separadas por " | ").
 */
export function extraerTablas(texto: string): TablaMemoria[] {
  const lineas = texto.split(/\n/);
  const tablas: TablaMemoria[] = [];

  let apartadoActual: string | undefined;
  let bloque: { cells: string[]; linea: number }[] = [];
  let tituloPrevio = "";
  let ultimaNoVacia = "";

  const flush = () => {
    if (bloque.length === 0) return;
    const filas = bloque.map((b) => b.cells);
    const cabecera = filas[0];
    const datos = filas.length > 1 ? filas.slice(1) : filas;
    // Celdas de datos: todas menos la primera columna (etiqueta de fila)
    const dataCells = datos.flatMap((f) => f.slice(1));
    const vacia = dataCells.length > 0 && dataCells.every((c) => c.trim() === "");
    tablas.push({
      apartado: apartadoActual,
      titulo: tituloPrevio,
      cabecera,
      filas: filas.slice(1),
      vacia,
      linea: bloque[0].linea,
    });
    bloque = [];
  };

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i].trim();

    if (!linea.includes("|")) {
      flush();
      if (linea) {
        const heading = linea.match(CANONICAL_HEADING);
        if (heading && parseInt(heading[1], 10) <= 30) {
          apartadoActual = heading[1];
        }
        ultimaNoVacia = linea;
      }
      continue;
    }

    const cells = linea
      .split("|")
      .map((c) => c.trim())
      .filter((_, idx, arr) => !(idx === arr.length - 1 && arr[idx] === ""));

    // El RTF parte filas lógicas en varias líneas (la etiqueta en una línea y
    // cada importe en la siguiente): las celdas sueltas se anexan a la fila
    // anterior mientras esta no haya alcanzado el ancho de la cabecera.
    if (bloque.length > 0 && cells.length <= 2) {
      const anchoCabecera = bloque[0].cells.length;
      const filaAnterior = bloque[bloque.length - 1];
      if (filaAnterior.cells.length < anchoCabecera) {
        filaAnterior.cells.push(...cells.filter((c) => c !== ""));
        continue;
      }
    }

    if (bloque.length === 0) tituloPrevio = ultimaNoVacia;
    bloque.push({ cells, linea: i + 1 });
  }
  flush();

  return tablas;
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

function detectarEjercicio(texto: string): number | undefined {
  // 1) Título explícito "MEMORIA ABREVIADA 2024"
  const titulo = texto.match(/MEMORIA\s+(?:ABREVIADA|PYMES?|NORMAL)?\s*(\d{4})/i);
  if (titulo) return parseInt(titulo[1], 10);

  // 2) Pares comparativos "IMPORTE 2024 ... IMPORTE 2023": el mayor es el ejercicio
  const importes = [...texto.matchAll(/IMPORTE\s+(20\d{2})/gi)].map((m) => parseInt(m[1], 10));
  if (importes.length >= 2) {
    const counts = new Map<number, number>();
    for (const y of importes) counts.set(y, (counts.get(y) ?? 0) + 1);
    const candidatos = [...counts.keys()].filter((y) => counts.has(y - 1));
    if (candidatos.length > 0) return Math.max(...candidatos);
  }

  // 3) Fecha de cierre "a 31/12/2024"
  const cierre = texto.match(/31\/12\/(20\d{2})/);
  if (cierre) return parseInt(cierre[1], 10);

  return undefined;
}

function detectarTipoMemoria(texto: string, numApartados: number): DatosClaveMemoria["tipoMemoria"] {
  if (/memoria\s+abreviada/i.test(texto)) return "abreviada";
  if (/memoria\s+(?:de\s+)?pymes?/i.test(texto)) return "pymes";
  if (/memoria\s+normal/i.test(texto)) return "normal";
  if (numApartados > 0 && numApartados <= 13) return "abreviada";
  return "normal";
}

export function extraerDatosClave(texto: string): DatosClaveMemoria {
  const datos: DatosClaveMemoria = {};

  const denominacion = texto.match(/La empresa\s+(.{3,80}?)\s+se constituyó/i);
  if (denominacion) datos.denominacion = denominacion[1].trim().replace(/[,.]$/, "");

  const nif =
    texto.match(/N[úu]mero de Identificaci[óo]n Fiscal\s+([A-Z]?\d{7,8}[A-Z0-9])/i) ||
    texto.match(/\bN\.?I\.?F\.?\s*:?\s*([A-Z]\d{8}|\d{8}[A-Z])\b/);
  if (nif) datos.nif = nif[1].toUpperCase();

  datos.ejercicio = detectarEjercicio(texto);

  const cierre = texto.match(/\b(31\/12\/20\d{2})\b/);
  if (cierre) datos.fechaCierre = cierre[1];

  const impuesto = texto.match(
    /impuesto corriente asciende a\s+(-?[\d.,]+)(?:\s*\((-?[\d.,]+)\s+en\s+(\d{4})\))?/i
  );
  if (impuesto) {
    datos.impuestoCorriente = parseImporte(impuesto[1]) ?? undefined;
    if (impuesto[2]) datos.impuestoCorrienteAnterior = parseImporte(impuesto[2]) ?? undefined;
  }

  const empleo = texto.match(/TOTAL EMPLEO MEDIO\s*\|\s*([\d.,]+)\s*(?:\|\s*([\d.,]+))?/i);
  if (empleo) {
    datos.empleoMedio = parseImporte(empleo[1]) ?? undefined;
    if (empleo[2]) datos.empleoMedioAnterior = parseImporte(empleo[2]) ?? undefined;
  }

  const pmp = texto.match(/Periodo medio de pago a proveedores\s*\|\s*([\d.,]+)\s*(?:\|\s*([\d.,]+))?/i);
  if (pmp) {
    datos.pmpDias = parseImporte(pmp[1]) ?? undefined;
    if (pmp[2]) datos.pmpDiasAnterior = parseImporte(pmp[2]) ?? undefined;
  }

  // Total de BINs pendientes: fila "Total | A COMPENSAR | APLICADO | PENDIENTE"
  const binsIdx = texto.search(/bases imponibles negativas pendientes de compensar/i);
  if (binsIdx !== -1) {
    const fragmento = texto.slice(binsIdx, binsIdx + 1500);
    const total = fragmento.match(/Total\s*\|\s*[\d.,]+\s*\|\s*[\d.,]+\s*\|\s*([\d.,]+)/i);
    if (total) datos.basesImponiblesNegativasPendientes = parseImporte(total[1]) ?? undefined;
  }

  const formulacion = texto.match(
    /En\s+.{2,40}?,\s*a\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4}),?\s+quedan formuladas/i
  );
  if (formulacion) {
    const mes = MESES[formulacion[2].toLowerCase()] ?? 0;
    datos.fechaFormulacion = `${formulacion[1].padStart(2, "0")}/${String(mes).padStart(2, "0")}/${formulacion[3]}`;
  }

  const firmante = texto.match(/([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{4,60})\s+con\s+N\.?I\.?F\.?/);
  if (firmante) datos.firmante = firmante[1].trim();

  const apartados = extraerApartados(texto);
  datos.tipoMemoria = detectarTipoMemoria(texto, apartados.filter((a) => a.numero !== undefined).length);

  return datos;
}

const CONTEXTO_LEGAL =
  /(ley|real decreto|r\.?d\.?|d\.?a\.?|art[íi]culo|art\.|disposici[óo]n|c[óo]digo|reglamento|orden|normativa)/i;

export function extraerAniosMencionados(texto: string): AnioMencionado[] {
  const resultado: AnioMencionado[] = [];
  const regex = /\b(19\d{2}|20\d{2})\b/g;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(texto)) !== null) {
    const anio = parseInt(m[1], 10);
    const start = Math.max(0, m.index - 70);
    const end = Math.min(texto.length, m.index + m[1].length + 70);
    const contexto = texto.slice(start, end).replace(/\s+/g, " ").trim();

    // Ignorar componentes de fechas dd/mm/yyyy y números con separador de miles
    const antes = texto.slice(Math.max(0, m.index - 12), m.index);
    if (/[\d.,]$/.test(antes.trimEnd()) && !/\/$/.test(antes)) continue;

    const contextoCorto = texto.slice(Math.max(0, m.index - 30), m.index + 10);
    const esReferenciaLegal = /\d{1,3}\/$/.test(antes) || CONTEXTO_LEGAL.test(contextoCorto);

    resultado.push({ anio, contexto, esReferenciaLegal });
  }

  return resultado;
}

/**
 * Detecta párrafos que anuncian un detalle/tabla ("se detalla a continuación...")
 * sin que les siga ninguna tabla ni contenido: el caso real de la tabla de
 * coeficientes de amortización vacía.
 */
export function detectarTablasAnunciadasAusentes(texto: string): string[] {
  const lineas = texto.split(/\n/).map((l) => l.trim());
  const anuncios: string[] = [];
  const patronAnuncio =
    /(se detallan? a continuaci[óo]n|a continuaci[óo]n se detallan?|de los diferentes elementos es:|siguiente detalle:|se muestran? a continuaci[óo]n)/i;

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    if (!linea || linea.includes("|")) continue;
    if (!patronAnuncio.test(linea)) continue;

    // Buscar contenido en las 4 líneas no vacías siguientes
    let encontrado = false;
    let revisadas = 0;
    for (let j = i + 1; j < lineas.length && revisadas < 4; j++) {
      const siguiente = lineas[j];
      if (!siguiente) continue;
      revisadas++;
      if (siguiente.includes("|") || /\d/.test(siguiente)) {
        encontrado = true;
        break;
      }
      // Si aparece otro título/párrafo largo, ya no hay tabla
      if (siguiente.length > 60) break;
    }

    if (!encontrado) anuncios.push(linea.slice(0, 140));
  }

  return anuncios;
}

export function analizarFormal(texto: string): FormalMemoria {
  const textoLower = texto.toLowerCase();
  const tienePortada =
    /memoria\s+(?:anual|abreviada|pymes?)|ejercicio\s+\d{4}|cuentas\s+anuales/i.test(texto.slice(0, 2000)) ||
    /memoria\s+(?:anual|abreviada|pymes?)\s+\d{4}/i.test(texto);
  const tieneFirma =
    /quedan formuladas las cuentas anuales|dando su conformidad mediante firma|firmado por/i.test(textoLower) ||
    (/firma|administrador|consejero|apoderado|representante\s+legal/i.test(textoLower) &&
      /[_]{3,}|\.{3,}|firmado/i.test(textoLower));

  const camposVacios: string[] = [];
  const placeholderMatches = texto.match(/\[\.{2,}\]|\[\.+\]|_{5,}|XXX|TBD|PENDIENTE DE/gi);
  if (placeholderMatches) camposVacios.push(...placeholderMatches);

  const titulos = extraerApartados(texto).map((a) => a.titulo.toLowerCase().trim());
  const apartadosRepetidos = titulos.filter((t, i) => titulos.indexOf(t) !== i);

  // Una frase se considera cortada si termina en coma o en palabra funcional
  // (artículo, preposición, conjunción): los títulos de sub-apartados sin
  // puntuación final no deben marcarse.
  const PALABRAS_FUNCIONALES =
    /(?:\b(?:de|del|la|las|el|los|y|o|u|e|en|a|al|que|con|para|por|su|sus|se|ni|como|según|entre|sobre|hacia|sin|tras|cuyo|cuya|es|son|ha|han|sido|más))$/i;
  const frasesCortadas: string[] = [];
  const parrafos = texto.split(/\n\n+/);
  for (const p of parrafos) {
    const trimmed = p.trim();
    if (trimmed.includes("|")) continue;
    if (
      trimmed.length > 40 &&
      trimmed.length < 200 &&
      !/^\d/.test(trimmed) &&
      (/,$/.test(trimmed) || PALABRAS_FUNCIONALES.test(trimmed))
    ) {
      frasesCortadas.push(trimmed.slice(0, 100) + (trimmed.length > 100 ? "..." : ""));
    }
  }

  const textoExtraible = texto.replace(/\s/g, "").length > 100;

  return {
    tienePortada,
    tieneFirma,
    camposVacios: [...new Set(camposVacios)],
    apartadosRepetidos: [...new Set(apartadosRepetidos)],
    frasesCortadas: frasesCortadas.slice(0, 10),
    textoExtraible,
  };
}

export function contarPaginasPdf(text: string): number {
  const pageBreaks = (text.match(/\f/g) || []).length;
  return Math.max(1, pageBreaks + 1);
}
