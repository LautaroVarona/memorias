export type IssueSeverity = "critical" | "warning" | "pass";

export interface EvidenceItem {
  type?: string;
  tipo?: string;
  reference?: string;
  referencia?: string;
  value?: string | number;
  valor?: string | number;
  formattedValue?: string;
  text?: string;
  detalle?: string;
  importance?: "high" | "medium" | "low";
}

export interface ValidacionView {
  id: string;
  ruleId: string;
  title?: string | null;
  categoria: string;
  severidad: string;
  mensaje: string;
  explanation?: string | null;
  diagnosis?: string | null;
  normativa?: string | null;
  referencia?: string | null;
  evidencia: EvidenceItem[];
  sugerencia: string | null;
  tags?: string[];
}

export interface ParsedIssue {
  what: string;
  impact: string;
  action: string;
  diagnosis?: string;
  excelValue?: string;
  memoryValue?: string;
  keyFact?: string;
}
