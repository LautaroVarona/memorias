"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ReviewDashboard } from "@/components/review/ReviewDashboard";
import type { ValidacionView } from "@/components/review/types";
import { Dropzone } from "@/components/upload/Dropzone";
import {
  fetchExpedienteDetail,
  removeExpediente,
  runExpedienteProcess,
  type ExpedienteDetail,
} from "@/lib/expediente-client";
import { clientLogger } from "@/lib/logger/client";
import { downloadExcelReport, openHtmlReport } from "@/lib/reports/download";
import { uploadToExpediente } from "@/lib/upload-client";

const log = clientLogger.child({ module: "expediente-detail" });

export function ExpedienteDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoProcess = searchParams.get("process") === "1";
  const urlError = searchParams.get("error");
  const autoProcessStarted = useRef(false);

  const [data, setData] = useState<ExpedienteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchExpedienteDetail(id);
      setData(result);
      if (!result) {
        setError("Expediente no encontrado");
      }
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "No se pudo cargar el expediente");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleProcess = useCallback(async () => {
    setProcessing(true);
    setError("");
    setProcessProgress("");
    log.info("iniciando revisión manual", { expedienteId: id });
    try {
      await runExpedienteProcess(id, setProcessProgress);
      log.info("revisión completada", { expedienteId: id });
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al procesar";
      log.error("revisión falló", { expedienteId: id, error: message });
      setError(message);
    } finally {
      setProcessing(false);
      setProcessProgress("");
    }
  }, [id, load]);

  useEffect(() => {
    if (!autoProcess || autoProcessStarted.current || loading || !data) return;
    if (data.archivos.length > 0 && data.validaciones.length === 0 && !processing) {
      autoProcessStarted.current = true;
      router.replace(`/expedientes/${id}`, { scroll: false });
      void handleProcess();
    }
  }, [autoProcess, data, handleProcess, id, loading, processing, router]);

  async function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFiles.length || uploading) return;
    setUploading(true);
    setUploadProgress("");
    setError("");
    try {
      await uploadToExpediente(id, uploadFiles, setUploadProgress);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir archivos");
      setUploading(false);
      setUploadProgress("");
    }
  }

  async function handleDelete() {
    if (!data) return;
    const label =
      data.ejercicio > 0 ? `${data.cliente} — ${data.ejercicio}` : data.cliente;
    if (
      !window.confirm(
        `¿Eliminar el expediente "${label}"?\n\nSe borrarán los archivos y todos los resultados. Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    setDeleting(true);
    setError("");
    try {
      await removeExpediente(id);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-slate-400">Cargando expediente…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
        <p className="text-red-600">{error || "Expediente no encontrado"}</p>
        <Link href="/" className="text-sm text-blue-700 hover:underline">
          ← Volver a expedientes
        </Link>
      </div>
    );
  }

  const hasResults = data.validaciones.length > 0;
  const errores = data.score?.errores ?? data.resumen.critical;
  const warnings = data.score?.warnings ?? data.resumen.warning;
  const memoriaSections = data.caseData?.memory?.sections ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
          ← Expedientes
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/expedientes/${id}/rules`}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Reglas
          </Link>
          <button
            type="button"
            onClick={() => openHtmlReport(data)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            HTML
          </button>
          <button
            type="button"
            onClick={() => void downloadExcelReport(data)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Excel
          </button>
          <button
            type="button"
            onClick={() => setShowUpload(!showUpload)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            {showUpload ? "Cerrar" : "Añadir archivos"}
          </button>
          <button
            onClick={() => void handleProcess()}
            disabled={processing || deleting || data.archivos.length === 0}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
          >
            {processing ? "Revisando…" : "Revisar de nuevo"}
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting || processing}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            {deleting ? "Eliminando…" : "Eliminar"}
          </button>
        </div>
      </div>

      {(error || urlError) && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error || urlError}
        </div>
      )}

      {processing && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {processProgress || "Ejecutando revisión automática… puede tardar unos segundos con archivos grandes."}
        </div>
      )}

      {showUpload && (
        <form onSubmit={handleUploadSubmit} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <Dropzone onFilesSelected={setUploadFiles} disableInteraction={uploading} />
          {uploadProgress && <p className="text-sm text-slate-500">{uploadProgress}</p>}
          <button
            type="submit"
            disabled={uploading || uploadFiles.length === 0}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {uploading ? "Subiendo…" : "Subir archivos"}
          </button>
        </form>
      )}

      {hasResults ? (
        <ReviewDashboard
          cliente={data.cliente}
          ejercicio={data.ejercicio}
          tipoEmpresa={data.tipoEmpresa}
          archivos={data.archivos}
          validaciones={data.validaciones as ValidacionView[]}
          memoriaSections={memoriaSections}
          score={data.score?.score}
          estado={data.score?.globalEstado ?? data.score?.estado}
          motivoGlobal={data.score?.motivoGlobal}
          errores={errores}
          warnings={warnings}
        />
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-slate-600">
              {processing
                ? "Procesando archivos y ejecutando validaciones…"
                : data.archivos.length === 0
                  ? "Sube el libro de cierre y la memoria para iniciar la revisión."
                  : "Pulsa «Revisar de nuevo» para ejecutar las validaciones."}
            </p>
            {data.archivos.length === 0 && !processing && (
              <form onSubmit={handleUploadSubmit} className="mx-auto mt-6 max-w-md space-y-3">
                <Dropzone onFilesSelected={setUploadFiles} disableInteraction={uploading} />
                <button
                  type="submit"
                  disabled={uploading || uploadFiles.length === 0}
                  className="w-full rounded-lg bg-blue-700 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {uploading ? "Procesando…" : "Subir y revisar"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
