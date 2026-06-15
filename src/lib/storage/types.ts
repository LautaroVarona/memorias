export interface StoredExpediente {
  id: string;
  cliente: string;
  ejercicio: number;
  ejercicioAnteriorId?: string | null;
  tipoEmpresa?: string | null;
  estado: string;
  scoreSnapshot?: string | null;
  caseDataSnapshot?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredArchivo {
  id: string;
  expedienteId: string;
  tipo: string;
  nombre: string;
  metadata: string;
  createdAt: string;
}

export interface StoredValidacion {
  id: string;
  expedienteId: string;
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
  createdAt: string;
}

export interface StoredReglaCustom {
  id: string;
  nombre: string;
  expresion: string;
  severidad: string;
  activa: boolean;
  expedienteId: string | null;
  createdAt: string;
}

export interface ExpedienteListItem extends StoredExpediente {
  _count: { archivos: number; validaciones: number };
}
