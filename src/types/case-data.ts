import type {
  AnioMencionado,
  ApartadoMemoria,
  BalanceNormalizado,
  CifrasMemoria,
  CuentaNormalizada,
  DatosClaveMemoria,
  FormalMemoria,
  LibroCierre,
  MemoriaNormalizada,
  TablaMemoria,
  TipoEmpresa,
} from "./domain";

export type StatementType =
  | "vinculadas"
  | "riesgos"
  | "provisiones"
  | "criterios"
  | "deuda"
  | "actividad"
  | "continuidad"
  | "cambios_contables"
  | "bases_negativas"
  | "incentivos_fiscales";

export interface MemoryStatement {
  type: StatementType;
  /** true = afirma ausencia; false = afirma existencia */
  value: boolean;
  sourceText?: string;
}

export type EvidenceImportance = "high" | "medium" | "low";

export interface Evidence {
  type: "excel" | "memory";
  reference: string;
  value?: number;
  formattedValue?: string;
  text?: string;
  importance?: EvidenceImportance;
  documentName?: string;
  page?: number;
  sheet?: string;
  row?: number;
  column?: string;
  /** Agrupación opcional para desgloses (p. ej. CROSS_001) */
  group?: string;
}

export type RuleType =
  | "cross"
  | "balance"
  | "fiscal"
  | "pgc"
  | "formal"
  | "interannual"
  | "narrative"
  | "custom";

export type RuleSeverity = "critical" | "error" | "warning" | "ok";

export interface CaseData {
  expedienteId: string;
  metadata: {
    cliente: string;
    ejercicio: number;
    tipoEmpresa: TipoEmpresa;
  };
  financials: {
    accounts: CuentaNormalizada[];
    balance?: BalanceNormalizado;
    sumasSaldos?: CuentaNormalizada[];
    /** Datos del libro de cierre .xlsm del despacho, si se subió */
    libroCierre?: LibroCierre;
  };
  memory?: {
    sections: ApartadoMemoria[];
    tables: TablaMemoria[];
    statements: MemoryStatement[];
    figures: CifrasMemoria;
    keyData: DatosClaveMemoria;
    years: AnioMencionado[];
    formal: FormalMemoria;
    fullText: string;
    metadata: MemoriaNormalizada["metadata"];
  };
  priorYear?: {
    ejercicio: number;
    financials: {
      accounts: CuentaNormalizada[];
      balance?: BalanceNormalizado;
    };
    memory?: {
      sections: ApartadoMemoria[];
      figures: CifrasMemoria;
      fullText: string;
      keyData?: DatosClaveMemoria;
    };
  };
}

/** Estado global del cierre: formulable, con ajustes o bloqueado */
export type GlobalEstado = "ok" | "revisar" | "no_formulable";

export interface CaseScore {
  score: number;
  errores: number;
  warnings: number;
  criticos?: number;
  /** @deprecated Usar globalEstado — se mantiene por compatibilidad */
  estado: GlobalEstado;
  globalEstado: GlobalEstado;
  motivoGlobal?: string;
  passedPct: number;
  weightedPassedPct?: number;
  /** Penalización adicional por inconsistencias graves cross-document */
  penalizacionCross?: number;
}
