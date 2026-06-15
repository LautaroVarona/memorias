import { buildCaseData } from "@/lib/case/build-case-data";
import { clasificarEmpresa } from "@/lib/classifier";
import { classifyUploadedFile } from "@/lib/process/classify-content";
import { parseExcel } from "@/lib/parsers/excel/parser";
import { parseMemoria } from "@/lib/parsers/memoria/parser";
import { runFullValidation, summarizeResults } from "@/lib/rules/engine";
import type { CaseData } from "@/types/case-data";
import type {
  BalanceNormalizado,
  CuentaNormalizada,
  LibroCierre,
  MemoriaNormalizada,
} from "@/types/domain";

export interface ArchivoInput {
  id: string;
  nombre: string;
  tipo: string;
  metadata?: string;
  buffer: Buffer;
}

export interface ReglaCustomInput {
  id: string;
  nombre: string;
  expresion: string;
  severidad: string;
  activa: boolean;
  expedienteId?: string | null;
}

export interface ProcessInput {
  expedienteId: string;
  cliente: string;
  ejercicio: number;
  archivos: ArchivoInput[];
  reglasCustom: ReglaCustomInput[];
  priorYear?: {
    ejercicio: number;
    archivos: ArchivoInput[];
  };
}

export interface ProcessArchivoUpdate {
  id: string;
  tipo: string;
  metadata: string;
}

export interface ProcessValidacion {
  ruleId: string;
  categoria: string;
  severidad: string;
  mensaje: string;
  title?: string | null;
  explanation?: string | null;
  normativa?: string | null;
  referencia?: string | null;
  evidencia: string;
  sugerencia?: string | null;
}

export interface ProcessOutput {
  cliente: string;
  ejercicio: number;
  tipoEmpresa: string;
  estado: "revisado";
  archivos: ProcessArchivoUpdate[];
  validaciones: ProcessValidacion[];
  caseData: CaseData;
  score: ReturnType<typeof runFullValidation>["score"];
  resumen: ReturnType<typeof summarizeResults>;
}

function mergeArchivoMetadata(
  existing: string | null | undefined,
  patch: Record<string, unknown>
): string {
  let base: Record<string, unknown> = {};
  if (existing) {
    try {
      base = JSON.parse(existing) as Record<string, unknown>;
    } catch {
      base = {};
    }
  }
  return JSON.stringify({ ...base, ...patch, clasificacion: "contenido" });
}

async function parsePriorYearArchivos(archivos: ArchivoInput[]): Promise<{
  balance?: BalanceNormalizado;
  memoria?: MemoriaNormalizada;
  ejercicio: number;
}> {
  let antBalance: BalanceNormalizado | undefined;
  let antMemoria: MemoriaNormalizada | undefined;
  let ejercicio = 0;

  for (const archivo of archivos) {
    const buffer = archivo.buffer;
    let tipo = archivo.tipo;
    try {
      tipo = await classifyUploadedFile(buffer, archivo.nombre);
    } catch {
      // mantener tipo por extensión
    }

    if (tipo.startsWith("excel")) {
      const parsed = parseExcel(buffer, archivo.nombre);
      if (parsed.balance) antBalance = parsed.balance;
      if (parsed.libroCierre?.ejercicio) ejercicio = parsed.libroCierre.ejercicio;
    }
    if (tipo === "memoria_word" || tipo === "memoria_pdf") {
      antMemoria = await parseMemoria(buffer, archivo.nombre, tipo);
      if (antMemoria.datosClave.ejercicio) ejercicio = antMemoria.datosClave.ejercicio;
    }
  }

  return { balance: antBalance, memoria: antMemoria, ejercicio };
}

