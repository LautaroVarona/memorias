"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Dropzone } from "@/components/upload/Dropzone";
import { createExpedienteAndUpload } from "@/lib/upload-client";

function NewExpedienteForm() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length || loading) return;

    setError("");
    setProgress("");
    setLoading(true);

    try {
      await createExpedienteAndUpload(files, setProgress);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir archivos");
      setLoading(false);
      setProgress("");
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/" className="text-sm text-blue-700 hover:underline">
          ← Volver a expedientes
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Nuevo expediente</h1>
        <p className="mt-1 text-sm text-slate-600">
          Suba el libro de cierre (.xlsm) y las memorias (.doc). El cliente y el ejercicio
          de cada documento se detectan automáticamente al procesar.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-6"
      >
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Archivos</label>
          <Dropzone onFilesSelected={setFiles} disableInteraction={loading} />
          {files.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              {files.length} archivo(s) listo(s) para subir. Puedes seguir añadiendo más
              arrastrando o seleccionando otro archivo antes de pulsar el botón.
            </p>
          )}
        </div>

        {(error || urlError) && (
          <p className="text-sm text-red-600">{error || urlError}</p>
        )}

        {loading && progress && (
          <p className="text-sm text-slate-500">{progress}</p>
        )}

        {loading && !progress && (
          <p className="text-sm text-slate-500">Preparando subida…</p>
        )}

        <button
          type="submit"
          disabled={loading || files.length === 0}
          className="w-full rounded-lg bg-blue-700 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {loading ? "Subiendo…" : "Subir y revisar"}
        </button>
      </form>
    </div>
  );
}

export default function NewExpedientePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Cargando…</div>}>
      <NewExpedienteForm />
    </Suspense>
  );
}
