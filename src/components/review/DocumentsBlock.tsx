import {
  assignMemoriaArchivos,
  resolveDocumentYears,
  type DocMeta,
} from "@/lib/process/resolve-ejercicio";

interface ArchivoDoc {
  id: string;
  nombre: string;
  tipo: string;
  metadata?: string;
}

interface DocumentsBlockProps {
  archivos: ArchivoDoc[];
  /** Ejercicio del expediente (libro de cierre); desambigua memorias sin metadata. */
  ejercicio?: number;
}

interface DocStatus {
  label: string;
  loaded: boolean;
  warning?: boolean;
  detail?: string;
  fileName?: string;
}

function parseMeta(metadata?: string): DocMeta {
  if (!metadata) return {};
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

function buildStatuses(archivos: ArchivoDoc[], expedienteEjercicio?: number): DocStatus[] {
  const excel = archivos.find((a) => a.tipo === "excel_cierre" || a.tipo.startsWith("excel"));
  const memorias = archivos.filter((a) => a.tipo === "memoria_word" || a.tipo === "memoria_pdf");

  const memoriasConMeta = memorias.map((m) => ({ ...m, meta: parseMeta(m.metadata) }));
  const excelMeta = excel ? parseMeta(excel.metadata) : {};

  const { mainYear, priorYear } = resolveDocumentYears(
    excelMeta,
    memoriasConMeta.map((m) => m.meta),
    expedienteEjercicio
  );

  const { principal: memoriaPrincipal, anterior: memoriaAnterior } = assignMemoriaArchivos(
    memoriasConMeta,
    mainYear,
    priorYear
  );

  const principalHasError =
    !!memoriaPrincipal?.meta.parseError ||
    (memoriaPrincipal?.meta.erroresParseo?.length ?? 0) > 0;
  const anteriorHasError =
    !!memoriaAnterior?.meta.parseError ||
    (memoriaAnterior?.meta.erroresParseo?.length ?? 0) > 0;

  return [
    {
      label: "Excel (libro de cierre)",
      loaded: !!excel,
      detail: excelMeta.ejercicio ? `Ejercicio ${excelMeta.ejercicio}` : undefined,
      fileName: excel?.nombre,
    },
    {
      label: "Memoria (ejercicio actual)",
      loaded: !!memoriaPrincipal,
      warning: principalHasError,
      detail: memoriaPrincipal?.meta.parseError
        ? "No se pudo leer el documento"
        : (memoriaPrincipal?.meta.erroresParseo?.length ?? 0) > 0
          ? `${memoriaPrincipal!.meta.erroresParseo!.length} tabla(s) con error de parseo`
          : memoriaPrincipal?.meta.ejercicio
            ? `Ejercicio ${memoriaPrincipal.meta.ejercicio}`
            : mainYear !== undefined
              ? `Ejercicio ${mainYear}`
              : undefined,
      fileName: memoriaPrincipal?.nombre,
    },
    {
      label: "Memoria ejercicio anterior",
      loaded: !!memoriaAnterior,
      warning: anteriorHasError,
      detail: memoriaAnterior?.meta.parseError
        ? "No se pudo leer el documento"
        : (memoriaAnterior?.meta.erroresParseo?.length ?? 0) > 0
          ? `${memoriaAnterior!.meta.erroresParseo!.length} tabla(s) con error de parseo`
          : memoriaAnterior?.meta.ejercicio
            ? `Ejercicio ${memoriaAnterior.meta.ejercicio}`
            : priorYear !== undefined
              ? `Ejercicio ${priorYear}`
              : undefined,
      fileName: memoriaAnterior?.nombre,
    },
  ];
}

export function DocumentsBlock({ archivos, ejercicio }: DocumentsBlockProps) {
  const statuses = buildStatuses(archivos, ejercicio);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Documentos analizados
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {statuses.map((s) => (
          <div
            key={s.label}
            className={`rounded-xl border p-4 ${
              s.loaded
                ? s.warning
                  ? "border-amber-200 bg-amber-50/40"
                  : "border-emerald-200 bg-emerald-50/40"
                : "border-slate-100 bg-slate-50/50"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`text-lg ${
                  s.loaded ? (s.warning ? "text-amber-600" : "text-emerald-600") : "text-slate-300"
                }`}
                aria-hidden
              >
                {s.loaded ? (s.warning ? "!" : "✔") : "○"}
              </span>
              <span
                className={`text-sm font-medium ${
                  s.loaded
                    ? s.warning
                      ? "text-amber-900"
                      : "text-emerald-900"
                    : "text-slate-400"
                }`}
              >
                {s.label}
              </span>
            </div>
            {s.loaded ? (
              <>
                {s.detail && (
                  <p
                    className={`mt-2 text-xs font-medium ${
                      s.warning ? "text-amber-700" : "text-emerald-700"
                    }`}
                  >
                    {s.detail}
                  </p>
                )}
                {s.fileName && (
                  <p className="mt-1 truncate text-xs text-slate-500" title={s.fileName}>
                    {s.fileName}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-xs text-slate-400">No cargado</p>
            )}
          </div>
        ))}
      </div>
      {archivos.filter((a) => a.tipo === "memoria_word" || a.tipo === "memoria_pdf").length ===
        1 && (
        <p className="mt-3 text-xs text-slate-500">
          Solo hay una memoria en el expediente. Para un cierre 2025 hacen falta el libro Excel,
          la memoria del ejercicio actual y, si aplica, la del ejercicio anterior.
        </p>
      )}
    </section>
  );
}
