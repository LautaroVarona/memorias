import { seniorExplanation, seniorExplanationPass } from "@/lib/rules/helpers/explanation";
import { withMemoryLocator } from "@/lib/rules/helpers/evidence";
import { tablaEsCualitativa } from "@/lib/parsers/memoria/extractors";
import { normalizarTextoApartado } from "@/lib/rules/helpers/text-normalize";
import type { ApartadoMemoria } from "@/types/domain";
import type { RuleDefinition } from "../types";

interface HallazgoNarrativo {
  seccion: string;
  sectionId?: string;
  fragmento: string;
}

const MIN_PARRAFO_DUPLICADO = 40;

function isLikelyTitle(line: string): boolean {
  const t = line.trim();
  if (/^\d{1,2}\s+[A-ZÁÉÍÓÚÑ]/.test(t)) return true;
  if (t.length <= 80 && /^[\d.\s\-–]*[A-ZÁÉÍÓÚÑ][^.]{0,60}$/.test(t)) return true;
  return false;
}

function truncarFragmento(texto: string, max = 220): string {
  const t = texto.trim();
  return t.length > max ? `${t.slice(0, max)}...` : t;
}

function extractParagraphFragment(lines: string[], lineIndex: number): string {
  let start = lineIndex;
  while (start > 0 && lines[start - 1].trim() !== "") start--;
  return truncarFragmento(
    lines
      .slice(start, lineIndex + 1)
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ")
  );
}

function collectTableLines(lines: string[], start: number): string[] {
  const tableLines: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) break;
    if (!t.includes("|")) break;
    tableLines.push(t);
  }
  return tableLines;
}

function parseTableLines(tableLines: string[]): { cabecera: string[]; datos: string[][] } {
  if (tableLines.length === 0) return { cabecera: [], datos: [] };
  const cabecera = tableLines[0]
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c && !/^[-:–—]+$/.test(c));
  const datos = tableLines.slice(1).map((row) =>
    row
      .split("|")
      .map((c) => c.trim())
      .filter((_, idx, arr) => !(idx === arr.length - 1 && arr[idx] === ""))
  );
  return { cabecera, datos };
}

function tableHasData(tableLines: string[]): boolean {
  if (tableLines.length === 0) return false;
  const dataRows = tableLines.length === 1 ? [] : tableLines.slice(1);
  if (dataRows.length === 0) return false;

  const { cabecera, datos } = parseTableLines(tableLines);
  if (tablaEsCualitativa(cabecera, datos)) {
    return datos.some((row) =>
      row.some((cell) => {
        const t = cell.trim();
        return t.length >= 2 && !/^[-:–—]+$/.test(t);
      })
    );
  }

  return dataRows.some((row) => {
    const cells = row
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c && !/^[-:–—]+$/.test(c));
    return cells.length > 0;
  });
}

/** Introducción válida a tabla con datos; no debe generar alerta de dos puntos huérfanos. */
function isValidTableIntroduction(lines: string[], colonIndex: number): boolean {
  let j = colonIndex + 1;
  while (j < lines.length && lines[j].trim() === "") j++;
  if (j >= lines.length) return false;
  if (!lines[j].trim().includes("|")) return false;
  return tableHasData(collectTableLines(lines, j));
}

