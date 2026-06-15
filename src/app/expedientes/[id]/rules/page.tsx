"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  createRegla,
  deleteRegla,
  listReglas,
  updateRegla,
} from "@/lib/storage/expediente-store";
import type { StoredReglaCustom } from "@/lib/storage/types";

const DEFAULT_EXPRESSION = `{
  "field": "balance.activo.total",
  "operator": "eq",
  "compareTo": "memoria.cifras.activoTotal",
  "tolerance": 1,
  "message": "El activo de la memoria no coincide con el Excel"
}`;

export default function CustomRulesPage() {
  const { id } = useParams<{ id: string }>();
  const [rules, setRules] = useState<StoredReglaCustom[]>([]);
  const [nombre, setNombre] = useState("");
  const [expresion, setExpresion] = useState(DEFAULT_EXPRESSION);
  const [severidad, setSeveridad] = useState("warning");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setRules(await listReglas(id));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    try {
      JSON.parse(expresion);
    } catch {
      setError("La expresión no es JSON válido");
      return;
    }

    try {
      await createRegla({ nombre, expresion, severidad, expedienteId: id });
      setNombre("");
      setExpresion(DEFAULT_EXPRESSION);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear regla");
    }
  }

  async function toggleActiva(rule: StoredReglaCustom) {
    await updateRegla(rule.id, { activa: !rule.activa });
    await load();
  }

  async function handleDelete(ruleId: string) {
    await deleteRegla(ruleId);
    await load();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href={`/expedientes/${id}`} className="text-sm text-blue-700 hover:underline">
          ← Volver al expediente
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Reglas personalizadas</h1>
        <p className="text-sm text-slate-500">
          Defina validaciones adicionales en formato JSON sobre el contexto de validación.
        </p>
      </div>

      <form onSubmit={handleCreate} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <div>
          <label className="block text-sm font-medium">Nombre</label>
          <input
            type="text"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Expresión JSON</label>
          <textarea
            required
            rows={8}
            value={expresion}
            onChange={(e) => setExpresion(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
          />
          <p className="mt-1 text-xs text-slate-500">
            Operadores: eq, neq, gt, lt, gte, lte, contains, empty. Campos: balance.*, memoria.cifras.*, sumasSaldos
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium">Severidad</label>
          <select
            value={severidad}
            onChange={(e) => setSeveridad(e.target.value)}
            className="mt-1 rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="warning">Advertencia</option>
            <option value="critical">Crítico</option>
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          Añadir regla
        </button>
      </form>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">Reglas activas ({rules.length})</h2>
        {rules.length === 0 ? (
          <p className="text-sm text-slate-500">Sin reglas personalizadas</p>
        ) : (
          rules.map((r) => (
            <div
              key={r.id}
              className="flex items-start justify-between rounded-lg border border-slate-200 bg-white p-4"
            >
              <div>
                <p className="font-medium text-sm">{r.nombre}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {r.severidad} · {r.activa ? "Activa" : "Inactiva"}
                  {r.expedienteId ? " · Expediente" : " · Global"}
                </p>
                <pre className="mt-2 text-xs text-slate-600 overflow-x-auto">{r.expresion}</pre>
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
                <button
                  onClick={() => toggleActiva(r)}
                  className="text-xs text-blue-700 hover:underline"
                >
                  {r.activa ? "Desactivar" : "Activar"}
                </button>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
