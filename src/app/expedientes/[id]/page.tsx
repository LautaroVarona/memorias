import { Suspense } from "react";
import { ExpedienteDetailContent } from "./ExpedienteDetailContent";

export default function ExpedienteDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-sm text-slate-400">Cargando expediente…</p>
        </div>
      }
    >
      <ExpedienteDetailContent />
    </Suspense>
  );
}
