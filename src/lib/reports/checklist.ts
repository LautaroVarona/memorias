export interface ReportValidation {
  ruleId: string;
  title?: string | null;
  categoria: string;
  severidad: string;
  mensaje: string;
  explanation?: string | null;
  normativa?: string | null;
  referencia?: string | null;
  evidencia: unknown[];
  sugerencia: string | null;
}

export type TipoMemoria = "normal" | "abreviada" | "pymes";
export type MemoryReviewBlockId = "normal" | "abreviada_pyme" | "pyme";

export type ControlPointStatus = "ok" | "issues" | "no_aplica" | "no_aplica_section" | "pending";

export interface MemoryReviewBlock {
  id: MemoryReviewBlockId;
  title: string;
  forTipoMemoria: TipoMemoria;
}

export interface ControlPoint {
  id: string;
  title: string;
  matchRule: (ruleId: string) => boolean;
  /** Si false, el punto se muestra como "No aplica" dentro del bloque activo. */
  applicableIn: Record<MemoryReviewBlockId, boolean>;
  /** Sin reglas en el motor: aviso de auditoría pendiente (PMP, DANA). */
  pendingIfNoRules?: boolean;
}

export const MEMORY_REVIEW_BLOCKS: MemoryReviewBlock[] = [
  { id: "normal", title: "Revisión Memoria Normal", forTipoMemoria: "normal" },
  { id: "abreviada_pyme", title: "Revisión Memoria Abreviada", forTipoMemoria: "abreviada" },
  { id: "pyme", title: "Revisión Memoria Pyme", forTipoMemoria: "pymes" },
];

export const CONTROL_POINTS: ControlPoint[] = [
  {
    id: "correlatividad",
    title: "Correlatividad y puntos obligatorios",
    matchRule: (id) =>
      id === "CIERRE_006" ||
      id === "CIERRE_010" ||
      id.startsWith("PGC_") ||
      id === "CIERRE_007" ||
      id === "CONSISTENCIA_GLOBAL_001" ||
      id.startsWith("TIPO_"),
    applicableIn: { normal: true, abreviada_pyme: true, pyme: true },
  },
  {
    id: "continuidad",
    title: "Continuidad respecto al ejercicio anterior",
    matchRule: (id) =>
      id.startsWith("INTER_") ||
      id === "TEMP_001" ||
      id === "TEMP_002" ||
      id.startsWith("NARR_ADV_"),
    applicableIn: { normal: true, abreviada_pyme: true, pyme: true },
  },
  {
    id: "distribucion",
    title: "Distribución de Resultados y Reserva de Capitalización",
    matchRule: (id) => id === "DIST_001" || id === "FIN_002",
    applicableIn: { normal: true, abreviada_pyme: false, pyme: false },
  },
  {
    id: "higiene",
    title: "Higiene Narrativa (frases cortadas, repetidas, espacios)",
    matchRule: (id) =>
      id === "FORMAL_001" ||
      id === "FORMAL_002" ||
      id === "FORMAL_003" ||
      id === "FORMAL_004",
    applicableIn: { normal: true, abreviada_pyme: true, pyme: true },
  },
  {
    id: "cuadres",
    title: "Cuadre de cuadros/tablas vs. Balance y N-1",
    matchRule: (id) =>
      id.startsWith("BAL_") ||
      id === "CIERRE_001" ||
      id === "CIERRE_002" ||
      id === "CIERRE_003" ||
      id === "CONSISTENCIA_GLOBAL_002" ||
      id.startsWith("ANOM_") ||
      id === "CROSS_002" ||
      id === "CROSS_003" ||
      id === "CROSS_004",
    applicableIn: { normal: true, abreviada_pyme: true, pyme: true },
  },
  {
    id: "vinculadas",
    title: "Información de operaciones vinculadas",
    matchRule: (id) => id === "CROSS_001" || id === "CIERRE_004",
    applicableIn: { normal: true, abreviada_pyme: true, pyme: true },
  },
  {
    id: "pmp",
    title: "Información sobre el periodo medio de pago (PMP)",
    matchRule: (id) => id.startsWith("LEGAL_") || id.startsWith("MOROSIDAD_"),
    applicableIn: { normal: true, abreviada_pyme: true, pyme: true },
    pendingIfNoRules: true,
  },
  {
    id: "conciliacion_calcis",
    title: "Conciliación Resultado con Base imponible (vs. CALCIS)",
    matchRule: (id) => id === "CIERRE_005" || id === "CROSS_005",
    applicableIn: { normal: true, abreviada_pyme: true, pyme: true },
  },
  {
    id: "info_fiscal",
    title: "Información fiscal (Situación Fiscal vs. CALCIS)",
    matchRule: (id) => id.startsWith("FISCAL_"),
    applicableIn: { normal: true, abreviada_pyme: true, pyme: true },
  },
  {
    id: "dana",
    title: "Información DANA",
    matchRule: (id) => id.startsWith("DANA_") || id === "TEMP_003",
    applicableIn: { normal: true, abreviada_pyme: true, pyme: true },
    pendingIfNoRules: true,
  },
  {
    id: "firmantes",
    title: "Firmantes",
    matchRule: (id) =>
      id === "CIERRE_008" ||
      id === "CIERRE_009" ||
      id === "CLOSURE_001" ||
      id === "TEMP_004",
    applicableIn: { normal: true, abreviada_pyme: true, pyme: true },
  },
];

