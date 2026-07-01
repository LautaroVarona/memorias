import { readFile } from "fs/promises";
import { buildCaseData } from "@/lib/case/build-case-data";
import { clasificarEmpresa } from "@/lib/classifier";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { classifyUploadedFile } from "@/lib/process/classify-content";
import { assignMemorias, resolveEjercicioActual } from "@/lib/process/resolve-ejercicio";
import { parseExcel } from "@/lib/parsers/excel/parser";
import { parseMemoria } from "@/lib/parsers/memoria/parser";
import { runFullValidation, summarizeResults } from "@/lib/rules/engine";
import type {
  BalanceNormalizado,
  CuentaNormalizada,
  LibroCierre,
  MemoriaNormalizada,
} from "@/types/domain";

const log = logger.child({ module: "process" });

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

export async function processExpediente(expedienteId: string): Promise<{
  resumen: ReturnType<typeof summarizeResults>;
  score: ReturnType<typeof runFullValidation>["score"];
  tipoEmpresa: string;
}> {
  const expediente = await prisma.expediente.findUnique({
    where: { id: expedienteId },
    include: {
      archivos: true,
      reglasCustom: { where: { activa: true } },
    },
  });

  if (!expediente) throw new Error("Expediente no encontrado");

  log.info("procesando expediente", {
    expedienteId,
    archivoCount: expediente.archivos.length,
    archivos: expediente.archivos.map((a) => ({ nombre: a.nombre, tipo: a.tipo })),
  });

  await prisma.expediente.update({
    where: { id: expedienteId },
    data: { estado: "procesando" },
  });

  let balance: BalanceNormalizado | undefined;
  let balanceAnterior: BalanceNormalizado | undefined;
  let sumasSaldos: CuentaNormalizada[] | undefined;
  let libroCierre: LibroCierre | undefined;
  const memorias: MemoriaNormalizada[] = [];

  await prisma.datosExtraidos.deleteMany({ where: { expedienteId } });

  for (const archivo of expediente.archivos) {
    const buffer = await readFile(archivo.ruta);
    const fileName = archivo.nombre;
    const fileLog = log.child({ expedienteId, fileName });

    // Refinar tipo por contenido (la subida solo usa extensión para ser rápida)
    let tipo = archivo.tipo;
    try {
      const refined = await classifyUploadedFile(buffer, fileName);
      if (refined !== archivo.tipo) {
        fileLog.info("tipo refinado por contenido", { tipoAnterior: archivo.tipo, tipo: refined });
        tipo = refined;
        await prisma.archivo.update({ where: { id: archivo.id }, data: { tipo: refined } });
      }
    } catch (err) {
      fileLog.warn("no se pudo clasificar por contenido; se mantiene tipo por extensión", {
        tipo,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (tipo.startsWith("excel")) {
      const parsed = parseExcel(buffer, fileName);
      fileLog.info("excel parseado", {
        tipo,
        tieneBalance: !!parsed.balance,
        tieneBalanceAnterior: !!parsed.balanceAnterior,
        tieneSumasSaldos: !!parsed.sumasSaldos,
        tieneLibroCierre: !!parsed.libroCierre,
        cuentaCount: parsed.balance?.cuentas?.length ?? parsed.sumasSaldos?.length ?? 0,
        detections: parsed.detections.map((d) => ({
          hoja: d.hoja,
          tipo: d.tipo,
          filas: d.formatoDetectado,
        })),
        cliente: parsed.libroCierre?.cliente,
        ejercicio: parsed.libroCierre?.ejercicio,
      });

      if (!parsed.balance && !parsed.sumasSaldos && !parsed.libroCierre) {
        fileLog.warn("excel sin datos extraídos — revisar hojas permitidas o formato", {
          tipo,
        });
      }
      if (tipo !== "excel_anterior") {
        if (parsed.balance) balance = parsed.balance;
        if (parsed.balanceAnterior) balanceAnterior = parsed.balanceAnterior;
        if (parsed.sumasSaldos) sumasSaldos = parsed.sumasSaldos;
        if (parsed.libroCierre) libroCierre = parsed.libroCierre;
      }
      await prisma.archivo.update({
        where: { id: archivo.id },
        data: {
          metadata: mergeArchivoMetadata(archivo.metadata, {
            ejercicio: parsed.libroCierre?.ejercicio,
            cliente: parsed.libroCierre?.cliente,
            formato: parsed.libroCierre ? "libro_cierre" : "excel",
          }),
        },
      });
      await prisma.datosExtraidos.create({
        data: {
          expedienteId,
          fuente: "excel",
          payload: JSON.stringify(parsed),
        },
      });
    }

    if (tipo === "memoria_word" || tipo === "memoria_pdf") {
      try {
        const ejercicioAncla =
          libroCierre?.ejercicio && libroCierre.ejercicio > 0
            ? libroCierre.ejercicio
            : expediente.ejercicio > 0
              ? expediente.ejercicio
              : undefined;

        const parsedMemoria = await parseMemoria(buffer, fileName, tipo, ejercicioAncla);
        memorias.push(parsedMemoria);
        fileLog.info("memoria parseada", {
          tipo,
          ejercicio: parsedMemoria.datosClave.ejercicio,
          cliente: parsedMemoria.datosClave.denominacion,
          formato: parsedMemoria.metadata.formato,
        });
        await prisma.archivo.update({
          where: { id: archivo.id },
          data: {
            metadata: mergeArchivoMetadata(archivo.metadata, {
              ejercicio: parsedMemoria.datosClave.ejercicio,
              cliente: parsedMemoria.datosClave.denominacion,
              formato: parsedMemoria.metadata.formato,
              ...(parsedMemoria.metadata.erroresParseo?.length
                ? { erroresParseo: parsedMemoria.metadata.erroresParseo }
                : {}),
            }),
          },
        });
        await prisma.datosExtraidos.create({
          data: {
            expedienteId,
            fuente: "memoria",
            payload: JSON.stringify(parsedMemoria),
          },
        });
      } catch (err) {
        fileLog.error("error al parsear memoria", err, { tipo });
        throw err;
      }
    }
  }

  const ejercicio = resolveEjercicioActual({
    libroEjercicio: libroCierre?.ejercicio,
    memoriasEjercicios: memorias
      .map((m) => m.datosClave.ejercicio)
      .filter((y): y is number => y !== undefined),
    expedienteEjercicio: expediente.ejercicio,
  });
  const cliente = libroCierre?.cliente ?? expediente.cliente;

  const { memoria, memoriaAnterior } = assignMemorias(memorias, ejercicio);

  let priorYear: { ejercicio: number; balance?: BalanceNormalizado; memoria?: MemoriaNormalizada } | undefined;

  // El libro de cierre ya contiene el ejercicio anterior (columnas comparativas)
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

  if (!priorYear && expediente.ejercicioAnteriorId) {
    const ant = await prisma.expediente.findUnique({
      where: { id: expediente.ejercicioAnteriorId },
      include: { archivos: true },
    });
    if (ant) {
      let antBalance: BalanceNormalizado | undefined;
      let antMemoria: MemoriaNormalizada | undefined;
      for (const archivo of ant.archivos) {
        const buffer = await readFile(archivo.ruta);
        if (archivo.tipo.startsWith("excel")) {
          const parsed = parseExcel(buffer, archivo.nombre);
          if (parsed.balance) antBalance = parsed.balance;
        }
        if (archivo.tipo === "memoria_word" || archivo.tipo === "memoria_pdf") {
          antMemoria = await parseMemoria(
            buffer,
            archivo.nombre,
            archivo.tipo,
            ant.ejercicio > 0 ? ant.ejercicio : undefined
          );
        }
      }
      priorYear = {
        balance: antBalance,
        memoria: antMemoria,
        ejercicio: ant.ejercicio,
      };
    }
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

  await prisma.datosExtraidos.create({
    data: {
      expedienteId,
      fuente: "case",
      payload: JSON.stringify(caseData),
    },
  });

  await prisma.validacionResultado.deleteMany({ where: { expedienteId } });

  const customRules = [
    ...expediente.reglasCustom,
    ...(await prisma.reglaCustom.findMany({ where: { expedienteId: null, activa: true } })),
  ];

  const { results, score } = runFullValidation(caseData, customRules);

  for (const r of results) {
    const evidenciaPayload =
      r.diagnosis || r.tags?.length
        ? { items: r.evidence, diagnosis: r.diagnosis, tags: r.tags }
        : r.evidence;

    await prisma.validacionResultado.create({
      data: {
        expedienteId,
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
      },
    });
  }

  const resumen = summarizeResults(results);

  await prisma.expediente.update({
    where: { id: expedienteId },
    data: {
      estado: "revisado",
      tipoEmpresa,
      cliente,
      ejercicio,
      scoreSnapshot: JSON.stringify(score),
    },
  });

  return { resumen, score, tipoEmpresa };
}
