import type { ValidacionView } from "@/components/review/types";
import { evaluateGlobalClosure } from "@/lib/rules/global-evaluation";
import { computeCaseScore } from "@/lib/rules/scoring";
import type { CaseData } from "@/types/case-data";
import type { Evidence } from "@/types/case-data";
import {
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
import { processExpedienteRemote } from "@/lib/process/remote-process";

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
}

function parseValidaciones(validaciones: Awaited<ReturnType<typeof listValidaciones>>): ValidacionView[] {
  return validaciones.map((v) => {
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
}

function buildResumen(validaciones: ValidacionView[]) {
  return {
    critical: validaciones.filter((v) => v.severidad === "critical").length,
    warning: validaciones.filter((v) => v.severidad === "warning").length,
    pass: validaciones.filter((v) => v.severidad === "pass").length,
    total: validaciones.length,
    errores: validaciones.filter((v) => v.severidad === "critical").length,
    warnings: validaciones.filter((v) => v.severidad === "warning").length,
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
    const data = await processExpedienteRemote({
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
