"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Expediente {
  id: string;
  cliente: string;
  ejercicio: number;
  estado: string;
  tipoEmpresa: string | null;
  createdAt: string;
  _count: { archivos: number; validaciones: number };
}

export default function HomePage() {
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroEjercicio, setFiltroEjercicio] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroCliente) params.set("cliente", filtroCliente);
      if (filtroEjercicio) params.set("ejercicio", filtroEjercicio);
      if (filtroEstado) params.set("estado", filtroEstado);
      const data = await apiFetch<Expediente[]>(`/api/expedientes?${params}`);
      setExpedientes(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al cargar expedientes");
    } finally {
      setLoading(false);
    }
  }, [filtroCliente, filtroEjercicio, filtroEstado]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(e: Expediente) {
    const label = e.ejercicio > 0 ? `${e.cliente} — ${e.ejercicio}` : e.cliente;
    if (
      !window.confirm(
        `¿Eliminar el expediente "${label}"?\n\nSe borrarán los archivos subidos y todos los resultados de la revisión. Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    setDeletingId(e.id);
    try {
      await apiFetch(`/api/expedientes/${e.id}`, { method: "DELETE" });
      setExpedientes((prev) => prev.filter((x) => x.id !== e.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeletingId(null);
    }
  }

  const estadoBadge = (estado: string) => {
    const styles: Record<string, string> = {
      borrador: "bg-slate-100 text-slate-700",
      procesando: "bg-blue-100 text-blue-700",
      revisado: "bg-emerald-100 text-emerald-700",
    };
    return (
      <span className={`rounded px-2 py-0.5 text-xs font-medium ${styles[estado] || ""}`}>
        {estado}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Expedientes</h1>
          <p className="text-sm text-slate-500">Revisión de cierres y memorias anuales</p>
        </div>
        <Link
          href="/expedientes/new"
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          Nuevo expediente
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Filtrar por cliente..."
          value={filtroCliente}
          onChange={(e) => setFiltroCliente(e.target.value)}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <input
          type="number"
          placeholder="Ejercicio"
          value={filtroEjercicio}
          onChange={(e) => setFiltroEjercicio(e.target.value)}
          className="w-28 rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="borrador">Borrador</option>
          <option value="procesando">Procesando</option>
          <option value="revisado">Revisado</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : expedientes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-slate-600">No hay expedientes todavía</p>
          <Link href="/expedientes/new" className="mt-2 inline-block text-sm text-blue-700 hover:underline">
            Crear el primero
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Ejercicio</th>
                <th className="px-4 py-2 font-medium">Tipo empresa</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Archivos</th>
                <th className="px-4 py-2 font-medium">Validaciones</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {expedientes.map((e) => (
                <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{e.cliente}</td>
                  <td className="px-4 py-2">{e.ejercicio > 0 ? e.ejercicio : "—"}</td>
                  <td className="px-4 py-2 capitalize text-slate-600">{e.tipoEmpresa || "—"}</td>
                  <td className="px-4 py-2">{estadoBadge(e.estado)}</td>
                  <td className="px-4 py-2 text-slate-600">{e._count.archivos}</td>
                  <td className="px-4 py-2 text-slate-600">{e._count.validaciones}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <Link href={`/expedientes/${e.id}`} className="text-blue-700 hover:underline">
                        Revisar
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(e)}
                        disabled={deletingId === e.id}
                        className="text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        {deletingId === e.id ? "Eliminando..." : "Eliminar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
