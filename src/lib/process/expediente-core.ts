import { buildCaseData } from "@/lib/case/build-case-data";
import { clasificarEmpresa } from "@/lib/classifier";
import { classifyUploadedFile } from "@/lib/process/classify-content";
import { parseExcel, type ExcelParseResult } from "@/lib/parsers/excel/parser";
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

export interface ParsedArchivoPayload {
  id: string;
  nombre: string;
  tipo: string;
  metadata: string;
  excel?: ExcelParseResult;
  memoria?: MemoriaNormalizada;
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

export interface FinalizeInput {
  expedienteId: string;
  cliente: string;
  ejercicio: number;
  archivos: ParsedArchivoPayload[];
  reglasCustom: ReglaCustomInput[];
  priorYear?: {
    ejercicio: number;
    archivos: ParsedArchivoPayload[];
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

export async function parseSingleArchivo(archivo: ArchivoInput): Promise<ParsedArchivoPayload> {
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
  let excel: ExcelParseResult | undefined;
  let memoria: MemoriaNormalizada | undefined;

  if (tipo.startsWith("excel")) {
    excel = parseExcel(buffer, fileName);
    metadata = mergeArchivoMetadata(metadata, {
      ejercicio: excel.libroCierre?.ejercicio,
      cliente: excel.libroCierre?.cliente,
      formato: excel.libroCierre ? "libro_cierre" : "excel",
    });
  }

  if (tipo === "memoria_word" || tipo === "memoria_pdf") {
    memoria = await parseMemoria(buffer, fileName, tipo);
    metadata = mergeArchivoMetadata(metadata, {
      ejercicio: memoria.datosClave.ejercicio,
      cliente: memoria.datosClave.denominacion,
      formato: memoria.metadata.formato,
    });
  }

  return { id: archivo.id, nombre: fileName, tipo, metadata, excel, memoria };
}

function mergeParsedFromPrior(archivos: ParsedArchivoPayload[]): {
  balance?: BalanceNormalizado;
  memoria?: MemoriaNormalizada;
  ejercicio: number;
} {
  let balance: BalanceNormalizado | undefined;
  let memoria: MemoriaNormalizada | undefined;
  let ejercicio = 0;

  for (const archivo of archivos) {
    if (archivo.excel) {
      if (archivo.excel.balance) balance = archivo.excel.balance;
      if (archivo.excel.libroCierre?.ejercicio) ejercicio = archivo.excel.libroCierre.ejercicio;
    }
    if (archivo.memoria) {
      memoria = archivo.memoria;
      if (archivo.memoria.datosClave.ejercicio) ejercicio = archivo.memoria.datosClave.ejercicio;
    }
  }

  return { balance, memoria, ejercicio };
}

function applyParsedArchivo(
  archivo: ParsedArchivoPayload,
  state: {
    balance?: BalanceNormalizado;
    balanceAnterior?: BalanceNormalizado;
    sumasSaldos?: CuentaNormalizada[];
    libroCierre?: LibroCierre;
    memorias: MemoriaNormalizada[];
  }
) {
  const { tipo } = archivo;

  if (archivo.excel && tipo.startsWith("excel") && tipo !== "excel_anterior") {
    if (archivo.excel.balance) state.balance = archivo.excel.balance;
    if (archivo.excel.balanceAnterior) state.balanceAnterior = archivo.excel.balanceAnterior;
    if (archivo.excel.sumasSaldos) state.sumasSaldos = archivo.excel.sumasSaldos;
    if (archivo.excel.libroCierre) state.libroCierre = archivo.excel.libroCierre;
  }

  if (archivo.memoria && (tipo === "memoria_word" || tipo === "memoria_pdf")) {
    state.memorias.push(archivo.memoria);
  }
}

export function finalizeExpedienteCore(input: FinalizeInput): ProcessOutput {
  const { expedienteId, archivos, reglasCustom } = input;

  const state = {
    balance: undefined as BalanceNormalizado | undefined,
    balanceAnterior: undefined as BalanceNormalizado | undefined,
    sumasSaldos: undefined as CuentaNormalizada[] | undefined,
    libroCierre: undefined as LibroCierre | undefined,
    memorias: [] as MemoriaNormalizada[],
  };

  const archivoUpdates: ProcessArchivoUpdate[] = archivos.map((a) => ({
    id: a.id,
    tipo: a.tipo,
    metadata: a.metadata,
  }));

  for (const archivo of archivos) {
    applyParsedArchivo(archivo, state);
  }

  const ejercicio = state.libroCierre?.ejercicio ?? input.ejercicio;
  const cliente = state.libroCierre?.cliente ?? input.cliente;

  let memoria: MemoriaNormalizada | undefined;
  let memoriaAnterior: MemoriaNormalizada | undefined;

  if (state.memorias.length === 1) {
    memoria = state.memorias[0];
  } else if (state.memorias.length > 1) {
    const ordenadas = [...state.memorias].sort(
      (a, b) => (b.datosClave.ejercicio ?? 0) - (a.datosClave.ejercicio ?? 0)
    );
    memoria = ordenadas.find((m) => m.datosClave.ejercicio === ejercicio) ?? ordenadas[0];
    memoriaAnterior = ordenadas.find((m) => m !== memoria);
  }

  let priorYear:
    | { ejercicio: number; balance?: BalanceNormalizado; memoria?: MemoriaNormalizada }
    | undefined;

  if (state.libroCierre?.ejercicioAnterior !== undefined) {
    priorYear = {
      ejercicio: state.libroCierre.ejercicioAnterior,
      balance: state.balanceAnterior,
      memoria: memoriaAnterior,
    };
  } else if (memoriaAnterior?.datosClave.ejercicio !== undefined) {
    priorYear = {
      ejercicio: memoriaAnterior.datosClave.ejercicio,
      memoria: memoriaAnterior,
    };
  }

  if (!priorYear && input.priorYear?.archivos.length) {
    const parsed = mergeParsedFromPrior(input.priorYear.archivos);
    priorYear = {
      ejercicio: input.priorYear.ejercicio || parsed.ejercicio,
      balance: parsed.balance,
      memoria: parsed.memoria,
    };
  }

  const cuentas = state.balance?.cuentas || state.sumasSaldos || [];
  const tipoEmpresa = clasificarEmpresa(cuentas);

  const caseData = buildCaseData({
    expedienteId,
    cliente,
    ejercicio,
    tipoEmpresa,
    balance: state.balance,
    sumasSaldos: state.sumasSaldos,
    libroCierre: state.libroCierre,
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

export async function processExpedienteCore(input: ProcessInput): Promise<ProcessOutput> {
  const parsed: ParsedArchivoPayload[] = [];
  for (const archivo of input.archivos) {
    parsed.push(await parseSingleArchivo(archivo));
  }

  let priorParsed: ParsedArchivoPayload[] | undefined;
  if (input.priorYear?.archivos.length) {
    priorParsed = [];
    for (const archivo of input.priorYear.archivos) {
      priorParsed.push(await parseSingleArchivo(archivo));
    }
  }

  return finalizeExpedienteCore({
    expedienteId: input.expedienteId,
    cliente: input.cliente,
    ejercicio: input.ejercicio,
    archivos: parsed,
    reglasCustom: input.reglasCustom,
    priorYear: priorParsed?.length
      ? { ejercicio: input.priorYear!.ejercicio, archivos: priorParsed }
      : undefined,
  });
}
