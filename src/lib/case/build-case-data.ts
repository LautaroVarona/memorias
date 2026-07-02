import type { CaseData, CalcisExcel } from "@/types/case-data";
import type {
  BalanceNormalizado,
  CuentaNormalizada,
  LibroCierre,
  MemoriaNormalizada,
  TipoEmpresa,
} from "@/types/domain";
import { extraerPropuestaAplicacion, extraerVinculadas, marcarEstructurasTablasDiferentes } from "@/lib/parsers/memoria/extractors";
import { validarAnclajeTemporal } from "@/lib/parsers/memoria/schemas";
import type { TablaMemoria } from "@/types/domain";
import { mapCalcisReservaTracked } from "@/lib/tracking/excel";

/** Revalida tablas comparativas contra el ejercicio del expediente (anclaje temporal). */
function anclarTablasAMemoria(tablas: TablaMemoria[], ejercicioExpediente: number): TablaMemoria[] {
  if (ejercicioExpediente <= 0) return tablas;

  return tablas.map((tabla) => {
    if (tabla.tabla_rota || !tabla.esComparativaAnual || tabla.esTablaTexto) return tabla;

    const anclaje = validarAnclajeTemporal(
      {
        cabecera: tabla.cabecera,
        filas: tabla.filas,
        titulo: tabla.titulo,
        apartado: tabla.apartado,
        esComparativaAnual: tabla.esComparativaAnual,
      },
      ejercicioExpediente
    );

    if (anclaje.ok) return tabla;

    return {
      ...tabla,
      tabla_rota: anclaje.tabla_rota ?? true,
      alerta_extraccion: anclaje.alerta_extraccion ?? true,
      errorParseo: anclaje.error ?? tabla.errorParseo,
      vacia: true,
    };
  });
}

/** Excel → CaseData.excel (solo metadatos numéricos para validación; no alimenta la vista). */
function mapCalcisFromLibro(libro?: LibroCierre): CalcisExcel | undefined {
  if (libro?.calcis) {
    const c = libro.calcis;
    const reserva = c.reservaCapitalizacion ?? mapCalcisReservaTracked(libro) ?? null;
    const ubicacionReserva = reserva?.origen.ubicacion;
    const filaMatch = ubicacionReserva?.match(/Fila:\s*(\d+)/);

    return {
      ...c,
      reservaCapitalizacion: reserva,
      epigrafeEtiqueta: ubicacionReserva,
      fila: filaMatch ? parseInt(filaMatch[1], 10) : undefined,
    };
  }

  const tracked = mapCalcisReservaTracked(libro);
  if (!tracked) return undefined;

  const ubicacion = tracked.origen.ubicacion;
  const hojaMatch = ubicacion.match(/Hoja:\s*([^/]+)/);
  const filaMatch = ubicacion.match(/Fila:\s*(\d+)/);
  const hoja = hojaMatch?.[1]?.trim() ?? "calcis";

  return {
    hoja,
    resultadoContable: null,
    ajustes: null,
    baseImponible: null,
    cuotaIntegra: null,
    retenciones: null,
    cuotaDiferencial: null,
    tipoImpositivo: null,
    reservaCapitalizacion: tracked,
    epigrafeEtiqueta: ubicacion,
    fila: filaMatch ? parseInt(filaMatch[1], 10) : undefined,
  };
}



export interface BuildCaseDataInput {

  expedienteId: string;

  cliente: string;

  ejercicio: number;

  tipoEmpresa: TipoEmpresa;

  balance?: BalanceNormalizado;

  sumasSaldos?: CuentaNormalizada[];

  libroCierre?: LibroCierre;

  memoria?: MemoriaNormalizada;

  priorYear?: {

    ejercicio: number;

    balance?: BalanceNormalizado;

    memoria?: MemoriaNormalizada;

  };

}



function memoriaToMemoryBlock(
  memoria: MemoriaNormalizada,
  ejercicioRef: number,
  tablasReferencia?: TablaMemoria[]
): CaseData["memory"] {
  const ejercicio = memoria.datosClave?.ejercicio ?? ejercicioRef;
  let tablasAncladas = anclarTablasAMemoria(memoria.tablas ?? [], ejercicioRef);
  tablasAncladas = marcarEstructurasTablasDiferentes(tablasAncladas);

  // Estructura 100 % Word: apartados, tablas, texto y cifras provienen del parseo de la memoria.
  return {
    sections: memoria.apartados,

    tables: tablasAncladas,

    statements: memoria.statements ?? [],

    figures: memoria.cifras,

    keyData: memoria.datosClave ?? {},

    years: memoria.anios ?? [],

    formal: memoria.formal,

    fullText: memoria.textoCompleto,

    metadata: memoria.metadata,

    propuestaAplicacion: extraerPropuestaAplicacion(memoria.textoCompleto, tablasAncladas, {

      documento: "memoria_actual",

      ejercicio,

    }),

    vinculadas: extraerVinculadas(memoria.textoCompleto, tablasAncladas, {
      documento: "memoria_actual",
      ejercicio,
    }),

  };

}