export async function processExpedienteCore(input: ProcessInput): Promise<ProcessOutput> {
  const { expedienteId, archivos, reglasCustom } = input;

  let balance: BalanceNormalizado | undefined;
  let balanceAnterior: BalanceNormalizado | undefined;
  let sumasSaldos: CuentaNormalizada[] | undefined;
  let libroCierre: LibroCierre | undefined;
  let memoria: MemoriaNormalizada | undefined;
  const memorias: MemoriaNormalizada[] = [];
  const archivoUpdates: ProcessArchivoUpdate[] = [];

  for (const archivo of archivos) {
    const buffer = archivo.buffer;
    const fileName = archivo.nombre;

    let tipo = archivo.tipo;
    try {
      const refined = await classifyUploadedFile(buffer, fileName);
      if (refined !== archivo.tipo) tipo = refined;
    } catch {
      // mantener tipo por extensión
    }

    let metadata = archivo.metadata ?? "{}";

    if (tipo.startsWith("excel")) {
      const parsed = parseExcel(buffer, fileName);

      if (tipo !== "excel_anterior") {
        if (parsed.balance) balance = parsed.balance;
        if (parsed.balanceAnterior) balanceAnterior = parsed.balanceAnterior;
        if (parsed.sumasSaldos) sumasSaldos = parsed.sumasSaldos;
        if (parsed.libroCierre) libroCierre = parsed.libroCierre;
      }

      metadata = mergeArchivoMetadata(metadata, {
        ejercicio: parsed.libroCierre?.ejercicio,
        cliente: parsed.libroCierre?.cliente,
        formato: parsed.libroCierre ? "libro_cierre" : "excel",
      });
    }

    if (tipo === "memoria_word" || tipo === "memoria_pdf") {
      const parsedMemoria = await parseMemoria(buffer, fileName, tipo);
      memorias.push(parsedMemoria);
      metadata = mergeArchivoMetadata(metadata, {
        ejercicio: parsedMemoria.datosClave.ejercicio,
        cliente: parsedMemoria.datosClave.denominacion,
        formato: parsedMemoria.metadata.formato,
      });
    }

    archivoUpdates.push({ id: archivo.id, tipo, metadata });
  }

  const ejercicio = libroCierre?.ejercicio ?? input.ejercicio;
  const cliente = libroCierre?.cliente ?? input.cliente;

  let memoriaAnterior: MemoriaNormalizada | undefined;
  if (memorias.length === 1) {
    memoria = memorias[0];
  } else if (memorias.length > 1) {
    const ordenadas = [...memorias].sort(
      (a, b) => (b.datosClave.ejercicio ?? 0) - (a.datosClave.ejercicio ?? 0)
    );
    memoria = ordenadas.find((m) => m.datosClave.ejercicio === ejercicio) ?? ordenadas[0];
    memoriaAnterior = ordenadas.find((m) => m !== memoria);
  }

  let priorYear:
    | { ejercicio: number; balance?: BalanceNormalizado; memoria?: MemoriaNormalizada }
    | undefined;

  if (libroCierre?.ejercicioAnterior !== undefined) {
    priorYear = {
      ejercicio: libroCierre.ejercicioAnterior,
      balance: balanceAnterior,
      memoria: memoriaAnterior,
    };
  } else if (memoriaAnterior?.datosClave.ejercicio !== undefined) {
    priorYear = {
      ejercicio: memoriaAnterior.datosClave.ejercicio,
      memoria: memoriaAnterior,
    };
  }

  if (!priorYear && input.priorYear?.archivos.length) {
    const parsed = await parsePriorYearArchivos(input.priorYear.archivos);
    priorYear = {
      ejercicio: input.priorYear.ejercicio || parsed.ejercicio,
      balance: parsed.balance,
      memoria: parsed.memoria,
    };
  }

  const cuentas = balance?.cuentas || sumasSaldos || [];
  const tipoEmpresa = clasificarEmpresa(cuentas);

  const caseData = buildCaseData({
    expedienteId,
    cliente,
    ejercicio,
    tipoEmpresa,
    balance,
    sumasSaldos,
    libroCierre,
    memoria,
    priorYear,
  });

  const customRules = reglasCustom.filter((r) => r.activa);
  const { results, score } = runFullValidation(caseData, customRules);

  const validaciones: ProcessValidacion[] = results.map((r) => {
    const evidenciaPayload =
      r.diagnosis || r.tags?.length
        ? { items: r.evidence, diagnosis: r.diagnosis, tags: r.tags }
        : r.evidence;

    return {
      ruleId: r.ruleId,
      categoria: r.categoria,
      severidad: r.severidad,
      mensaje: r.explanation,
      title: r.title,
      explanation: r.explanation,
      normativa: r.normativa,
      referencia: r.referencia,
      evidencia: JSON.stringify(evidenciaPayload),
      sugerencia: r.sugerencia,
    };
  });

  return {
    cliente,
    ejercicio,
    tipoEmpresa,
    estado: "revisado",
    archivos: archivoUpdates,
    validaciones,
    caseData,
    score,
    resumen: summarizeResults(results),
  };
}
