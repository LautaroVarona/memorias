import { clasificarEmpresa } from "@/lib/classifier";
import { formatEuro } from "@/lib/rules/helpers/accounts";
import {
  detectarDescuadresComparativa,
  type DescuadreComparativa,
} from "@/lib/rules/helpers/coherencia-comparativa";
import { seniorExplanation, seniorExplanationPass } from "@/lib/rules/helpers/explanation";
import { withEuro, withMemoryLocator, withText } from "@/lib/rules/helpers/evidence";
import {
  detectarApartadosOmitidos,
  type ApartadoOmitido,
} from "@/lib/rules/helpers/text-normalize";
import type { TipoEmpresa } from "@/types/domain";
import type { RuleDefinition } from "../types";

const KEY_SECTIONS = [
  { id: "vinculadas", keywords: ["operaciones vinculadas", "partes vinculadas"] },
  { id: "fiscal", keywords: ["situación fiscal", "impuesto sobre sociedades", "conciliación fiscal"] },
];

function formatOmitidosLista(omitidos: ApartadoOmitido[]): string {
  return omitidos
    .map((o) =>
      o.numero !== undefined ? `${String(o.numero).padStart(2, "0")} ${o.nombre}` : o.nombre
    )
    .join(", ");
}

function formatOmitidosImpact(omitidos: ApartadoOmitido[]): string {
  return `Apartados afectados: ${formatOmitidosLista(omitidos)}. Estaban presentes en el ejercicio anterior y son obligatorios en la memoria.`;
}

function isOperativa(tipo: TipoEmpresa): boolean {
  return tipo === "comercial" || tipo === "industrial";
}

