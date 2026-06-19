import React from "react";

import type { EvidenceItem } from "./types";

import type { DataOrigen } from "@/types/tracking";

import { evRef, normalizeEvidenceType } from "./parse-issue";

import {

  evText,

  evidenceToOrigen,

  formatOrigenCompact,

  numericEvidenceValue,

  parseAccountEvidence,

} from "./evidence-utils";



export interface VinculadaItem {

  cuentaPrefijo: string;

  saldoExcel: number;

  origenExcel: DataOrigen;

  valorMemoria: number;

  origenMemoria: DataOrigen;

}



interface VinculadasEvidenceBlockProps {

  items: VinculadaItem[];

}



const VINCULADA_GROUP_LABELS: Record<string, string> = {

  clientes: "433/434",

  proveedores: "403/404",

  prestamos: "24x/552",

  participaciones: "25x/242",

  comerciales: "43/40",

  otro: "Otras",

};



function formatPrefijoLabel(prefijo: string): string {

  return VINCULADA_GROUP_LABELS[prefijo] ?? prefijo;

}



export const VinculadasEvidenceBlock: React.FC<VinculadasEvidenceBlockProps> = ({ items }) => {

  return (

    <div className="overflow-x-auto rounded border border-slate-200">

      <table className="min-w-full text-xs">

        <thead className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-semibold uppercase tracking-wide text-slate-500">

          <tr>

            <th className="px-2 py-1 text-left">Grupo</th>

            <th className="px-2 py-1 text-right">Saldo Excel</th>

            <th className="px-2 py-1 text-left">Proc. Excel</th>

            <th className="px-2 py-1 text-right">Memoria</th>

            <th className="max-w-[9rem] px-2 py-1 text-left">Proc. Memoria</th>

          </tr>

        </thead>

        <tbody className="divide-y divide-slate-100 text-slate-700">

          {items.map((item, idx) => (

            <tr key={idx} className="hover:bg-slate-50/60">

              <td className="whitespace-nowrap px-2 py-1 font-mono text-[11px] font-semibold">

                {formatPrefijoLabel(item.cuentaPrefijo)}

              </td>

              <td className="whitespace-nowrap px-2 py-1 text-right font-mono tabular-nums">

                {item.saldoExcel.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}

              </td>

              <td className="max-w-[8rem] truncate px-2 py-1 text-[10px] text-slate-500" title={formatOrigenCompact(item.origenExcel, 120)}>

                {formatOrigenCompact(item.origenExcel)}

              </td>

              <td className="whitespace-nowrap px-2 py-1 text-right font-mono tabular-nums">

                {item.valorMemoria.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}

              </td>

              <td className="max-w-[9rem] truncate px-2 py-1 text-[10px] text-slate-500" title={formatOrigenCompact(item.origenMemoria, 120)}>

                {formatOrigenCompact(item.origenMemoria)}

              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>

  );

};



function isAccountLine(ev: EvidenceItem): boolean {

  return evRef(ev).startsWith("Cta ");

}



function memoryOrigenForGroup(evidencia: EvidenceItem[], group: string): DataOrigen {

  const grouped = evidencia.find(
    (e) =>
      normalizeEvidenceType(e) === "memory" &&
      e.group === group &&
      !evRef(e).includes("Total vinculadas memoria")
  );
  if (grouped) return evidenceToOrigen(grouped);

  const memoryEvs = evidencia.filter(

    (e) =>

      normalizeEvidenceType(e) === "memory" &&

      e.origen?.ubicacion.includes("Fila:") &&

      !evRef(e).includes("Total vinculadas memoria")

  );

  const patterns: Record<string, RegExp> = {

    clientes: /clientes?\s+por\s+ventas/i,

    proveedores: /proveedores?\s+(a\s+)?(corto|largo)|^proveedores?$/i,

    prestamos: /cr[eé]ditos?|pr[eé]stamo|inversiones?\s+financieras/i,

  };

  const pat = patterns[group];

  if (pat) {

    const match = memoryEvs.find(

      (e) => pat.test(e.origen?.ubicacion ?? "") || pat.test(evRef(e))

    );

    if (match) return evidenceToOrigen(match);

  }

  const memoryTotal = evidencia.find((e) => evRef(e).includes("Total vinculadas memoria"));

  if (memoryTotal) return evidenceToOrigen(memoryTotal);

  return { documento: "memoria_actual", ubicacion: "Ap. 09 — vinculadas" } as DataOrigen;

}



function memoryValorForGroup(evidencia: EvidenceItem[], group: string): number {

  const grouped = evidencia.find(
    (e) =>
      normalizeEvidenceType(e) === "memory" &&
      e.group === group &&
      !evRef(e).includes("Total vinculadas memoria")
  );
  if (grouped) return numericEvidenceValue(grouped);

  const memoryEvs = evidencia.filter(

    (e) =>

      normalizeEvidenceType(e) === "memory" &&

      e.origen?.ubicacion.includes("Fila:") &&

      !evRef(e).includes("Total vinculadas memoria")

  );

  const patterns: Record<string, RegExp> = {

    clientes: /clientes?\s+por\s+ventas/i,

    proveedores: /proveedores?\s+(a\s+)?(corto|largo)|^proveedores?$/i,

    prestamos: /cr[eé]ditos?|pr[eé]stamo|inversiones?\s+financieras/i,

  };

  const pat = patterns[group];

  if (pat) {

    const match = memoryEvs.find(

      (e) => pat.test(e.origen?.ubicacion ?? "") || pat.test(evRef(e))

    );

    if (match) return numericEvidenceValue(match);

  }

  return 0;

}



export function buildVinculadaItems(evidencia: EvidenceItem[]): VinculadaItem[] {

  const memoryTotal = evidencia.find((e) => evRef(e).includes("Total vinculadas memoria"));

  const memoryOrigen = memoryTotal

    ? evidenceToOrigen(memoryTotal)

    : ({ documento: "memoria_actual", ubicacion: "Ap. 09 — vinculadas" } as DataOrigen);



  const groupEvs = evidencia.filter(

    (e) =>

      normalizeEvidenceType(e) === "excel" &&

      e.group &&

      !isAccountLine(e) &&

      evRef(e) !== "Total vinculadas Excel" &&

      evRef(e) !== "Diferencia Excel − memoria"

  );



  const accountEvs = evidencia.filter(isAccountLine);



  const items: VinculadaItem[] = [];



  for (const ev of groupEvs) {

    items.push({

      cuentaPrefijo: ev.group!,

      saldoExcel: numericEvidenceValue(ev),

      origenExcel: evidenceToOrigen(ev),

      valorMemoria: memoryValorForGroup(evidencia, ev.group!),

      origenMemoria: memoryOrigenForGroup(evidencia, ev.group!),

    });

  }



  for (const ev of accountEvs) {

    const parsed = parseAccountEvidence(ev);

    const cuenta = parsed?.cuenta ?? "";

    const group =

      /^43[34]/.test(cuenta) ? "clientes" : /^40[34]/.test(cuenta) ? "proveedores" : "prestamos";

    items.push({

      cuentaPrefijo: parsed?.cuenta ?? evRef(ev),

      saldoExcel: numericEvidenceValue(ev),

      origenExcel: evidenceToOrigen(ev),

      valorMemoria: memoryValorForGroup(evidencia, group),

      origenMemoria: memoryOrigenForGroup(evidencia, group),

    });

  }



  if (items.length === 0) {

    const excelTotal = evidencia.find((e) => evRef(e) === "Total vinculadas Excel");

    if (excelTotal || memoryTotal) {

      items.push({

        cuentaPrefijo: "Total",

        saldoExcel: excelTotal ? numericEvidenceValue(excelTotal) : 0,

        origenExcel: excelTotal

          ? evidenceToOrigen(excelTotal)

          : ({ documento: "excel", ubicacion: "Libro de cierre" } as DataOrigen),

        valorMemoria: memoryTotal ? numericEvidenceValue(memoryTotal) : 0,

        origenMemoria: memoryOrigen,

      });

    }

  }



  return items;

}



interface VinculadasEvidenceFromListProps {

  evidencia: EvidenceItem[];

}



/** Adaptador CROSS_001: convierte evidencias legacy a filas homologadas con DataOrigen. */

export function VinculadasEvidenceFromEvidencia({ evidencia }: VinculadasEvidenceFromListProps) {

  const items = buildVinculadaItems(evidencia);

  const affirmation = evidencia.find((e) => evRef(e).includes("Afirmación en memoria"));



  if (items.length === 0 && !affirmation) return null;



  return (

    <div className="space-y-1.5">

      {items.length > 0 && <VinculadasEvidenceBlock items={items} />}



      {affirmation && evText(affirmation) && (

        <p className="truncate text-[10px] text-slate-500" title={evText(affirmation)}>

          <span className="font-medium text-slate-600">Afirmación: </span>

          {evText(affirmation)}

        </p>

      )}

    </div>

  );

}

