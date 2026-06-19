import { getAccounts } from "@/lib/case/build-case-data";

import { seniorExplanation, seniorExplanationPass } from "@/lib/rules/helpers/explanation";

import { formatEuro } from "@/lib/rules/helpers/accounts";

import { fromTrackingValue, withText } from "@/lib/rules/helpers/evidence";

import { cuentaByPrefixTracked, sumByPrefixTracked } from "@/lib/tracking/excel";

import type { CaseData, PropuestaAplicacion } from "@/types/case-data";

import type { TrackingValue } from "@/types/tracking";

import { unwrapValue } from "@/types/tracking";

import type { RuleDefinition } from "../types";

import { withinTolerance } from "../types";



const TOLERANCIA = 1;



interface CuadreFila {

  concepto: string;

  memoriaActual?: TrackingValue<number>;

  memoriaAnteriorCol?: TrackingValue<number>;

  memoriaPriorEjercicio?: TrackingValue<number>;

  excel?: TrackingValue<number>;

  historicoCuadra?: boolean;

  actualCuadra?: boolean;

}



function compararPar(

  a: TrackingValue<number> | undefined,

  b: TrackingValue<number> | undefined

): boolean | undefined {

  const va = unwrapValue(a);

  const vb = unwrapValue(b);

  if (va === undefined || vb === undefined) return undefined;

  return withinTolerance(va, vb, TOLERANCIA);

}



function construirFilasCuadre(data: CaseData): CuadreFila[] {

  const actual = data.memory?.propuestaAplicacion;

  const prior = data.priorYear?.memory?.propuestaAplicacion;

  const accounts = getAccounts(data);

  const calcisReserva = data.excel?.calcis?.reservaCapitalizacion ?? undefined;

  const cuenta129 = cuentaByPrefixTracked(accounts, "129");

  const cuenta113 = sumByPrefixTracked(accounts, ["113"]);



  const filas: CuadreFila[] = [

    {

      concepto: "Pérdidas y ganancias",

      memoriaActual: actual?.resultadoEjercicio,

      memoriaAnteriorCol: actual?.resultadoEjercicioAnterior,

      memoriaPriorEjercicio: prior?.resultadoEjercicio,

      excel: cuenta129,

    },

    {

      concepto: "Reserva de capitalización",

      memoriaActual: actual?.reservaIndisponible,

      memoriaAnteriorCol: actual?.reservaIndisponibleAnterior,

      memoriaPriorEjercicio: prior?.reservaIndisponible,

      excel: calcisReserva,

    },

    {

      concepto: "Reservas voluntarias",

      memoriaActual: actual?.reservasVoluntarias,

      memoriaAnteriorCol: actual?.reservasVoluntariasAnterior,

      memoriaPriorEjercicio: prior?.reservasVoluntarias,

      excel: cuenta113,

    },

  ];



  return filas.map((fila) => ({

    ...fila,

    historicoCuadra: compararPar(fila.memoriaAnteriorCol, fila.memoriaPriorEjercicio),

    actualCuadra: compararPar(fila.memoriaActual, fila.excel),

  }));

}



function tieneCifrasPropuesta(propuesta?: PropuestaAplicacion): boolean {

  if (!propuesta) return false;

  return [

    propuesta.resultadoEjercicio,

    propuesta.resultadoEjercicioAnterior,

    propuesta.reservaIndisponible,

    propuesta.reservaIndisponibleAnterior,

    propuesta.reservasVoluntarias,

    propuesta.reservasVoluntariasAnterior,

  ].some((v) => unwrapValue(v) !== undefined);

}



function resumirDescuadres(filas: CuadreFila[], campo: "historicoCuadra" | "actualCuadra"): string[] {

  return filas

    .filter((f) => f[campo] === false)

    .map((f) => {

      if (campo === "historicoCuadra") {

        return `${f.concepto}: memoria actual (${formatEuro(unwrapValue(f.memoriaAnteriorCol)!)}) ≠ memoria anterior (${formatEuro(unwrapValue(f.memoriaPriorEjercicio)!)})`;

      }

      return `${f.concepto}: memoria (${formatEuro(unwrapValue(f.memoriaActual)!)}) ≠ Excel (${formatEuro(unwrapValue(f.excel)!)})`;

    });

}