function detectTruncatedAfterColon(text: string): string[] {
  const found: string[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.includes("|")) continue;
    if (!/:\s*$/.test(trimmed)) continue;
    if (isLikelyTitle(trimmed)) continue;

    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;

    if (j >= lines.length) {
      found.push(extractParagraphFragment(lines, i));
      continue;
    }

    const next = lines[j].trim();
    if (next.includes("|")) {
      if (!isValidTableIntroduction(lines, i)) {
        found.push(extractParagraphFragment(lines, i));
      }
      continue;
    }

    if (isLikelyTitle(next)) {
      found.push(extractParagraphFragment(lines, i));
    }
  }

  const paragraphs = text.split(/\n\n+/);
  for (let p = 0; p < paragraphs.length; p++) {
    const paraLines = paragraphs[p].split("\n").map((l) => l.trim()).filter(Boolean);
    if (paraLines.length === 0) continue;

    const lastLine = paraLines[paraLines.length - 1];
    if (!/:\s*$/.test(lastLine) || isLikelyTitle(lastLine)) continue;

    if (p === paragraphs.length - 1) {
      const fragment = truncarFragmento(paragraphs[p]);
      if (!found.includes(fragment)) found.push(fragment);
      continue;
    }

    const nextParagraph = paragraphs[p + 1].trim();
    if (!nextParagraph) {
      const fragment = truncarFragmento(paragraphs[p]);
      if (!found.includes(fragment)) found.push(fragment);
      continue;
    }

    if (nextParagraph.includes("|")) {
      const nextLines = nextParagraph.split("\n");
      const tableStart = nextLines.findIndex((l) => l.trim().includes("|"));
      if (tableStart >= 0) {
        const tableLines = collectTableLines(nextLines, tableStart);
        if (!tableHasData(tableLines)) {
          const fragment = truncarFragmento(paragraphs[p]);
          if (!found.includes(fragment)) found.push(fragment);
        }
      }
    }
  }

  return [...new Set(found)];
}

function detectIdenticalConsecutiveParagraphs(text: string): string[] {
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p && !p.includes("|"));

  const found: string[] = [];
  for (let i = 0; i < paragraphs.length - 1; i++) {
    const actual = normalizarTextoApartado(paragraphs[i]);
    const siguiente = normalizarTextoApartado(paragraphs[i + 1]);
    if (actual.length < MIN_PARRAFO_DUPLICADO) continue;
    if (actual === siguiente) {
      found.push(truncarFragmento(paragraphs[i]));
    }
  }

  return [...new Set(found)];
}

function collectColonIssues(sections: ApartadoMemoria[]): HallazgoNarrativo[] {
  const hallazgos: HallazgoNarrativo[] = [];

  for (const section of sections) {
    const texto = section.contenido ?? "";
    if (!texto.trim()) continue;

    const seccionRef = section.titulo || section.id;
    for (const fragmento of detectTruncatedAfterColon(texto)) {
      hallazgos.push({ seccion: seccionRef, sectionId: section.id, fragmento });
    }
  }

  return hallazgos;
}

function collectDuplicateIssues(sections: ApartadoMemoria[]): HallazgoNarrativo[] {
  const hallazgos: HallazgoNarrativo[] = [];

  for (const section of sections) {
    const texto = section.contenido ?? "";
    if (!texto.trim()) continue;

    const seccionRef = section.titulo || section.id;
    for (const fragmento of detectIdenticalConsecutiveParagraphs(texto)) {
      hallazgos.push({ seccion: seccionRef, sectionId: section.id, fragmento });
    }
  }

  return hallazgos;
}

function buildColonEvidence(hallazgos: HallazgoNarrativo[]) {
  return hallazgos.map((h) =>
    withMemoryLocator(
      h.seccion,
      h.fragmento,
      { section: h.sectionId, sectionTitle: h.seccion },
      "medium"
    )
  );
}

function buildDuplicateEvidence(hallazgos: HallazgoNarrativo[]) {
  return hallazgos.map((h) =>
    withMemoryLocator(
      h.seccion,
      h.fragmento,
      { section: h.sectionId, sectionTitle: h.seccion },
      "medium"
    )
  );
}

