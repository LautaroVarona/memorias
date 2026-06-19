import type { CaseData, CalcisExcel } from "@/types/case-data";
import type {
  BalanceNormalizado,
  CuentaNormalizada,
  LibroCierre,
  MemoriaNormalizada,
  TipoEmpresa,
} from "@/types/domain";
import { extraerPropuestaAplicacion, extraerVinculadas } from "@/lib/parsers/memoria/extractors";
import { mapCalcisReservaTracked } from "@/lib/tracking/excel";

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

  ejercicioRef: number

): CaseData["memory"] {

  const ejercicio = memoria.datosClave?.ejercicio ?? ejercicioRef;

  return {

    sections: memoria.apartados,

    tables: memoria.tablas ?? [],

    statements: memoria.statements ?? [],

    figures: memoria.cifras,

    keyData: memoria.datosClave ?? {},

    years: memoria.anios ?? [],

    formal: memoria.formal,

    fullText: memoria.textoCompleto,

    metadata: memoria.metadata,

    propuestaAplicacion: extraerPropuestaAplicacion(memoria.textoCompleto, memoria.tablas ?? [], {

      documento: "memoria_actual",

      ejercicio,

    }),

    vinculadas: extraerVinculadas(memoria.textoCompleto, memoria.tablas ?? [], {

      documento: "memoria_actual",

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

    data.memory = memoriaToMemoryBlock(input.memoria, input.ejercicio);

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

      data.priorYear.memory = {

        sections: pyMem.apartados,

        figures: pyMem.cifras,

        fullText: pyMem.textoCompleto,

        keyData: pyMem.datosClave ?? {},

        tables: pyMem.tablas ?? [],

        propuestaAplicacion: extraerPropuestaAplicacion(pyMem.textoCompleto, pyMem.tablas ?? [], {

          documento: "memoria_anterior",

          ejercicio: input.priorYear.ejercicio,

        }),

        vinculadas: extraerVinculadas(pyMem.textoCompleto, pyMem.tablas ?? [], {

          documento: "memoria_anterior",

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