function sectionPresent(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

export const interannualRules: RuleDefinition[] = [
  {
    id: "INTER_002",
    title: "Cambio de tipo de empresa",
    type: "interannual",
    defaultSeverity: "warning",
    normativa: "PGC",
    referencia: "Análisis interanual — naturaleza de la actividad",
    execute(data) {
      const cuentasActual = data.financials.accounts;
      const cuentasAnterior = data.priorYear?.financials.accounts;
      if (!cuentasAnterior?.length || !cuentasActual.length) {
        return { passed: true, data: { skip: true } };
      }

      const tipoActual = clasificarEmpresa(cuentasActual);
      const tipoAnterior = clasificarEmpresa(cuentasAnterior);

      const cambioHoldingOperativa =
        (tipoAnterior === "holding" && isOperativa(tipoActual)) ||
        (isOperativa(tipoAnterior) && tipoActual === "holding");

      return {
        passed: !cambioHoldingOperativa,
        severity: "warning",
        sugerencia: "Explique en la memoria el cambio en la naturaleza de la actividad empresarial.",
        data: { tipoActual, tipoAnterior, cambioHoldingOperativa, ejercicioAnterior: data.priorYear!.ejercicio },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("El tipo de empresa es coherente con el ejercicio anterior.");
      }
      const { tipoActual, tipoAnterior, ejercicioAnterior } = outcome.data as {
        tipoActual: TipoEmpresa;
        tipoAnterior: TipoEmpresa;
        ejercicioAnterior: number;
      };
      return seniorExplanation(
        `Cambio de tipo de empresa detectado: de "${tipoAnterior}" (${ejercicioAnterior}) a "${tipoActual}" (ejercicio actual).`,
        `Un cambio entre holding y actividad operativa suele implicar transformación societaria, reestructuración o cambio en el modelo de negocio.`,
        `Verifique que la memoria describe adecuadamente el cambio y que la clasificación contable es coherente.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const { tipoActual, tipoAnterior, ejercicioAnterior } = outcome.data as {
        tipoActual: string;
        tipoAnterior: string;
        ejercicioAnterior: number;
      };
      return [
        withText("excel", `Tipo ${ejercicioAnterior}`, tipoAnterior, "high"),
        withText("excel", "Tipo ejercicio actual", tipoActual, "high"),
      ];
    },
  },
  {
    id: "INTER_003",
    title: "Desaparición de secciones clave",
    type: "interannual",
    defaultSeverity: "warning",
    normativa: "PGC",
    referencia: "Análisis interanual — apartados obligatorios",
    execute(data) {
      if (!data.memory || !data.priorYear?.memory) {
        return { passed: true, data: { skip: true } };
      }

      const textoActual = data.memory.fullText;
      const textoAnterior = data.priorYear.memory.fullText;

      const desaparecidas = KEY_SECTIONS.filter(
        (sec) => sectionPresent(textoAnterior, sec.keywords) && !sectionPresent(textoActual, sec.keywords)
      ).map((s) => s.id);

      return {
        passed: desaparecidas.length === 0,
        severity: "warning",
        sugerencia: "Verifique si la omisión de apartados clave es intencionada según el tipo de memoria.",
        data: {
          desaparecidas,
          ejercicioAnterior: data.priorYear.ejercicio,
          ejercicio: data.metadata.ejercicio,
        },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("Los apartados clave (vinculadas, fiscal) están presentes respecto al ejercicio anterior.");
      }
      const { desaparecidas, ejercicioAnterior, ejercicio } = outcome.data as {
        desaparecidas: string[];
        ejercicioAnterior: number;
        ejercicio: number;
      };
      return seniorExplanation(
        `Apartados clave ausentes en ${ejercicio} que sí figuraban en ${ejercicioAnterior}: ${desaparecidas.join(", ")}.`,
        `La desaparición de secciones sobre operaciones vinculadas o situación fiscal puede indicar omisión involuntaria o cambio de tipo de memoria no justificado.`,
        `Confirme si la omisión es correcta o restaure los apartados obligatorios según PGC.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const { desaparecidas, ejercicioAnterior, ejercicio } = outcome.data as {
        desaparecidas: string[];
        ejercicioAnterior: number;
        ejercicio: number;
      };
      return desaparecidas.map((d) =>
        withText("memory", `Apartado ${d}`, `Presente en ${ejercicioAnterior}, ausente en ${ejercicio}`, "high")
      );
    },
  },
  {
    id: "INTER_004",
    title: "Aparición de cuentas nuevas",
    type: "interannual",
    defaultSeverity: "warning",
    normativa: "PGC",
    referencia: "Análisis interanual — cuentas",
    execute(data) {
      const actual = data.financials.accounts;
      const anterior = data.priorYear?.financials.accounts;
      if (!anterior?.length || !actual.length) {
        return { passed: true, data: { skip: true } };
      }

      const cuentasAnteriores = new Set(anterior.map((c) => c.cuenta));
      const nuevas = actual.filter(
        (c) => !cuentasAnteriores.has(c.cuenta) && Math.abs(c.saldo) > 5000
      );

      return {
        passed: nuevas.length === 0,
        severity: "warning",
        sugerencia: "Revise el origen de las cuentas nuevas con saldo relevante.",
        data: { nuevas: nuevas.map((c) => ({ cuenta: c.cuenta, saldo: c.saldo })) },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("No hay cuentas nuevas con saldo relevante respecto al ejercicio anterior.");
      }
      const nuevas = (outcome.data.nuevas as { cuenta: string; saldo: number }[]) ?? [];
      return seniorExplanation(
        `Se han detectado ${nuevas.length} cuenta(s) nueva(s) con saldo significativo: ${nuevas.map((n) => n.cuenta).join(", ")}.`,
        `La aparición de cuentas no presentes en el ejercicio anterior puede indicar nuevas operaciones, reclasificaciones o errores de cierre.`,
        `Verifique el origen de cada cuenta nueva y su reflejo en la memoria si es material.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      return ((outcome.data.nuevas as { cuenta: string; saldo: number }[]) ?? []).map((n) =>
        withEuro("excel", `Cuenta ${n.cuenta}`, Math.abs(n.saldo), "medium")
      );
    },
  },
  {
    id: "INTER_008",
    title: "Estructura espejo entre ejercicios",
    type: "interannual",
    defaultSeverity: "critical",
    normativa: "PGC",
    referencia: "Análisis interanual — apartados presentes en N-1",
    execute(data) {
      if (!data.memory || !data.priorYear?.memory) {
        return { passed: true, data: { skip: true } };
      }

      const omitidos = detectarApartadosOmitidos(
        data.memory.sections,
        data.priorYear.memory.sections
      );

      const ejercicioAnterior = data.priorYear.memory.keyData?.ejercicio;
      const ejercicio = data.memory.keyData?.ejercicio;
      if (!ejercicioAnterior || !ejercicio) {
        return { passed: true, data: { skip: true } };
      }
      const action =
        "Restaure los apartados omitidos en la memoria del ejercicio actual o justifique su ausencia según el tipo de memoria.";

      if (omitidos.length === 0) {
        return { passed: true, data: { ejercicioAnterior, ejercicio } };
      }

      const impact = formatOmitidosImpact(omitidos);

      const diagnosis = `${omitidos.length} apartado(s) del ejercicio ${ejercicioAnterior} no aparecen en la memoria de ${ejercicio}.`;

      return {
        passed: false,
        severity: "critical",
        diagnosis,
        impact,
        action,
        sugerencia: action,
        data: { omitidos, ejercicioAnterior, ejercicio },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        if (outcome.data.skip) {
          return seniorExplanationPass("No hay memoria del ejercicio anterior para comparar la estructura de apartados.");
        }
        const { ejercicioAnterior, ejercicio } = outcome.data as {
          ejercicioAnterior: number;
          ejercicio: number;
        };
        return seniorExplanationPass(
          `Todos los apartados del ejercicio ${ejercicioAnterior} están representados en la memoria de ${ejercicio}.`
        );
      }

      const { omitidos, ejercicioAnterior } = outcome.data as {
        omitidos: ApartadoOmitido[];
        ejercicioAnterior: number;
        ejercicio: number;
      };

      const lista = formatOmitidosLista(omitidos);

      const impact = outcome.impact ?? formatOmitidosImpact(omitidos);

      return seniorExplanation(
        outcome.diagnosis ??
          `Apartados omitidos respecto a ${ejercicioAnterior}: ${lista}.`,
        impact,
        outcome.action ?? "Restaure los apartados omitidos en la memoria del ejercicio actual."
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const { omitidos, ejercicioAnterior, ejercicio } = outcome.data as {
        omitidos: ApartadoOmitido[];
        ejercicioAnterior: number;
        ejercicio: number;
      };

      return omitidos.map((o) => {
        const ref =
          o.numero !== undefined
            ? `Apartado ${String(o.numero).padStart(2, "0")}`
            : `Apartado ${o.nombre}`;
        return withText(
          "memory",
          ref,
          `Presente en ${ejercicioAnterior}, ausente en ${ejercicio}`,
          "high",
          {
            section: o.numero !== undefined ? String(o.numero).padStart(2, "0") : undefined,
            sectionTitle: o.nombre,
          }
        );
      });
    },
  },
  {
    id: "INTER_010",
    title: "Cifra comparativa incoherente con la memoria del ejercicio anterior",
    type: "interannual",
    defaultSeverity: "error",
    normativa: "PGC",
    referencia: "Coherencia de columnas comparativas entre memorias consecutivas",
    execute(data) {
      if (!data.memory || !data.priorYear?.memory) {
        return { passed: true, data: { skip: true } };
      }

      const ejercicioAnterior = data.priorYear.memory.keyData?.ejercicio;
      const ejercicio = data.memory.keyData?.ejercicio;
      if (!ejercicioAnterior || !ejercicio) {
        return { passed: true, data: { skip: true } };
      }
      const descuadres = detectarDescuadresComparativa(
        data.memory.tables ?? [],
        data.priorYear.memory.tables ?? [],
        ejercicio,
        ejercicioAnterior
      );

      if (descuadres.length === 0) {
        return { passed: true, data: { ejercicioAnterior, ejercicio } };
      }

      const action =
        `Revise las columnas «importe ${ejercicioAnterior}» de la memoria de ${ejercicio}: deben coincidir con las cifras de ${ejercicioAnterior} publicadas en la memoria de ese ejercicio.`;

      return {
        passed: false,
        severity: "error",
        diagnosis: `${descuadres.length} cifra(s) comparativa(s) no coinciden con la memoria de ${ejercicioAnterior}.`,
        sugerencia: action,
        data: {
          descuadres,
          ejercicioAnterior,
          ejercicio,
          docName: data.memory.metadata.archivo,
        },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        if (outcome.data.skip) {
          return seniorExplanationPass(
            "No hay dos memorias para contrastar las columnas comparativas."
          );
        }
        const { ejercicioAnterior, ejercicio } = outcome.data as {
          ejercicioAnterior: number;
          ejercicio: number;
        };
        return seniorExplanationPass(
          `Las cifras de ${ejercicioAnterior} citadas en la memoria de ${ejercicio} coinciden con la memoria publicada de ${ejercicioAnterior}.`
        );
      }

      const { descuadres, ejercicioAnterior, ejercicio } = outcome.data as {
        descuadres: DescuadreComparativa[];
        ejercicioAnterior: number;
        ejercicio: number;
      };

      const muestra = descuadres
        .slice(0, 3)
        .map(
          (d) =>
            `«${d.filaEtiqueta}»: ${formatEuro(d.valorMemoriaAnterior)} en memoria ${ejercicioAnterior} vs ${formatEuro(d.valorColumnaComparativa)} en columna ${ejercicioAnterior} de memoria ${ejercicio}`
        )
        .join("; ");

      return seniorExplanation(
        outcome.diagnosis ??
          `${descuadres.length} cifra(s) del ejercicio ${ejercicioAnterior} no cuadran entre memorias.`,
        `Es normal que varien los importes del ejercicio actual (${ejercicio}); lo crítico es que la columna comparativa de ${ejercicioAnterior} reproduzca fielmente lo ya publicado.`,
        outcome.sugerencia ??
          `Corrija las referencias a ${ejercicioAnterior} en la memoria de ${ejercicio}. Ejemplos: ${muestra}.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const docName = outcome.data.docName as string | undefined;
      const { descuadres, ejercicioAnterior, ejercicio } = outcome.data as {
        descuadres: DescuadreComparativa[];
        ejercicioAnterior: number;
        ejercicio: number;
      };

      return descuadres.slice(0, 8).map((d) =>
        withMemoryLocator(
          d.apartado
            ? `Apartado ${d.apartado.padStart(2, "0")} — ${d.filaEtiqueta}`
            : d.filaEtiqueta,
          `Memoria ${ejercicioAnterior}: ${formatEuro(d.valorMemoriaAnterior)} · Columna ${ejercicioAnterior} en memoria ${ejercicio}: ${formatEuro(d.valorColumnaComparativa)}`,
          {
            documentName: docName,
            page: d.pagina,
            section: d.apartado?.replace(/\D/g, "").padStart(2, "0"),
            sectionTitle: d.tablaTitulo,
          },
          "high"
        )
      );
    },
  },
];
