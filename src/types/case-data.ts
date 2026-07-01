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
import type { DataOrigen, TrackingValue } from "./tracking";

export type { DataOrigen, DocumentoOrigen, TrackingValue } from "./tracking";
export { isTrackingValue, unwrapValue, trackingValue } from "./tracking";

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
  /** Apartado de memoria (p. ej. "09") */
  section?: string;
  /** Título del apartado (p. ej. "Operaciones con partes vinculadas") */
  sectionTitle?: string;
  /** Etiqueta de fila en tabla de memoria (p. ej. "Clientes con partes vinculadas") */
  rowLabel?: string;
  /** Resumen para acordeones Excel (p. ej. "Suma de saldos de cierre (Cuentas 433/434)") */
  summaryLabel?: string;
  /** Texto del ejercicio anterior para comparativa interanual */
  diffPrior?: string;
  /** Texto del ejercicio actual para comparativa interanual */
  diffCurrent?: string;
  /** Procedencia exacta del dato para trazabilidad en UI */
  origen?: DataOrigen;
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

import type { CalcisData } from "@/types/domain";

/** Vista de CALCIS en CaseData (alias de CalcisData con campos legacy) */
export type CalcisExcel = CalcisData & {
  /** @deprecated Usar reservaCapitalizacion?.origen.ubicacion */
  epigrafeEtiqueta?: string;
  /** @deprecated Usar reservaCapitalizacion?.origen.ubicacion */
  fila?: number;
};

export type VinculadasCategoria = "clientes" | "proveedores" | "prestamos" | "otro";

/** Importe trazado de una fila en tablas de saldos con partes vinculadas */
export interface ImporteVinculadasFila {
  clave: string;
  descripcion: string;
  tabla: string;
  categoria: VinculadasCategoria;
  ejercicioActual?: TrackingValue<number>;
  ejercicioAnterior?: TrackingValue<number>;
}

/** Saldos con partes vinculadas extraídos de tablas de memoria (apartado 09 / saldos pendientes) */
export interface VinculadasMemoria {
  tieneApartado: boolean;
  filas: ImporteVinculadasFila[];
  totalActual: number;
  clientesGrupo: number;
  proveedoresGrupo: number;
  prestamos: number;
}

/** Propuesta de aplicación del resultado (memoria Normal) */
export interface PropuestaAplicacion {
  tieneApartado: boolean;
  reservaIndisponible?: TrackingValue<number>;
  reservaIndisponibleAnterior?: TrackingValue<number>;
  reservasVoluntarias?: TrackingValue<number>;
  reservasVoluntariasAnterior?: TrackingValue<number>;
  totalAplicacion?: TrackingValue<number>;
  resultadoEjercicio?: TrackingValue<number>;
  resultadoEjercicioAnterior?: TrackingValue<number>;
}

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
  /** Vista estructurada de datos Excel auxiliares (p. ej. hoja CALCIS) */
  excel?: {
    calcis?: CalcisExcel;
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
    propuestaAplicacion?: PropuestaAplicacion;
    vinculadas?: VinculadasMemoria;
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
      tables?: TablaMemoria[];
      metadata?: MemoriaNormalizada["metadata"];
      propuestaAplicacion?: PropuestaAplicacion;
      vinculadas?: VinculadasMemoria;
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
