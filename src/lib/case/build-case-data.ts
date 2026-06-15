import type { CaseData } from "@/types/case-data";
import type {
  BalanceNormalizado,
  CuentaNormalizada,
  LibroCierre,
  MemoriaNormalizada,
  TipoEmpresa,
} from "@/types/domain";

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

function memoriaToMemoryBlock(memoria: MemoriaNormalizada): CaseData["memory"] {
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

  if (input.memoria) {
    data.memory = memoriaToMemoryBlock(input.memoria);
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
      data.priorYear.memory = {
        sections: input.priorYear.memoria.apartados,
        figures: input.priorYear.memoria.cifras,
        fullText: input.priorYear.memoria.textoCompleto,
        keyData: input.priorYear.memoria.datosClave ?? {},
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
