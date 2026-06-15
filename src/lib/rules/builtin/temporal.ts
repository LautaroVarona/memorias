import { seniorExplanation, seniorExplanationPass } from "@/lib/rules/helpers/explanation";
import { withText } from "@/lib/rules/helpers/evidence";
import type { AnioMencionado } from "@/types/domain";
import type { RuleDefinition } from "../types";

/**
 * Reglas de coherencia temporal de la memoria. Detectan el error más
 * frecuente en memorias generadas por arrastre del ejercicio anterior:
 * párrafos con años obsoletos y boilerplate caducado (pandemia, estado
 * de alarma...) que nadie actualizó.
 */

/** Contextos en los que un año desfasado es un error de arrastre casi seguro */
const CONTEXTO_EJERCICIO =
  /(ejercicio|cuentas anuales|cierre|previsiones|elaboraci[óo]n|presente memoria|a 31\/12)/i;

/** Contextos legítimos para años antiguos */
const CONTEXTO_HISTORICO =
  /(constituy[óo]|inscrita|inscripci[óo]n|escritura|fundaci[óo]n|consolida fiscalmente desde|desde el ejercicio|b\.? ?i\.? ?neg|bases? imponibles? negativas?|ejer\.|compensar|deducci[óo]n|generad|medioambiente|leasing|revalorizaci[óo]n)/i;

function aniosSospechosos(anios: AnioMencionado[], ejercicio: number): AnioMencionado[] {
  return anios.filter((a) => {
    if (a.esReferenciaLegal) return false;
    // El ejercicio actual, el anterior (columna comparativa) y el siguiente
    // (formulación) son siempre válidos.
    if (a.anio >= ejercicio - 1 && a.anio <= ejercicio + 1) return false;
    if (!CONTEXTO_EJERCICIO.test(a.contexto)) return false;
    if (CONTEXTO_HISTORICO.test(a.contexto)) return false;
    return true;
  });
}

