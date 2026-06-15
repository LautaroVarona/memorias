import { parseImporte, detectarTablasAnunciadasAusentes } from "@/lib/parsers/memoria/extractors";
import { formatEuro } from "@/lib/rules/helpers/accounts";
import { withEuro, withText } from "@/lib/rules/helpers/evidence";
import { seniorExplanation, seniorExplanationPass } from "@/lib/rules/helpers/explanation";
import apartadosPGC from "../../../../data/pgc/apartados-memoria.json";
import type { CaseData } from "@/types/case-data";
import type { CuentaNormalizada, NotaDespacho, TablaMemoria } from "@/types/domain";
import type { RuleDefinition } from "../types";

/**
 * Reglas específicas del flujo real del despacho: libro de cierre .xlsm
 * (SYS_cliente, A3SOC, BALANCE, PG, PENDIENTES, INCIDENCIAS) cruzado con
 * la memoria .DOC generada por A3SOC.
 */

function saldoPorPrefijos(cuentas: CuentaNormalizada[], prefijos: string[]): number {
  return cuentas
    .filter((c) => prefijos.some((p) => c.cuenta.startsWith(p)))
    .reduce((s, c) => s + c.saldo, 0);
}

/**
 * Saldo del cierre para un grupo de cuentas. Se prefiere A3SOC (recoge los
 * ajustes de cierre del despacho) y se cae a la contabilidad del cliente
 * (SYS) si A3SOC no tiene la cuenta.
 */
function saldoCierre(
  libro: NonNullable<CaseData["financials"]["libroCierre"]>,
  prefijos: string[]
): { valor: number; fuente: string } {
  const enA3 = libro.a3soc.filter((c) => prefijos.some((p) => c.cuenta.startsWith(p)));
  if (enA3.length > 0) {
    return { valor: enA3.reduce((s, c) => s + c.saldo, 0), fuente: "A3SOC" };
  }
  return { valor: saldoPorPrefijos(libro.cuentas4, prefijos), fuente: "SYS_cliente" };
}

/** La memoria y el libro deben referirse al mismo ejercicio para cruzar saldos */
function ejerciciosAlineados(data: CaseData): boolean {
  const memEj = data.memory?.keyData.ejercicio;
  const libroEj = data.financials.libroCierre?.ejercicio;
  if (memEj === undefined || libroEj === undefined) return false;
  return memEj === libroEj;
}

interface CruceVinculadas {
  etiqueta: string;
  valorMemoria: number;
  valorExcel: number;
  prefijos: string[];
  fuente: string;
  cuadra: boolean;
}

const MAPEO_VINCULADAS: { patron: RegExp; etiqueta: string; prefijos: string[] }[] = [
  {
    patron: /inversiones financieras a largo plazo/i,
    etiqueta: "Créditos l/p a empresas del grupo",
    prefijos: ["2423", "2424"],
  },
  {
    patron: /inversiones financieras a corto plazo/i,
    etiqueta: "Créditos c/p a empresas del grupo",
    prefijos: ["5323", "5324", "5343", "5344"],
  },
  {
    patron: /clientes por ventas y prestaci[óo]n de servicios a corto/i,
    etiqueta: "Clientes empresas del grupo c/p",
    prefijos: ["433", "434"],
  },
  {
    patron: /^a\)\s*proveedores/i,
    etiqueta: "Proveedores empresas del grupo",
    prefijos: ["403", "404"],
  },
];

function primeraCifra(celdas: string[]): number | null {
  for (const c of celdas) {
    const n = parseImporte(c);
    if (n !== null && c.trim() !== "") return n;
  }
  return null;
}

