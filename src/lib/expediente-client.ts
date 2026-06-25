import type { ValidacionView } from "@/components/review/types";
import { evaluateGlobalClosure } from "@/lib/rules/global-evaluation";
import { computeCaseScore } from "@/lib/rules/scoring";
import { filterApartadoOnlyValidaciones } from "@/lib/review/apartado-only";
import type { CaseData, Evidence } from "@/types/case-data";
import {
  getArchivoBlob,
  getExpediente,
  listArchivos,
  listExpedientes,
  listReglas,
  listValidaciones,
  saveValidaciones,
  updateArchivoMetadata,
  updateExpediente,
  deleteExpediente,
} from "@/lib/storage/expediente-store";
import type { ExpedienteListItem } from "@/lib/storage/types";
import type { ProcessOutput } from "@/lib/process/expediente-core";
import { processExpedienteLocal } from "@/lib/process/client-process";

export interface ExpedienteDetail {
  id: string;
  cliente: string;
  ejercicio: number;
  estado: string;
  tipoEmpresa: string | null;
  archivos: {
    id: string;
    nombre: string;
    tipo: string;
    metadata?: string;
  }[];
  validaciones: ValidacionView[];
  resumen: {
    critical: number;
    warning: number;
    pass: number;
    total: number;
    errores: number;
    warnings: number;
  };
  score?: {
    score: number;
    errores: number;
    warnings: number;
    estado: "ok" | "revisar" | "no_formulable" | "critico";
    globalEstado?: "ok" | "revisar" | "no_formulable";
    motivoGlobal?: string;
  };
  caseData?: CaseData | null;
  sections?: Record<string, { current?: string; prior?: string; title?: string }>;
}

function parseValidaciones(validaciones: Awaited<ReturnType<typeof listValidaciones>>): ValidacionView[] {
  const mapped = validaciones.map((v) => {
    const raw = JSON.parse(v.evidencia || "[]") as
      | Evidence[]
      | { items?: Evidence[]; diagnosis?: string; tags?: string[] };

    const isWrapped = raw && typeof raw === "object" && !Array.isArray(raw) && "items" in raw;
    const evidencia = isWrapped ? (raw.items ?? []) : (raw as Evidence[]);
    const diagnosis = isWrapped ? raw.diagnosis : undefined;
    const tags = isWrapped ? raw.tags : undefined;

    return {
      id: v.id,
      ruleId: v.ruleId,
      categoria: v.categoria,
      severidad: v.severidad,
      mensaje: v.mensaje,
      title: v.title ?? v.ruleId,
      explanation: v.explanation ?? v.mensaje,
      normativa: v.normativa,
      referencia: v.referencia,
      evidencia,
      sugerencia: v.sugerencia ?? null,
      diagnosis,
      tags,
    };
  });
  return filterApartadoOnlyValidaciones(mapped);
}

function buildSectionsPayload(caseData: CaseData | null): Record<string, { current?: string; prior?: string; title?: string }> {
  if (!caseData?.memory?.sections?.length) return {};
  const out: Record<string, { current?: string; prior?: string; title?: string }> = {};
  const priorByNum = new Map(
    (caseData.priorYear?.memory?.sections ?? [])
      .filter((s) => s.numero !== undefined)
      .map((s) => [String(s.numero).padStart(2, "0"), s])
  );

  for (const sec of caseData.memory.sections) {
    if (sec.numero === undefined) continue;
    const num = String(sec.numero).padStart(2, "0");
    const prior = priorByNum.get(num);
    out[num] = {
      title: sec.titulo,
      current: sec.contenido,
      prior: prior?.contenido,
    };
  }
  return out;
}

function buildResumen(validaciones: ValidacionView[]) {
  const scored = validaciones.filter((v) => !v.tags?.includes("guardrail_skip"));
  return {
    critical: scored.filter((v) => v.severidad === "critical").length,
    warning: scored.filter((v) => v.severidad === "warning").length,
    pass: scored.filter((v) => v.severidad === "pass").length,
    total: scored.length,
    errores: scored.filter((v) => v.severidad === "critical").length,
    warnings: scored.filter((v) => v.severidad === "warning").length,
  };
}

function computeScore(
  validaciones: ValidacionView[],
  caseDataSnapshot: string | null | undefined,
  scoreSnapshot: string | null | undefined
) {
  if (scoreSnapshot) {
    try {
      return JSON.parse(scoreSnapshot) as ExpedienteDetail["score"];
    } catch {
      // recalcular
    }
  }

  if (!validaciones.length) return undefined;

  const caseData = caseDataSnapshot
    ? (JSON.parse(caseDataSnapshot) as CaseData)
    : null;

  const ruleResults = validaciones.map((v) => ({
    ruleId: v.ruleId,
    title: v.title ?? v.ruleId,
    categoria: v.categoria,
    type: v.categoria,
    severidad: v.severidad,
    severity: v.severidad === "critical" ? "critical" : v.severidad === "pass" ? "ok" : "warning",
    mensaje: v.mensaje,
    explanation: v.explanation ?? v.mensaje,
    evidencia: v.evidencia,
    evidence: v.evidencia,
    normativa: v.normativa ?? undefined,
    referencia: v.referencia ?? undefined,
    sugerencia: v.sugerencia ?? undefined,
  })) as import("@/types/domain").RuleResult[];

  const globalEval = caseData
    ? evaluateGlobalClosure(ruleResults, caseData)
    : { estado: "revisar" as const, bloqueadores: [] };

  return computeCaseScore(ruleResults, globalEval);
}