export function buildCaseData(input: BuildCaseDataInput): CaseData {

  const accounts = input.balance?.cuentas ?? input.sumasSaldos ?? [];



  const data: CaseData = {

    expedienteId: input.expedienteId,

    metadata: {

      cliente: input.cliente,

      ejercicio: input.ejercicio,

      tipoEmpresa: input.tipoEmpresa,

    },

    financials: {

      accounts,

      balance: input.balance,

      sumasSaldos: input.sumasSaldos,

      libroCierre: input.libroCierre,

    },

  };



  const calcis = mapCalcisFromLibro(input.libroCierre);

  if (calcis) {

    data.excel = { calcis };

  }



  if (input.memoria) {
    const tablasReferencia = input.priorYear?.memoria?.tablas
      ? anclarTablasAMemoria(input.priorYear.memoria.tablas, input.priorYear.ejercicio)
      : undefined;
    data.memory = memoriaToMemoryBlock(input.memoria, input.ejercicio, tablasReferencia);

    const memoriaYear = input.memoria.datosClave?.ejercicio;

    if (memoriaYear !== undefined && memoriaYear !== input.ejercicio) {

      console.warn(

        `[buildCaseData] Memoria asignada (${memoriaYear}) difiere del ejercicio de referencia (${input.ejercicio})`

      );

    }

  }



  if (input.priorYear) {

    const pyAccounts =

      input.priorYear.balance?.cuentas ?? [];

    data.priorYear = {

      ejercicio: input.priorYear.ejercicio,

      financials: {

        accounts: pyAccounts,

        balance: input.priorYear.balance,

      },

    };

    if (input.priorYear.memoria) {

      const pyMem = input.priorYear.memoria;

      const pyTablas = anclarTablasAMemoria(pyMem.tablas ?? [], input.priorYear.ejercicio);

      data.priorYear.memory = {

        sections: pyMem.apartados,

        figures: pyMem.cifras,

        fullText: pyMem.textoCompleto,

        keyData: pyMem.datosClave ?? {},

        tables: pyTablas,

        metadata: pyMem.metadata,

        propuestaAplicacion: extraerPropuestaAplicacion(pyMem.textoCompleto, pyTablas, {

          documento: "memoria_anterior",

          ejercicio: input.priorYear.ejercicio,

        }),

        vinculadas: extraerVinculadas(pyMem.textoCompleto, pyTablas, {
          documento: "memoria_anterior",
          ejercicio: input.priorYear.ejercicio,
        }),

      };

    }

  }



  return data;

}



/** Objeto plano compatible con paths legacy del evaluador custom */

export function caseDataToEvalContext(data: CaseData): Record<string, unknown> {

  const memoria = data.memory

    ? {

        apartados: data.memory.sections,

        tablas: data.memory.tables,

        cifras: data.memory.figures,

        datosClave: data.memory.keyData,

        anios: data.memory.years,

        formal: data.memory.formal,

        textoCompleto: data.memory.fullText,

        statements: data.memory.statements,

        metadata: data.memory.metadata,

      }

    : undefined;



  const ejercicioAnterior = data.priorYear

    ? {

        ejercicio: data.priorYear.ejercicio,

        balance: data.priorYear.financials.balance,

        memoria: data.priorYear.memory

          ? {

              apartados: data.priorYear.memory.sections,

              cifras: data.priorYear.memory.figures,

              textoCompleto: data.priorYear.memory.fullText,

            }

          : undefined,

      }

    : undefined;



  return {

    expedienteId: data.expedienteId,

    cliente: data.metadata.cliente,

    ejercicio: data.metadata.ejercicio,

    tipoEmpresa: data.metadata.tipoEmpresa,

    balance: data.financials.balance,

    sumasSaldos: data.financials.sumasSaldos,

    libroCierre: data.financials.libroCierre,

    excel: data.excel,

    financials: data.financials,

    memoria,

    memory: data.memory,

    ejercicioAnterior,

    priorYear: data.priorYear,

  };

}



export function getAccounts(data: CaseData): CuentaNormalizada[] {

  return data.financials.accounts.length > 0

    ? data.financials.accounts

    : data.financials.sumasSaldos ?? [];

}



export function hasStatement(

  data: CaseData,

  type: import("@/types/case-data").StatementType,

  absent = true

): boolean {

  const stmt = data.memory?.statements.find((s) => s.type === type);

  if (!stmt) return false;

  return absent ? stmt.value === true : stmt.value === false;

}



export function findSection(data: CaseData, keywords: string[]): boolean {

  const texto = data.memory?.fullText.toLowerCase() ?? "";

  return keywords.some((k) => texto.includes(k.toLowerCase()));

}