function cruzarVinculadas(data: CaseData): CruceVinculadas[] {
  const libro = data.financials.libroCierre;
  const tablas = data.memory?.tables ?? [];
  if (!libro || tablas.length === 0) return [];

  // Tablas del apartado 09 (saldos con partes vinculadas)
  const tablasVinculadas = tablas.filter(
    (t) =>
      t.apartado === "09" ||
      /vinculad|dependiente/i.test(t.titulo) ||
      t.cabecera.some((c) => /dependiente|vinculad/i.test(c))
  );

  const cruces: CruceVinculadas[] = [];
  for (const tabla of tablasVinculadas) {
    for (const fila of tabla.filas) {
      if (fila.length < 2) continue;
      const etiquetaFila = fila[0];
      for (const mapeo of MAPEO_VINCULADAS) {
        if (!mapeo.patron.test(etiquetaFila.replace(/^\d+\.\s*/, ""))) continue;
        const valorMemoria = primeraCifra(fila.slice(1));
        if (valorMemoria === null || valorMemoria === 0) continue;
        const { valor, fuente } = saldoCierre(libro, mapeo.prefijos);
        const valorExcel = Math.abs(valor);
        if (valorExcel === 0) continue;
        const cuadra = Math.abs(Math.abs(valorMemoria) - valorExcel) <= 1;
        cruces.push({
          etiqueta: mapeo.etiqueta,
          valorMemoria: Math.abs(valorMemoria),
          valorExcel,
          prefijos: mapeo.prefijos,
          fuente,
          cuadra,
        });
        break;
      }
    }
  }
  return cruces;
}