export const cuadreValoresMemoriaRules: RuleDefinition[] = [

  {

    id: "FIN_002",

    title: "Cuadre de valores en propuesta de aplicación",

    type: "cross",

    defaultSeverity: "error",

    normativa: "PGC",

    referencia: "Apartado 03 — propuesta de aplicación del resultado",

    execute(data: CaseData) {

      if (data.memory?.keyData.tipoMemoria !== "normal") {

        return { passed: true, data: { skipped: true, reason: "no_normal" } };

      }



      const propuesta = data.memory?.propuestaAplicacion;

      if (!propuesta?.tieneApartado) {

        return {

          passed: false,

          severity: "error",

          sugerencia:

            "Incluya el apartado de propuesta de aplicación del resultado para validar el cuadre de valores.",

          data: { skipped: false, tieneApartado: false, filas: [] as CuadreFila[] },

        };

      }



      if (!tieneCifrasPropuesta(propuesta)) {

        return {

          passed: true,

          data: { skipped: true, reason: "sin_cifras_tabla", tieneApartado: true, filas: [] as CuadreFila[] },

        };

      }



      const filas = construirFilasCuadre(data);

      const historicosEvaluables = filas.filter((f) => f.historicoCuadra !== undefined);

      const actualesEvaluables = filas.filter((f) => f.actualCuadra !== undefined);



      const historicoOk =

        historicosEvaluables.length === 0 ||

        historicosEvaluables.every((f) => f.historicoCuadra === true);

      const actualOk =

        actualesEvaluables.length === 0 || actualesEvaluables.every((f) => f.actualCuadra === true);



      const passed = historicoOk && actualOk;

      const descuadresHistoricos = resumirDescuadres(filas, "historicoCuadra");

      const descuadresActuales = resumirDescuadres(filas, "actualCuadra");



      return {

        passed,

        severity: passed ? undefined : "error",

        sugerencia: passed

          ? undefined

          : [

              descuadresHistoricos.length > 0

                ? `Histórico: ${descuadresHistoricos.join("; ")}`

                : null,

              descuadresActuales.length > 0

                ? `Ejercicio actual: ${descuadresActuales.join("; ")}`

                : null,

            ]

              .filter(Boolean)

              .join(". "),

        data: {

          skipped: false,

          tieneApartado: true,

          ejercicio: data.metadata.ejercicio,

          ejercicioAnterior: data.priorYear?.ejercicio,

          historicoOk,

          actualOk,

          filas,

          descuadresHistoricos,

          descuadresActuales,

        },

      };

    },

    explanation(outcome) {

      if (outcome.data.skipped) {

        return seniorExplanationPass("Regla no aplicable o sin cifras en la tabla de propuesta de aplicación.");

      }

      if (outcome.passed) {

        return seniorExplanationPass(

          "Los valores de la propuesta de aplicación cuadran entre memoria, ejercicio anterior y Excel."

        );

      }



      const tieneApartado = outcome.data.tieneApartado as boolean;

      if (!tieneApartado) {

        return seniorExplanation(

          "No se detecta el apartado de propuesta de aplicación del resultado.",

          "Sin este apartado no es posible validar el cuadre entre memoria, histórico y libro de cierre.",

          "Añada el apartado 03 con las tablas BASE DE REPARTO y DISTRIBUCIÓN."

        );

      }



      const descuadresHistoricos = outcome.data.descuadresHistoricos as string[];

      const descuadresActuales = outcome.data.descuadresActuales as string[];

      const partes: string[] = [];

      if (descuadresHistoricos.length > 0) {

        partes.push(`Columna comparativa vs memoria anterior: ${descuadresHistoricos.join("; ")}`);

      }

      if (descuadresActuales.length > 0) {

        partes.push(`Ejercicio actual vs Excel (cuenta 129 / CALCIS): ${descuadresActuales.join("; ")}`);

      }



      return seniorExplanation(

        partes.join(". ") || "Hay descuadres en la propuesta de aplicación del resultado.",

        "La columna del ejercicio anterior debe coincidir con la memoria del año previo; la del ejercicio actual con la cuenta 129 y CALCIS.",

        outcome.sugerencia ?? "Revise las tablas del apartado 03 y el libro de cierre."

      );

    },

    evidence(outcome) {

      if (outcome.passed || outcome.data.skipped) return [];



      const filas = (outcome.data.filas ?? []) as CuadreFila[];

      const ev: ReturnType<RuleDefinition["evidence"]> = [];



      for (const fila of filas) {

        if (fila.actualCuadra === false) {

          if (fila.memoriaActual) {

            ev.push(fromTrackingValue(fila.memoriaActual, "high", fila.concepto));

          }

          if (fila.excel) {

            ev.push(fromTrackingValue(fila.excel, "high", fila.concepto));

          }

        }

        if (fila.historicoCuadra === false) {

          if (fila.memoriaAnteriorCol) {

            ev.push(fromTrackingValue(fila.memoriaAnteriorCol, "medium", `${fila.concepto} (columna ejercicio anterior)`));

          }

          if (fila.memoriaPriorEjercicio) {

            ev.push(fromTrackingValue(fila.memoriaPriorEjercicio, "medium", `${fila.concepto} (memoria ejercicio anterior)`));

          }

        }

      }



      if (!outcome.data.tieneApartado) {

        ev.push(

          withText("memory", "Apartado propuesta de aplicación", "No detectado", "high")

        );

      }



      return ev;

    },

  },

];