const FALLBACK_POINT = CONTROL_POINTS[0];

export function assignControlPoint(ruleId: string): ControlPoint {
  for (const point of CONTROL_POINTS) {
    if (point.matchRule(ruleId)) return point;
  }
  return FALLBACK_POINT;
}

export function isBlockActive(
  block: MemoryReviewBlock,
  tipoMemoria: TipoMemoria | null | undefined
): boolean {
  const tipo = tipoMemoria ?? "normal";
  return block.forTipoMemoria === tipo;
}

export function getActiveReviewBlock(
  tipoMemoria: TipoMemoria | null | undefined
): MemoryReviewBlock {
  const tipo = tipoMemoria ?? "normal";
  return MEMORY_REVIEW_BLOCKS.find((b) => b.forTipoMemoria === tipo) ?? MEMORY_REVIEW_BLOCKS[0];
}

export function tipoMemoriaLabel(tipo: TipoMemoria | null | undefined): string {
  switch (tipo) {
    case "abreviada":
      return "Memoria abreviada";
    case "pymes":
      return "Memoria Pyme";
    case "normal":
    default:
      return "Memoria normal";
  }
}

export function parseEvidenciaPayload(
  evidencia: unknown[]
): { items: unknown[]; status?: string } {
  if (
    evidencia.length === 1 &&
    evidencia[0] &&
    typeof evidencia[0] === "object" &&
    !Array.isArray(evidencia[0])
  ) {
    const payload = evidencia[0] as Record<string, unknown>;
    if ("items" in payload || "status" in payload) {
      return {
        items: Array.isArray(payload.items) ? payload.items : [],
        status: typeof payload.status === "string" ? payload.status : undefined,
      };
    }
  }
  return { items: evidencia };
}

export function isNoAplicaValidation(v: ReportValidation): boolean {
  const text = (v.explanation ?? v.mensaje).toLowerCase();
  if (/no aplica/.test(text)) return true;
  const { status } = parseEvidenciaPayload(v.evidencia);
  return status === "skip";
}

export function validationsForPoint(
  point: ControlPoint,
  validaciones: ReportValidation[]
): ReportValidation[] {
  return validaciones.filter((v) => point.matchRule(v.ruleId));
}

export function resolveControlPointStatus(
  point: ControlPoint,
  blockId: MemoryReviewBlockId,
  blockActive: boolean,
  validaciones: ReportValidation[]
): { status: ControlPointStatus; issues: ReportValidation[] } {
  if (!blockActive) {
    return { status: "no_aplica_section", issues: [] };
  }

  if (!point.applicableIn[blockId]) {
    return { status: "no_aplica", issues: [] };
  }

  const matched = validationsForPoint(point, validaciones);
  const actionable = matched.filter((v) => !isNoAplicaValidation(v));

  if (actionable.length === 0) {
    if (matched.length > 0) {
      return { status: "no_aplica", issues: [] };
    }
    if (point.pendingIfNoRules) {
      return { status: "pending", issues: [] };
    }
    return { status: "ok", issues: [] };
  }

  const issues = actionable.filter((v) => v.severidad !== "pass");
  if (issues.length === 0) {
    return { status: "ok", issues: [] };
  }

  return { status: "issues", issues };
}

export function controlPointStatusLabel(status: ControlPointStatus): string {
  switch (status) {
    case "ok":
      return "[OK]";
    case "issues":
      return "[!]";
    case "no_aplica":
    case "no_aplica_section":
      return "—";
    case "pending":
      return "[!]";
  }
}

export function buildChecklistPath(
  blockTitle: string,
  pointTitle: string
): string {
  return `${blockTitle} › ${pointTitle}`;
}
