import {
  resolveDocumentYears,
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
  detail?: string;
  fileName?: string;
}

function parseMeta(metadata?: string): { ejercicio?: number; cliente?: string } {
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

  const memoriaPrincipal =
    mainYear !== undefined
      ? memoriasConMeta.find((m) => m.meta.ejercicio === mainYear)
      : memoriasConMeta.sort(
          (a, b) => (b.meta.ejercicio ?? 0) - (a.meta.ejercicio ?? 0)
        )[0];

  const memoriaAnterior =
    priorYear !== undefined
      ? memoriasConMeta.find(
          (m) => m.meta.ejercicio === priorYear && m.id !== memoriaPrincipal?.id
        )
      : memoriasConMeta.find((m) => m.id !== memoriaPrincipal?.id);

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
      detail: memoriaPrincipal?.meta.ejercicio
        ? `Ejercicio ${memoriaPrincipal.meta.ejercicio}`
        : mainYear !== undefined
          ? `Ejercicio ${mainYear}`
          : undefined,
      fileName: memoriaPrincipal?.nombre,
    },
    {
      label: "Memoria ejercicio anterior",
      loaded: !!memoriaAnterior,
      detail: memoriaAnterior?.meta.ejercicio
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
                ? "border-emerald-200 bg-emerald-50/40"
                : "border-slate-100 bg-slate-50/50"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`text-lg ${s.loaded ? "text-emerald-600" : "text-slate-300"}`}
                aria-hidden
              >
                {s.loaded ? "✔" : "○"}
              </span>
              <span
                className={`text-sm font-medium ${
                  s.loaded ? "text-emerald-900" : "text-slate-400"
                }`}
              >
                {s.label}
              </span>
            </div>
            {s.loaded ? (
              <>
                {s.detail && (
                  <p className="mt-2 text-xs font-medium text-emerald-700">{s.detail}</p>
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
    </section>
  );
}