export const cierreRules: RuleDefinition[] = [
  {
    id: "CIERRE_001",
    title: "Cuadre debe/haber de sumas y saldos",
    type: "balance",
    defaultSeverity: "critical",
    normativa: "PGC — partida doble",
    referencia: "Hoja SYS_cliente del libro de cierre",
    execute(data) {
      const libro = data.financials.libroCierre;
      if (!libro || libro.sumasSaldos.length === 0) return { passed: true, data: { skip: true } };
      const totalDebe = libro.sumasSaldos.reduce((s, c) => s + c.debe, 0);
      const totalHaber = libro.sumasSaldos.reduce((s, c) => s + c.haber, 0);
      const diferencia = totalDebe - totalHaber;
      return {
        passed: Math.abs(diferencia) <= 0.05,
        severity: "critical",
        sugerencia: "Revise la carga de sumas y saldos: el descuadre indica un volcado incompleto o erróneo.",
        data: { totalDebe, totalHaber, diferencia },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        if (outcome.data.skip) return seniorExplanationPass("No hay sumas y saldos del libro de cierre que validar.");
        return seniorExplanationPass("Las sumas y saldos del cliente cuadran (debe = haber).");
      }
      const { totalDebe, totalHaber, diferencia } = outcome.data as Record<string, number>;
      return seniorExplanation(
        `Las sumas y saldos no cuadran: debe ${formatEuro(totalDebe)} frente a haber ${formatEuro(totalHaber)} (diferencia ${formatEuro(diferencia)}).`,
        `Con descuadre en la partida doble, cualquier estado financiero derivado (balance, PyG, memoria) es inservible.`,
        `Vuelque de nuevo las sumas y saldos del cliente y verifique que no se han perdido filas.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const { totalDebe, totalHaber } = outcome.data as Record<string, number>;
      return [
        withEuro("excel", "SYS_cliente — total debe", totalDebe, "high"),
        withEuro("excel", "SYS_cliente — total haber", totalHaber, "high"),
      ];
    },
  },
  {
    id: "CIERRE_002",
    title: "Cuadre del balance (activo = patrimonio neto + pasivo)",
    type: "balance",
    defaultSeverity: "critical",
    normativa: "PGC — estructura del balance",
    referencia: "Hoja BALANCE del libro de cierre",
    execute(data) {
      const libro = data.financials.libroCierre;
      if (!libro || libro.balanceEpigrafes.length === 0) return { passed: true, data: { skip: true } };
      const totalActivo = libro.balanceEpigrafes.find((e) => /^TOTAL ACTIVO$/i.test(e.etiqueta));
      const totalPasivo = libro.balanceEpigrafes.find((e) => /^TOTAL PASIVO$/i.test(e.etiqueta));
      if (!totalActivo || !totalPasivo) return { passed: true, data: { skip: true } };
      const diferencia = totalActivo.actual - totalPasivo.actual;
      return {
        passed: Math.abs(diferencia) <= 0.05,
        severity: "critical",
        sugerencia: "Revise los ajustes de cierre: el balance no cuadra.",
        data: {
          activo: totalActivo.actual,
          pasivo: totalPasivo.actual,
          diferencia,
          filaActivo: totalActivo.fila,
          filaPasivo: totalPasivo.fila,
        },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        if (outcome.data.skip) return seniorExplanationPass("No hay balance comparativo que validar.");
        return seniorExplanationPass("El balance cuadra: total activo = total patrimonio neto y pasivo.");
      }
      const { activo, pasivo, diferencia } = outcome.data as Record<string, number>;
      return seniorExplanation(
        `El balance no cuadra: total activo ${formatEuro(activo)} frente a total PN+pasivo ${formatEuro(pasivo)} (diferencia ${formatEuro(diferencia)}).`,
        `Un balance descuadrado no puede depositarse y suele deberse a ajustes de cierre incompletos.`,
        `Revise la hoja BALANCE y los ajustes pendientes de contabilizar.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const d = outcome.data as Record<string, number>;
      return [
        withEuro("excel", `BALANCE fila ${d.filaActivo} — TOTAL ACTIVO`, d.activo, "high"),
        withEuro("excel", `BALANCE fila ${d.filaPasivo} — TOTAL PASIVO`, d.pasivo, "high"),
      ];
    },
  },
  {
    id: "CIERRE_003",
    title: "Contabilidad del cliente vs A3SOC",
    type: "cross",
    defaultSeverity: "warning",
    normativa: "Control interno del despacho",
    referencia: "SYS_cliente vs A3SOC (saldos a 3 dígitos)",
    execute(data) {
      const libro = data.financials.libroCierre;
      if (!libro || libro.a3soc.length === 0 || libro.cuentas4.length === 0) {
        return { passed: true, data: { skip: true } };
      }

      const agregar = (cuentas: CuentaNormalizada[]) => {
        const m = new Map<string, number>();
        for (const c of cuentas) {
          const clave = c.cuenta.substring(0, 3);
          m.set(clave, (m.get(clave) ?? 0) + c.saldo);
        }
        return m;
      };

      const sys = agregar(libro.cuentas4);
      const a3 = agregar(libro.a3soc);
      const claves = new Set([...sys.keys(), ...a3.keys()]);

      const discrepancias: { cuenta: string; sys: number; a3soc: number; diff: number }[] = [];
      for (const clave of claves) {
        // Grupos 6/7 pueden venir regularizados en un volcado y no en el otro
        if (clave.startsWith("6") || clave.startsWith("7") || clave.startsWith("129")) continue;
        const vSys = sys.get(clave) ?? 0;
        const vA3 = a3.get(clave) ?? 0;
        const diff = vSys - vA3;
        if (Math.abs(diff) > 1) discrepancias.push({ cuenta: clave, sys: vSys, a3soc: vA3, diff });
      }
      discrepancias.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

      return {
        passed: discrepancias.length === 0,
        severity: "warning",
        sugerencia: "Concilie las cuentas señaladas entre la contabilidad del cliente y A3SOC.",
        data: { discrepancias: discrepancias.slice(0, 10), total: discrepancias.length },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        if (outcome.data.skip) return seniorExplanationPass("No hay datos de A3SOC y SYS_cliente que conciliar.");
        return seniorExplanationPass("La contabilidad del cliente coincide con A3SOC a nivel de 3 dígitos.");
      }
      const { total } = outcome.data as { total: number };
      return seniorExplanation(
        `Hay ${total} cuenta(s) a 3 dígitos con saldo distinto entre la contabilidad del cliente (SYS) y A3SOC.`,
        `Las diferencias indican asientos pendientes de traspasar o ajustes de cierre aplicados solo en uno de los dos sistemas.`,
        `Concilie las cuentas señaladas antes de dar por bueno el cierre.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      return ((outcome.data.discrepancias as { cuenta: string; sys: number; a3soc: number }[]) ?? [])
        .slice(0, 5)
        .flatMap((d) => [
          withEuro("excel", `Cuenta ${d.cuenta} — SYS_cliente`, d.sys, "high"),
          withEuro("excel", `Cuenta ${d.cuenta} — A3SOC`, d.a3soc, "high"),
        ]);
    },
  },
  {
    id: "CIERRE_004",
    title: "Saldos con partes vinculadas: memoria vs contabilidad",
    type: "cross",
    defaultSeverity: "critical",
    normativa: "PGC — memoria, operaciones con partes vinculadas",
    referencia: "Apartado 09 de la memoria vs SYS_cliente",
    execute(data) {
      if (!ejerciciosAlineados(data)) return { passed: true, data: { skip: true } };
      const cruces = cruzarVinculadas(data);
      if (cruces.length === 0) return { passed: true, data: { skip: true, sinCruces: true } };
      const descuadrados = cruces.filter((c) => !c.cuadra);
      return {
        passed: descuadrados.length === 0,
        severity: "critical",
        sugerencia: "Actualice las tablas de saldos con vinculadas con los importes reales del cierre.",
        data: { cruces, descuadrados },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        if (outcome.data.sinCruces) {
          return seniorExplanationPass("No se localizaron importes de vinculadas cruzables entre memoria y Excel.");
        }
        if (outcome.data.skip) {
          return seniorExplanationPass("Cruce de vinculadas omitido: memoria y libro de cierre no son del mismo ejercicio.");
        }
        const cruces = (outcome.data.cruces as CruceVinculadas[]) ?? [];
        return seniorExplanationPass(
          `Los saldos con vinculadas de la memoria cuadran con la contabilidad (${cruces.length} importe(s) verificado(s)).`
        );
      }
      const descuadrados = (outcome.data.descuadrados as CruceVinculadas[]) ?? [];
      const detalle = descuadrados
        .map((d) => `${d.etiqueta}: memoria ${formatEuro(d.valorMemoria)} vs contabilidad ${formatEuro(d.valorExcel)}`)
        .join("; ");
      return seniorExplanation(
        `Los saldos con partes vinculadas de la memoria no cuadran con la contabilidad: ${detalle}.`,
        `El apartado 09 es de los más revisados por la AEAT; un descuadre con los saldos contables delata una memoria sin actualizar.`,
        `Regenere o corrija las tablas de saldos con vinculadas con los importes del cierre definitivo.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      return ((outcome.data.descuadrados as CruceVinculadas[]) ?? []).flatMap((d) => [
        withEuro("memory", `Memoria — ${d.etiqueta}`, d.valorMemoria, "high"),
        withEuro("excel", `${d.fuente} — cuentas ${d.prefijos.join("/")}`, d.valorExcel, "high"),
      ]);
    },
  },
  {
    id: "CIERRE_005",
    title: "Impuesto corriente: memoria vs cuenta 6300",
    type: "fiscal",
    defaultSeverity: "critical",
    normativa: "PGC NRV 13ª",
    referencia: "Apartado 08 (situación fiscal) vs cuenta 6300",
    execute(data) {
      if (!ejerciciosAlineados(data)) return { passed: true, data: { skip: true } };
      const impuestoMemoria = data.memory?.keyData.impuestoCorriente;
      const libro = data.financials.libroCierre;
      if (impuestoMemoria === undefined || !libro) return { passed: true, data: { skip: true } };
      const { valor, fuente } = saldoCierre(libro, ["6300"]);
      const impuestoExcel = Math.abs(valor);
      const cuadra = Math.abs(Math.abs(impuestoMemoria) - impuestoExcel) <= 1;
      return {
        passed: cuadra,
        severity: "critical",
        sugerencia: "Actualice el apartado de situación fiscal con el gasto por impuesto corriente real.",
        data: { impuestoMemoria: Math.abs(impuestoMemoria), impuestoExcel, fuente },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        if (outcome.data.skip) return seniorExplanationPass("No hay datos suficientes para cruzar el impuesto corriente.");
        const d = outcome.data as { impuestoExcel: number; fuente: string };
        return seniorExplanationPass(
          `El impuesto corriente de la memoria coincide con la cuenta 6300 en ${d.fuente} (${formatEuro(d.impuestoExcel)}).`
        );
      }
      const d = outcome.data as { impuestoMemoria: number; impuestoExcel: number; fuente: string };
      return seniorExplanation(
        `El impuesto corriente declarado en la memoria (${formatEuro(d.impuestoMemoria)}) no coincide con la cuenta 6300 en ${d.fuente} (${formatEuro(d.impuestoExcel)}).`,
        `La cifra del apartado de situación fiscal debe salir del cierre definitivo; la discrepancia indica memoria desactualizada o IS recalculado después de generar la memoria.`,
        `Regenere el apartado 08 tras cerrar el cálculo del Impuesto sobre Sociedades.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const d = outcome.data as { impuestoMemoria: number; impuestoExcel: number; fuente: string };
      return [
        withEuro("memory", "Memoria — impuesto corriente", d.impuestoMemoria, "high"),
        withEuro("excel", `${d.fuente} — cuenta 6300`, d.impuestoExcel, "high"),
      ];
    },
  },
  {
    id: "CIERRE_006",
    title: "Apartados obligatorios de la memoria abreviada",
    type: "formal",
    defaultSeverity: "warning",
    normativa: "PGC — contenido de la memoria abreviada",
    referencia: "Apartados 01 a 11",
    execute(data) {
      if (!data.memory) return { passed: true, data: { skip: true } };
      if (data.memory.keyData.tipoMemoria && data.memory.keyData.tipoMemoria !== "abreviada") {
        return { passed: true, data: { skip: true } };
      }
      const numerados = data.memory.sections.filter((s) => s.numero !== undefined);
      if (numerados.length === 0) return { passed: true, data: { skip: true } };

      const presentes = new Set(numerados.map((s) => s.numero));
      const catalogo = apartadosPGC.abreviada as { numero: number; titulo: string }[];
      const ausentes = catalogo.filter((c) => !presentes.has(c.numero));

      return {
        passed: ausentes.length === 0,
        severity: ausentes.length > 2 ? "critical" : "warning",
        sugerencia: "Añada los apartados que faltan según el modelo de memoria abreviada.",
        data: { ausentes, presentes: numerados.map((s) => `${s.id} ${s.titulo}`) },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        if (outcome.data.skip) return seniorExplanationPass("No aplica la verificación de apartados de memoria abreviada.");
        return seniorExplanationPass("La memoria contiene todos los apartados del modelo abreviado (01-11).");
      }
      const ausentes = (outcome.data.ausentes as { numero: number; titulo: string }[]) ?? [];
      return seniorExplanation(
        `Faltan ${ausentes.length} apartado(s) del modelo de memoria abreviada: ${ausentes.map((a) => `${String(a.numero).padStart(2, "0")} ${a.titulo}`).join("; ")}.`,
        `El contenido mínimo de la memoria viene fijado por el PGC; la ausencia de apartados puede provocar defectos de depósito.`,
        `Compruebe si la omisión está justificada (sin contenido aplicable) o si se perdió al editar el documento.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      return ((outcome.data.ausentes as { numero: number; titulo: string }[]) ?? []).map((a) =>
        withText("memory", `Apartado ${String(a.numero).padStart(2, "0")}`, `${a.titulo} — no localizado`, "high")
      );
    },
  },
  {
    id: "CIERRE_007",
    title: "Tablas vacías o anunciadas sin contenido",
    type: "formal",
    defaultSeverity: "warning",
    normativa: "PGC — memoria",
    referencia: "Tablas de detalle de la memoria",
    execute(data) {
      if (!data.memory) return { passed: true, data: { skip: true } };
      const vacias = data.memory.tables.filter((t) => t.vacia && t.filas.length > 0);
      const anunciadas = detectarTablasAnunciadasAusentes(data.memory.fullText);
      return {
        passed: vacias.length === 0 && anunciadas.length === 0,
        severity: "warning",
        sugerencia: "Complete las tablas vacías o elimine el texto que las anuncia si no aplican.",
        data: {
          vacias: vacias.map((t) => ({ titulo: t.titulo, apartado: t.apartado, linea: t.linea })),
          anunciadas,
        },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("No se detectaron tablas vacías ni detalles anunciados sin contenido.");
      }
      const vacias = (outcome.data.vacias as { titulo: string }[]) ?? [];
      const anunciadas = (outcome.data.anunciadas as string[]) ?? [];
      const partes: string[] = [];
      if (vacias.length > 0) partes.push(`${vacias.length} tabla(s) sin datos`);
      if (anunciadas.length > 0) partes.push(`${anunciadas.length} detalle(s) anunciado(s) que no aparecen`);
      return seniorExplanation(
        `La memoria tiene ${partes.join(" y ")}.`,
        `Es el caso típico de la tabla de coeficientes de amortización que se quedó vacía al generar la memoria: el texto promete un detalle que no está.`,
        `Complete cada tabla con los datos del cierre o suprima el párrafo introductorio si el detalle no aplica.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const vacias = (outcome.data.vacias as { titulo: string; apartado?: string }[]) ?? [];
      const anunciadas = (outcome.data.anunciadas as string[]) ?? [];
      return [
        ...vacias.slice(0, 4).map((t) =>
          withText("memory", t.apartado ? `Apartado ${t.apartado} — tabla vacía` : "Tabla vacía", t.titulo || "(sin título)", "high")
        ),
        ...anunciadas.slice(0, 4).map((a) => withText("memory", "Detalle anunciado sin contenido", a, "high")),
      ];
    },
  },
  {
    id: "CIERRE_008",
    title: "Puntos pendientes del despacho (PENDIENTES / INCIDENCIAS)",
    type: "formal",
    defaultSeverity: "warning",
    normativa: "Control interno del despacho",
    referencia: "Hojas PENDIENTES e INCIDENCIAS del libro de cierre",
    execute(data) {
      const notas = data.financials.libroCierre?.notas ?? [];
      const pendientes = notas.filter((n) => n.pendiente);
      return {
        passed: pendientes.length === 0,
        severity: "warning",
        sugerencia: "Resuelva los puntos marcados como pendientes antes de cerrar la revisión.",
        data: { pendientes, totalNotas: notas.length },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("El libro de cierre no tiene puntos marcados como pendientes de revisar.");
      }
      const pendientes = (outcome.data.pendientes as NotaDespacho[]) ?? [];
      return seniorExplanation(
        `El propio libro de cierre tiene ${pendientes.length} punto(s) marcado(s) como pendiente(s) por el despacho.`,
        `Las hojas PENDIENTES e INCIDENCIAS recogen la revisión manual del equipo; los puntos abiertos indican que el cierre aún no está validado.`,
        `Repase cada punto pendiente y márquelo como revisado en el libro antes de formular.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      return ((outcome.data.pendientes as NotaDespacho[]) ?? [])
        .slice(0, 8)
        .map((n) =>
          withText("excel", `${n.hoja} fila ${n.fila}`, n.detalle ? `${n.concepto}: ${n.detalle}` : n.concepto, "medium")
        );
    },
  },
  {
    id: "CIERRE_009",
    title: "Identificación de la sociedad en la memoria",
    type: "formal",
    defaultSeverity: "warning",
    normativa: "PGC — memoria, apartado 01",
    referencia: "NIF, denominación y firma",
    execute(data) {
      if (!data.memory) return { passed: true, data: { skip: true } };
      const kd = data.memory.keyData;
      const faltantes: string[] = [];
      if (!kd.nif) faltantes.push("NIF");
      if (!kd.denominacion) faltantes.push("denominación social");
      if (!data.memory.formal.tieneFirma) faltantes.push("bloque de firma");
      if (!kd.firmante) faltantes.push("identificación del firmante");
      return {
        passed: faltantes.length === 0,
        severity: "warning",
        sugerencia: "Complete los datos identificativos y el bloque de firma de la memoria.",
        data: { faltantes, kd },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        if (outcome.data.skip) return seniorExplanationPass("No hay memoria que verificar.");
        const kd = outcome.data.kd as { nif?: string } | undefined;
        return seniorExplanationPass(
          `La memoria identifica correctamente a la sociedad${kd?.nif ? ` (NIF ${kd.nif})` : ""} e incluye firma.`
        );
      }
      const faltantes = (outcome.data.faltantes as string[]) ?? [];
      return seniorExplanation(
        `Faltan datos identificativos en la memoria: ${faltantes.join(", ")}.`,
        `Sin identificación completa y firma, las cuentas no superan la calificación del Registro Mercantil.`,
        `Complete el apartado 01 y el bloque final de formulación.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      return ((outcome.data.faltantes as string[]) ?? []).map((f) =>
        withText("memory", "Dato ausente", f, "medium")
      );
    },
  },
];
