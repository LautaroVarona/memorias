import reglasFiscales from "../../../../data/pgc/reglas-fiscales.json";
import { clasificarEmpresa } from "@/lib/classifier";
import { seniorExplanation, seniorExplanationPass } from "@/lib/rules/helpers/explanation";
import { withEuro, withText } from "@/lib/rules/helpers/evidence";
import { formatEuro } from "@/lib/rules/helpers/accounts";
import type { TipoEmpresa } from "@/types/domain";
import type { RuleDefinition } from "../types";

const UMBRAL = reglasFiscales.variacionInteranualUmbral as number;

const KEY_SECTIONS = [
  { id: "vinculadas", keywords: ["operaciones vinculadas", "partes vinculadas"] },
  { id: "fiscal", keywords: ["situación fiscal", "impuesto sobre sociedades", "conciliación fiscal"] },
];

function variacionPct(actual: number, anterior: number): number {
  if (anterior === 0) return actual === 0 ? 0 : 1;
  return Math.abs((actual - anterior) / anterior);
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
    id: "INTER_001",
    title: "Variación significativa interanual",
    type: "interannual",
    defaultSeverity: "warning",
    normativa: "PGC",
    referencia: "Análisis interanual",
    execute(data) {
      const balance = data.financials.balance;
      const antBalance = data.priorYear?.financials.balance;
      if (!balance || !antBalance) {
        return { passed: true, data: { skip: true } };
      }

      const varActivo = variacionPct(balance.activo.total, antBalance.activo.total);
      const varResultado = variacionPct(balance.resultado, antBalance.resultado);
      const triggered = varActivo > UMBRAL || varResultado > UMBRAL;

      return {
        passed: !triggered,
        severity: "warning",
        sugerencia: "Documente en la memoria las causas de la variación significativa.",
        data: {
          varActivo,
          varResultado,
          activoActual: balance.activo.total,
          activoAnterior: antBalance.activo.total,
          resultadoActual: balance.resultado,
          resultadoAnterior: antBalance.resultado,
          ejercicioAnterior: data.priorYear!.ejercicio,
          ejercicio: data.metadata.ejercicio,
        },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("Las variaciones interanuales están dentro del umbral del 30%.");
      }
      const ctx = outcome.data as {
        varActivo: number;
        varResultado: number;
        activoActual: number;
        activoAnterior: number;
        resultadoActual: number;
        resultadoAnterior: number;
        ejercicioAnterior: number;
      };
      return seniorExplanation(
        `Variación significativa entre ejercicios: activo ${(ctx.varActivo * 100).toFixed(1)}% (${formatEuro(ctx.activoAnterior)} → ${formatEuro(ctx.activoActual)}) y resultado ${(ctx.varResultado * 100).toFixed(1)}% (${formatEuro(ctx.resultadoAnterior)} → ${formatEuro(ctx.resultadoActual)}).`,
        `Cambios de esta magnitud suelen requerir explicación en la memoria para que el cierre sea comprensible.`,
        `Documente en la memoria las causas (adquisiciones, desinversiones, cambio de actividad, etc.).`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const ctx = outcome.data as {
        activoActual: number;
        activoAnterior: number;
        resultadoActual: number;
        resultadoAnterior: number;
        ejercicioAnterior: number;
        ejercicio: number;
      };
      return [
        withEuro("excel", `Activo ${ctx.ejercicioAnterior}`, ctx.activoAnterior, "high"),
        withEuro("excel", `Activo ${ctx.ejercicio}`, ctx.activoActual, "high"),
        withEuro("excel", `Resultado ${ctx.ejercicioAnterior}`, ctx.resultadoAnterior, "medium"),
        withEuro("excel", `Resultado ${ctx.ejercicio}`, ctx.resultadoActual, "medium"),
      ];
    },
  },
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
];