export const calidadNarrativaRules: RuleDefinition[] = [
  {
    id: "FORMAL_003",
    title: "Texto truncado o incompleto",
    type: "formal",
    defaultSeverity: "warning",
    normativa: "PGC",
    referencia: "Memoria — calidad formal y continuidad narrativa",
    execute(data) {
      if (!data.memory?.sections?.length) {
        return { passed: true, data: { skip: true, hallazgos: [] as HallazgoNarrativo[] } };
      }

      const hallazgos = collectColonIssues(data.memory.sections);
      const action =
        "Revise la redacción de este apartado; parece haber texto cortado o incompleto tras los dos puntos.";

      return {
        passed: hallazgos.length === 0,
        severity: "warning",
        warningLevel: "medium",
        diagnosis: "Dos puntos sin continuación narrativa",
        impact:
          hallazgos.length === 1
            ? `El apartado «${hallazgos[0].seccion}» termina en dos puntos sin párrafo, lista o tabla con datos que desarrolle la idea.`
            : `Se detectaron ${hallazgos.length} fragmentos en distintos apartados que terminan en dos puntos sin continuación válida.`,
        action,
        sugerencia: action,
        data: { hallazgos },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        if (outcome.data.skip) {
          return seniorExplanationPass("No hay memoria que analizar.");
        }
        return seniorExplanationPass(
          "No se detectaron apartados con dos puntos huérfanos ni texto truncado al cierre de párrafo."
        );
      }

      const hallazgos = (outcome.data.hallazgos as HallazgoNarrativo[]) ?? [];
      const lista = hallazgos
        .slice(0, 3)
        .map((h) => `«${h.seccion}»: "${h.fragmento.slice(0, 80)}${h.fragmento.length > 80 ? "…" : ""}"`)
        .join("; ");

      return seniorExplanation(
        `Se detectó texto truncado o incompleto en ${hallazgos.length} punto(s): ${lista}${hallazgos.length > 3 ? "…" : ""}.`,
        outcome.impact ??
          "Un apartado que termina en dos puntos sin desarrollo suele indicar texto cortado en la conversión o edición del documento.",
        outcome.action ??
          "Revise la redacción de este apartado; parece haber texto cortado o incompleto tras los dos puntos."
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      return buildColonEvidence((outcome.data.hallazgos as HallazgoNarrativo[]) ?? []);
    },
  },
  {
    id: "FORMAL_004",
    title: "Párrafo duplicado por error de edición (copia-pega)",
    type: "formal",
    defaultSeverity: "warning",
    normativa: "PGC",
    referencia: "Memoria — calidad formal y continuidad narrativa",
    execute(data) {
      if (!data.memory?.sections?.length) {
        return { passed: true, data: { skip: true, hallazgos: [] as HallazgoNarrativo[] } };
      }

      const hallazgos = collectDuplicateIssues(data.memory.sections);
      const action =
        "Elimine el párrafo duplicado y revise el apartado para confirmar que la redacción es coherente.";

      return {
        passed: hallazgos.length === 0,
        severity: "warning",
        warningLevel: "medium",
        diagnosis: "Párrafos consecutivos idénticos (clon 100 %)",
        impact:
          hallazgos.length === 1
            ? `En «${hallazgos[0].seccion}» hay dos párrafos seguidos con el mismo texto, probable residuo de copiar-pegar.`
            : `Se detectaron ${hallazgos.length} bloques con párrafos consecutivos clonados en distintos apartados.`,
        action,
        sugerencia: action,
        data: { hallazgos },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        if (outcome.data.skip) {
          return seniorExplanationPass("No hay memoria que analizar.");
        }
        return seniorExplanationPass(
          "No se detectaron párrafos consecutivos duplicados por error de edición."
        );
      }

      const hallazgos = (outcome.data.hallazgos as HallazgoNarrativo[]) ?? [];
      const lista = hallazgos
        .slice(0, 3)
        .map((h) => `«${h.seccion}»: "${h.fragmento.slice(0, 80)}${h.fragmento.length > 80 ? "…" : ""}"`)
        .join("; ");

      return seniorExplanation(
        `Se detectaron ${hallazgos.length} párrafo(s) duplicado(s) consecutivamente: ${lista}${hallazgos.length > 3 ? "…" : ""}.`,
        outcome.impact ??
          "Dos párrafos idénticos consecutivos suelen ser residuo de copiar-pegar accidental durante la redacción.",
        outcome.action ??
          "Elimine el párrafo duplicado y revise el apartado para confirmar que la redacción es coherente."
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      return buildDuplicateEvidence((outcome.data.hallazgos as HallazgoNarrativo[]) ?? []);
    },
  },
];