export async function fetchExpedientes(filters?: {
  cliente?: string;
  ejercicio?: number;
  estado?: string;
}): Promise<ExpedienteListItem[]> {
  return listExpedientes(filters);
}

export async function fetchExpedienteDetail(id: string): Promise<ExpedienteDetail | null> {
  const expediente = await getExpediente(id);
  if (!expediente) return null;

  const archivos = await listArchivos(id);
  const validaciones = parseValidaciones(await listValidaciones(id));
  const resumen = buildResumen(validaciones);
  const score = computeScore(validaciones, expediente.caseDataSnapshot, expediente.scoreSnapshot);
  let caseData: CaseData | null = null;
  if (expediente.caseDataSnapshot) {
    try {
      caseData = JSON.parse(expediente.caseDataSnapshot) as CaseData;
    } catch {
      caseData = null;
    }
  }

  return {
    id: expediente.id,
    cliente: expediente.cliente,
    ejercicio: expediente.ejercicio,
    estado: expediente.estado,
    tipoEmpresa: expediente.tipoEmpresa ?? null,
    archivos: archivos.map((a) => ({
      id: a.id,
      nombre: a.nombre,
      tipo: a.tipo,
      metadata: a.metadata,
    })),
    validaciones,
    resumen,
    score,
    caseData,
    sections: buildSectionsPayload(caseData),
  };
}

export async function removeExpediente(id: string): Promise<void> {
  await deleteExpediente(id);
}

export async function runExpedienteProcess(
  expedienteId: string,
  onProgress?: (message: string) => void
): Promise<ProcessOutput> {
  const expediente = await getExpediente(expedienteId);
  if (!expediente) throw new Error("Expediente no encontrado");

  const archivos = await listArchivos(expedienteId);
  if (!archivos.length) throw new Error("No hay archivos para procesar");

  const reglas = await listReglas(expedienteId);

  let priorYear: { ejercicio: number; archivos: Awaited<ReturnType<typeof listArchivos>> } | undefined;
  if (expediente.ejercicioAnteriorId) {
    const prior = await getExpediente(expediente.ejercicioAnteriorId);
    const priorArchivos = await listArchivos(expediente.ejercicioAnteriorId);
    if (prior && priorArchivos.length) {
      priorYear = { ejercicio: prior.ejercicio, archivos: priorArchivos };
    }
  }

  await updateExpediente(expedienteId, { estado: "procesando" });

  try {
    const data = await processExpedienteLocal({
      expedienteId,
      cliente: expediente.cliente,
      ejercicio: expediente.ejercicio,
      archivos,
      reglasCustom: reglas,
      priorYear,
      onProgress,
    });

    for (const update of data.archivos) {
      await updateArchivoMetadata(update.id, { tipo: update.tipo, metadata: update.metadata });
    }

    await saveValidaciones(
      expedienteId,
      data.validaciones.map((v) => ({
        ruleId: v.ruleId,
        categoria: v.categoria,
        severidad: v.severidad,
        mensaje: v.mensaje,
        title: v.title,
        explanation: v.explanation,
        normativa: v.normativa,
        referencia: v.referencia,
        evidencia: v.evidencia,
        sugerencia: v.sugerencia,
      }))
    );

    await updateExpediente(expedienteId, {
      estado: "revisado",
      cliente: data.cliente,
      ejercicio: data.ejercicio,
      tipoEmpresa: data.tipoEmpresa,
      scoreSnapshot: JSON.stringify(data.score),
      caseDataSnapshot: JSON.stringify(data.caseData),
    });

    return data;
  } catch (err) {
    await updateExpediente(expedienteId, { estado: "borrador" });
    throw err;
  }
}

function mimeTypeForFileName(nombre: string): string {
  const ext = nombre.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "doc":
      return "application/msword";
    case "rtf":
      return "application/rtf";
    case "pdf":
      return "application/pdf";
    case "xlsm":
      return "application/vnd.ms-excel.sheet.macroEnabled.12";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default:
      return "application/octet-stream";
  }
}

/** Abre el archivo original guardado en IndexedDB (flujo 100 % local en el navegador). */
export async function openArchivoOriginal(archivoId: string, nombre: string): Promise<void> {
  const buffer = await getArchivoBlob(archivoId);
  if (!buffer) {
    throw new Error(
      "No se encontró el archivo en este navegador. Vuelva a subirlo si lo abrió en otro equipo."
    );
  }

  const blob = new Blob([buffer], { type: mimeTypeForFileName(nombre) });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
