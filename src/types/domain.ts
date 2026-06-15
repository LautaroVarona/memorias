export type TipoEmpresa = "holding" | "comercial" | "industrial" | "desconocido";
export type Severidad = "critical" | "warning" | "pass";
export type RuleCategory =
  | "balance"
  | "coherence"
  | "cross"
  | "pgc"
  | "fiscal"
  | "formal"
  | "interannual"
  | "narrative"
  | "custom";

export type TipoArchivo =
  | "excel_balance"
  | "excel_sumas"
  | "excel_cierre"
  | "memoria_word"
  | "memoria_pdf"
  | "excel_anterior";

export interface Partida {
  cuenta: string;
  descripcion: string;
  importe: number;
  nivel: number;
  fila?: number;
  hoja?: string;
}

export interface CuentaNormalizada {
  cuenta: string;
  descripcion: string;
  debe: number;
  haber: number;
  saldo: number;
  nivel: number;
  grupoPGC: "activo" | "pasivo" | "patrimonio" | "ingreso" | "gasto" | "otro";
  fila?: number;
  hoja?: string;
}

export interface SeccionBalance {
  total: number;
  partidas: Partida[];
}

export interface BalanceNormalizado {
  activo: SeccionBalance;
  pasivo: SeccionBalance;
  patrimonioNeto: SeccionBalance;
  resultado: number;
  cuentas: CuentaNormalizada[];
  metadata: {
    archivo: string;
    hoja: string;
    filasProcesadas: number;
    formatoDetectado: string;
  };
}

export interface ApartadoMemoria {
  id: string;
  titulo: string;
  contenido: string;
  obligatorio: boolean;
  /** Número de apartado si la memoria usa la numeración canónica "NN Título" */
  numero?: number;
}

export interface TablaMemoria {
  /** Número del apartado al que pertenece (p. ej. "04"), si se pudo determinar */
  apartado?: string;
  /** Línea de texto inmediatamente anterior a la tabla (suele describirla) */
  titulo: string;
  /** Primera fila (cabecera) */
  cabecera: string[];
  filas: string[][];
  /** true si las celdas de datos están todas vacías */
  vacia: boolean;
  linea: number;
}

export interface AnioMencionado {
  anio: number;
  contexto: string;
  /** true si parece referencia normativa (Ley 16/2012, RD, artículo...) */
  esReferenciaLegal: boolean;
}

export interface DatosClaveMemoria {
  denominacion?: string;
  nif?: string;
  /** Ejercicio al que se refiere la memoria, deducido del contenido */
  ejercicio?: number;
  tipoMemoria?: "abreviada" | "pymes" | "normal";
  fechaCierre?: string;
  impuestoCorriente?: number;
  impuestoCorrienteAnterior?: number;
  basesImponiblesNegativasPendientes?: number;
  empleoMedio?: number;
  empleoMedioAnterior?: number;
  pmpDias?: number;
  pmpDiasAnterior?: number;
  fechaFormulacion?: string;
  firmante?: string;
}

export interface CifrasMemoria {
  activoTotal?: number;
  pasivoTotal?: number;
  patrimonioNeto?: number;
  resultadoEjercicio?: number;
  impuestoSociedades?: number;
  activosFinancieros?: number;
  provisiones?: number;
  reservas?: number;
}

export interface FormalMemoria {
  tienePortada: boolean;
  tieneFirma: boolean;
  camposVacios: string[];
  apartadosRepetidos: string[];
  frasesCortadas: string[];
  textoExtraible: boolean;
}

export interface MemoriaNormalizada {
  apartados: ApartadoMemoria[];
  tablas: TablaMemoria[];
  statements?: import("./case-data").MemoryStatement[];
  cifras: CifrasMemoria;
  formal: FormalMemoria;
  datosClave: DatosClaveMemoria;
  anios: AnioMencionado[];
  textoCompleto: string;
  metadata: {
    paginas: number;
    archivo: string;
    formato?: string;
  };
}

export interface EpigrafeComparativo {
  etiqueta: string;
  actual: number;
  anterior: number;
  hoja: string;
  fila: number;
}

export interface NotaDespacho {
  hoja: string;
  concepto: string;
  detalle?: string;
  /** true si el despacho lo dejó marcado como pendiente de revisar/comprobar */
  pendiente: boolean;
  fila: number;
}

/** Epígrafes extraídos de hojas ministeriales auxiliares (inmovilizado, calcis, etc.) */
export interface HojaMinisterio {
  nombre: string;
  filas: number;
  epigrafes: EpigrafeComparativo[];
}

/** Datos extraídos del libro de cierre .xlsm del despacho */
export interface LibroCierre {
  cliente?: string;
  ejercicio?: number;
  ejercicioAnterior?: number;
  fechaCierre?: string;
  /** Sumas y saldos (hoja Sys4_digital) */
  sumasSaldos: CuentaNormalizada[];
  /** Agregado a 4 dígitos de Sys4_digital */
  cuentas4: CuentaNormalizada[];
  /** @deprecated Reservado; los libros actuales no incluyen hoja A3SOC */
  a3soc: CuentaNormalizada[];
  balanceEpigrafes: EpigrafeComparativo[];
  pygEpigrafes: EpigrafeComparativo[];
  /** @deprecated Reservado; los libros actuales no incluyen PENDIENTES/INCIDENCIAS */
  notas: NotaDespacho[];
  /** Hojas ministeriales auxiliares (inmovilizado, ajuis, calcis, bonificación, etc.) */
  hojasMinisterio?: HojaMinisterio[];
  /** Hojas del libro que se han leído (solo whitelist) */
  hojasDetectadas: string[];
}

export interface Evidencia {
  tipo: "excel" | "memoria" | "comparacion" | "sistema";
  referencia: string;
  valor?: string | number;
  detalle?: string;
}

export interface RuleResult {
  ruleId: string;
  title: string;
  categoria: RuleCategory;
  type: RuleCategory;
  severidad: Severidad;
  severity: "critical" | "error" | "warning" | "ok";
  mensaje: string;
  explanation: string;
  /** Causa probable del problema */
  diagnosis?: string;
  /** Por qué importa (1 línea) */
  impact?: string;
  /** Qué hacer (1 línea) */
  action?: string;
  /** Etiquetas: riesgo_fiscal, cross-document, etc. */
  tags?: string[];
  evidencia: Evidencia[];
  evidence: import("./case-data").Evidence[];
  normativa?: string;
  referencia?: string;
  sugerencia?: string;
  /** Nivel de warning para scoring: high=-10, low=-5 */
  warningLevel?: "high" | "medium" | "low";
}

export type ValidationContext = import("./case-data").CaseData;

export interface CustomRuleExpression {
  field: string;
  operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "contains" | "empty";
  compareTo?: string | number;
  tolerance?: number;
  message: string;
}

export interface ResumenValidacion {
  critical: number;
  warning: number;
  pass: number;
  total: number;
  errores?: number;
  warnings?: number;
}

export type { CaseData, CaseScore, Evidence, MemoryStatement, RuleType } from "./case-data";