export const temporalRules: RuleDefinition[] = [
  {
    id: "TEMP_001",
    title: "Años obsoletos en el texto de la memoria",
    type: "narrative",
    defaultSeverity: "critical",
    normativa: "PGC — imagen fiel",
    referencia: "Memoria — coherencia temporal",
    execute(data) {
      if (!data.memory) return { passed: true, data: { skip: true } };
      const ejercicio = data.memory.keyData.ejercicio ?? data.metadata.ejercicio;
      const sospechosos = aniosSospechosos(data.memory.years, ejercicio);
      return {
        passed: sospechosos.length === 0,
        severity: "critical",
        sugerencia:
          "Actualice los párrafos señalados: son texto arrastrado de memorias de ejercicios anteriores.",
        data: { sospechosos, ejercicio },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("Los años mencionados en la memoria son coherentes con el ejercicio.");
      }
      const { sospechosos, ejercicio } = outcome.data as { sospechosos: AnioMencionado[]; ejercicio: number };
      const lista = [...new Set(sospechosos.map((s) => s.anio))].join(", ");
      return seniorExplanation(
        `La memoria del ejercicio ${ejercicio} contiene ${sospechosos.length} referencia(s) a ejercicios incompatibles: ${lista}.`,
        `Es el patrón típico de una memoria construida sobre la del año anterior sin actualizar todos los párrafos, lo que compromete la imagen fiel y delata el arrastre ante el Registro.`,
        `Localice cada párrafo señalado y actualice el año o reescriba el texto si la circunstancia ya no aplica.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      return ((outcome.data.sospechosos as AnioMencionado[]) ?? [])
        .slice(0, 6)
        .map((s) => withText("memory", `Mención a ${s.anio}`, `…${s.contexto}…`, "high"));
    },
  },
  {
    id: "TEMP_002",
    title: "Texto de plantilla caducado (pandemia, estado de alarma...)",
    type: "narrative",
    defaultSeverity: "warning",
    normativa: "PGC",
    referencia: "Memoria — hechos posteriores y aspectos críticos",
    execute(data) {
      if (!data.memory) return { passed: true, data: { skip: true } };
      const ejercicio = data.memory.keyData.ejercicio ?? data.metadata.ejercicio;
      const texto = data.memory.fullText;

      const detecciones: { patron: string; fragmento: string; critico: boolean }[] = [];
      const boilerplate: { regex: RegExp; etiqueta: string; desde: number; critico: boolean }[] = [
        { regex: /estado de alarma/gi, etiqueta: "estado de alarma", desde: 2022, critico: true },
        { regex: /expansi[óo]n de esta pandemia|la pandemia de la COVID-?19|crisis sanitaria/gi, etiqueta: "pandemia COVID-19", desde: 2023, critico: false },
        { regex: /guerra de Ucrania/gi, etiqueta: "guerra de Ucrania", desde: 2025, critico: false },
      ];

      for (const b of boilerplate) {
        if (ejercicio < b.desde) continue;
        let m: RegExpExecArray | null;
        while ((m = b.regex.exec(texto)) !== null) {
          const start = Math.max(0, m.index - 60);
          const fragmento = texto.slice(start, m.index + m[0].length + 60).replace(/\s+/g, " ").trim();
          detecciones.push({ patron: b.etiqueta, fragmento, critico: b.critico });
        }
      }

      return {
        passed: detecciones.length === 0,
        severity: detecciones.some((d) => d.critico) ? "critical" : "warning",
        sugerencia: "Elimine o reescriba el texto de plantilla que ya no refleja la situación actual.",
        data: { detecciones, ejercicio },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("No se detectó texto de plantilla caducado en la memoria.");
      }
      const { detecciones, ejercicio } = outcome.data as {
        detecciones: { patron: string }[];
        ejercicio: number;
      };
      const patrones = [...new Set(detecciones.map((d) => d.patron))].join(", ");
      return seniorExplanation(
        `La memoria del ejercicio ${ejercicio} mantiene texto de plantilla caducado: ${patrones}.`,
        `Estos párrafos (típicos de hechos posteriores o aspectos críticos de 2020-2022) se arrastran de plantillas antiguas y son incoherentes con el ejercicio que se formula.`,
        `Reescriba los apartados de hechos posteriores y aspectos críticos con la situación real del cierre.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      return ((outcome.data.detecciones as { patron: string; fragmento: string }[]) ?? [])
        .slice(0, 5)
        .map((d) => withText("memory", d.patron, `…${d.fragmento}…`, "high"));
    },
  },
  {
    id: "TEMP_003",
    title: "Coherencia de ejercicio entre memorias",
    type: "cross",
    defaultSeverity: "critical",
    normativa: "PGC",
    referencia: "Coherencia entre memorias del expediente",
    execute(data) {
      const ejercicioActual = data.memory?.keyData.ejercicio;
      const ejercicioAnterior =
        data.priorYear?.memory?.keyData?.ejercicio ?? data.priorYear?.ejercicio;

      // El ejercicio del Excel/libro de cierre no se usa: solo importan las memorias (.DOC).
      if (ejercicioActual === undefined || !data.priorYear?.memory) {
        return { passed: true, data: { skip: true } };
      }
      if (ejercicioAnterior === undefined || ejercicioAnterior <= 0) {
        return { passed: true, data: { skip: true } };
      }

      const consecutivos = ejercicioActual === ejercicioAnterior + 1;

      return {
        passed: consecutivos,
        severity: "critical",
        sugerencia:
          "Compruebe que la memoria del ejercicio actual y la del ejercicio anterior son las correctas.",
        data: { ejercicioActual, ejercicioAnterior },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        if (outcome.data.skip) {
          return seniorExplanationPass(
            "No hay dos memorias con ejercicio detectado; no se contrastan años entre documentos."
          );
        }
        return seniorExplanationPass(
          "Los ejercicios de la memoria actual y de la memoria anterior son consecutivos."
        );
      }
      const { ejercicioActual, ejercicioAnterior } = outcome.data as {
        ejercicioActual: number;
        ejercicioAnterior: number;
      };
      if (ejercicioActual === ejercicioAnterior) {
        return seniorExplanation(
          `Las dos memorias del expediente indican el mismo ejercicio (${ejercicioActual}).`,
          `Probablemente se subió dos veces la memoria del mismo año o falta la del ejercicio anterior.`,
          `Revise los archivos .DOC antes de continuar.`
        );
      }
      return seniorExplanation(
        `La memoria del ejercicio actual es ${ejercicioActual} pero la memoria anterior indica ${ejercicioAnterior}.`,
        `No son ejercicios consecutivos; puede haber un documento del año equivocado.`,
        `Verifique que cada .DOC corresponde al ejercicio que debe revisar.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const { ejercicioActual, ejercicioAnterior } = outcome.data as {
        ejercicioActual: number;
        ejercicioAnterior: number;
      };
      return [
        withText("memory", "Ejercicio en memoria actual", String(ejercicioActual), "high"),
        withText("memory", "Ejercicio en memoria anterior", String(ejercicioAnterior), "high"),
      ];
    },
  },
  {
    id: "TEMP_004",
    title: "Fecha de formulación de las cuentas",
    type: "formal",
    defaultSeverity: "warning",
    normativa: "LSC art. 253",
    referencia: "Formulación en los 3 meses siguientes al cierre",
    execute(data) {
      const fecha = data.memory?.keyData.fechaFormulacion;
      const ejercicio = data.memory?.keyData.ejercicio ?? data.metadata.ejercicio;
      if (!fecha || !ejercicio) {
        return {
          passed: !data.memory || !!fecha,
          severity: "warning",
          sugerencia: "Añada la fecha de formulación y la firma del órgano de administración.",
          data: { sinFecha: !!data.memory && !fecha },
        };
      }
      const [, mes, anio] = fecha.split("/").map((p) => parseInt(p, 10));
      const enPlazo = anio === ejercicio + 1 && mes <= 3 && mes >= 1;
      return {
        passed: enPlazo,
        severity: "warning",
        sugerencia: "Compruebe la fecha de formulación: debe ser dentro de los 3 meses tras el cierre.",
        data: { fecha, ejercicio },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("La fecha de formulación es coherente con el cierre del ejercicio.");
      }
      if (outcome.data.sinFecha) {
        return seniorExplanation(
          "No se ha localizado la fecha de formulación de las cuentas anuales en la memoria.",
          "Sin fecha de formulación y firma, las cuentas no pueden depositarse en el Registro Mercantil.",
          "Complete el bloque final de formulación con lugar, fecha y firmante."
        );
      }
      const { fecha, ejercicio } = outcome.data as { fecha: string; ejercicio: number };
      return seniorExplanation(
        `La fecha de formulación (${fecha}) no está dentro de los 3 meses posteriores al cierre del ejercicio ${ejercicio}.`,
        `El artículo 253 LSC exige formular las cuentas en el plazo máximo de tres meses desde el cierre (normalmente antes del 31/03).`,
        `Compruebe si la fecha es un arrastre de la memoria anterior o si la formulación fue realmente extemporánea.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      if (outcome.data.sinFecha) {
        return [withText("memory", "Formulación", "No localizada en el documento", "medium")];
      }
      const { fecha } = outcome.data as { fecha: string };
      return [withText("memory", "Fecha de formulación", fecha, "high")];
    },
  },
];
