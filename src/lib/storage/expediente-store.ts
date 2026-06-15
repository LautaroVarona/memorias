import { classifyByExtension } from "@/lib/process/classify-extension";
import {
  idbDelete,
  idbDeleteBlob,
  idbDeleteByIndex,
  idbGet,
  idbGetAll,
  idbGetAllByIndex,
  idbGetBlob,
  idbPut,
  idbPutBlob,
} from "@/lib/storage/indexed-db";
import type {
  ExpedienteListItem,
  StoredArchivo,
  StoredExpediente,
  StoredReglaCustom,
  StoredValidacion,
} from "@/lib/storage/types";

function newId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function listExpedientes(filters?: {
  cliente?: string;
  ejercicio?: number;
  estado?: string;
}): Promise<ExpedienteListItem[]> {
  const [expedientes, archivos, validaciones] = await Promise.all([
    idbGetAll<StoredExpediente>("expedientes"),
    idbGetAll<StoredArchivo>("archivos"),
    idbGetAll<StoredValidacion>("validaciones"),
  ]);

  const archivoCount = new Map<string, number>();
  const validacionCount = new Map<string, number>();
  for (const a of archivos) {
    archivoCount.set(a.expedienteId, (archivoCount.get(a.expedienteId) ?? 0) + 1);
  }
  for (const v of validaciones) {
    validacionCount.set(v.expedienteId, (validacionCount.get(v.expedienteId) ?? 0) + 1);
  }

  let result = expedientes.map((e) => ({
    ...e,
    _count: {
      archivos: archivoCount.get(e.id) ?? 0,
      validaciones: validacionCount.get(e.id) ?? 0,
    },
  }));

  if (filters?.cliente) {
    const q = filters.cliente.toLowerCase();
    result = result.filter((e) => e.cliente.toLowerCase().includes(q));
  }
  if (filters?.ejercicio) {
    result = result.filter((e) => e.ejercicio === filters.ejercicio);
  }
  if (filters?.estado) {
    result = result.filter((e) => e.estado === filters.estado);
  }

  return result.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getExpediente(id: string): Promise<StoredExpediente | undefined> {
  return idbGet<StoredExpediente>("expedientes", id);
}

export async function createExpediente(data?: {
  cliente?: string;
  ejercicio?: number;
}): Promise<StoredExpediente> {
  const ts = nowIso();
  const expediente: StoredExpediente = {
    id: newId(),
    cliente: data?.cliente?.trim() || "Pendiente de identificar",
    ejercicio: data?.ejercicio ?? 0,
    estado: "borrador",
    createdAt: ts,
    updatedAt: ts,
  };
  await idbPut("expedientes", expediente);
  return expediente;
}

export async function updateExpediente(
  id: string,
  patch: Partial<StoredExpediente>
): Promise<StoredExpediente> {
  const existing = await getExpediente(id);
  if (!existing) throw new Error("Expediente no encontrado");
  const updated: StoredExpediente = {
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: nowIso(),
  };
  await idbPut("expedientes", updated);
  return updated;
}

export async function deleteExpediente(id: string): Promise<void> {
  const archivos = await listArchivos(id);
  for (const archivo of archivos) {
    await idbDeleteBlob(archivo.id);
    await idbDelete("archivos", archivo.id);
  }
  await idbDeleteByIndex("validaciones", "expedienteId", id);
  await idbDelete("expedientes", id);
}

export async function listArchivos(expedienteId: string): Promise<StoredArchivo[]> {
  return idbGetAllByIndex<StoredArchivo>("archivos", "expedienteId", expedienteId);
}

export async function getArchivoBlob(archivoId: string): Promise<ArrayBuffer | undefined> {
  return idbGetBlob(archivoId);
}

export async function addArchivos(expedienteId: string, files: File[]): Promise<StoredArchivo[]> {
  const expediente = await getExpediente(expedienteId);
  if (!expediente) throw new Error("Expediente no encontrado");

  const existing = await listArchivos(expedienteId);
  const uploaded: StoredArchivo[] = [];

  for (const file of files) {
    if (!file.size) continue;

    const dup = existing.find((a) => a.nombre === file.name);
    if (dup) {
      uploaded.push(dup);
      continue;
    }

    const id = newId();
    const tipo = classifyByExtension(file.name);
    const buffer = await file.arrayBuffer();
    const archivo: StoredArchivo = {
      id,
      expedienteId,
      tipo,
      nombre: file.name,
      metadata: JSON.stringify({ size: file.size, tipo, clasificacion: "extension" }),
      createdAt: nowIso(),
    };

    await idbPutBlob(id, buffer);
    await idbPut("archivos", archivo);
    uploaded.push(archivo);
  }

  if (!uploaded.length) throw new Error("No se enviaron archivos");
  await updateExpediente(expedienteId, { estado: "borrador" });
  return uploaded;
}

export async function listValidaciones(expedienteId: string): Promise<StoredValidacion[]> {
  return idbGetAllByIndex<StoredValidacion>("validaciones", "expedienteId", expedienteId);
}

export async function saveValidaciones(
  expedienteId: string,
  validaciones: Omit<StoredValidacion, "id" | "expedienteId" | "createdAt">[]
): Promise<void> {
  await idbDeleteByIndex("validaciones", "expedienteId", expedienteId);
  const ts = nowIso();
  for (const v of validaciones) {
    await idbPut("validaciones", {
      ...v,
      id: newId(),
      expedienteId,
      createdAt: ts,
    });
  }
}

export async function listReglas(expedienteId?: string): Promise<StoredReglaCustom[]> {
  const all = await idbGetAll<StoredReglaCustom>("reglas");
  if (!expedienteId) return all;
  return all.filter((r) => r.expedienteId === null || r.expedienteId === expedienteId);
}

export async function createRegla(data: {
  nombre: string;
  expresion: string;
  severidad: string;
  expedienteId?: string | null;
}): Promise<StoredReglaCustom> {
  const regla: StoredReglaCustom = {
    id: newId(),
    nombre: data.nombre,
    expresion: data.expresion,
    severidad: data.severidad,
    activa: true,
    expedienteId: data.expedienteId ?? null,
    createdAt: nowIso(),
  };
  await idbPut("reglas", regla);
  return regla;
}

export async function updateRegla(
  id: string,
  patch: Partial<Pick<StoredReglaCustom, "activa" | "nombre" | "expresion" | "severidad">>
): Promise<StoredReglaCustom> {
  const existing = await idbGet<StoredReglaCustom>("reglas", id);
  if (!existing) throw new Error("Regla no encontrada");
  const updated = { ...existing, ...patch };
  await idbPut("reglas", updated);
  return updated;
}

export async function deleteRegla(id: string): Promise<void> {
  await idbDelete("reglas", id);
}

export async function updateArchivoMetadata(
  id: string,
  patch: { tipo?: string; metadata?: string }
): Promise<void> {
  const existing = await idbGet<StoredArchivo>("archivos", id);
  if (!existing) return;
  await idbPut("archivos", { ...existing, ...patch });
}
