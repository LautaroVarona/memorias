import { seniorExplanation, seniorExplanationPass } from "@/lib/rules/helpers/explanation";
import { withEuro, withText, fromTrackingValue } from "@/lib/rules/helpers/evidence";
import { formatEuro } from "@/lib/rules/helpers/accounts";
import { validateNumbersWithExcel } from "@/lib/validation/validate-numbers-with-excel";
import type { CaseData } from "@/types/case-data";
import { unwrapValue } from "@/types/tracking";
import type { RuleDefinition } from "../types";
import { withinTolerance } from "../types";

export const distribucionRules: RuleDefinition[] = [
  {
    id: "DIST_001",
    title: "Reserva de capitalización indisponible",
    type: "cross",
    defaultSeverity: "error",
    normativa: "LIS",
    referencia: "Art. 25 LIS — reserva de capitalización indisponible",
    execute(data: CaseData) {
      if (data.memory?.keyData.tipoMemoria !== "normal") {
        return { passed: true, data: { skipped: true, reason: "no_normal" } };
      }

      const propuesta = data.memory?.propuestaAplicacion;
      const validacion = validateNumbersWithExcel(data);
      const excelReserva = data.excel?.calcis?.reservaCapitalizacion ?? undefined;
      const memReserva = unwrapValue(propuesta?.reservaIndisponible);
      const tieneApartado = propuesta?.tieneApartado ?? false;

      if (!tieneApartado) {
        return {
          passed: false,
          severity: "error",
          sugerencia:
            "Incluya el apartado de propuesta de aplicación del resultado en la memoria Normal.",
          data: { tieneApartado, excelReserva, memReserva },
        };
      }

      if (excelReserva === undefined && memReserva === undefined) {
        return {
          passed: true,
          data: { skipped: true, reason: "sin_cifras", tieneApartado },
        };
      }

      if (excelReserva !== undefined && memReserva !== undefined) {
        const excelVal = unwrapValue(excelReserva)!;
        const cuadra =
          validacion.reservaCapitalizacion?.comparable === true
            ? validacion.reservaCapitalizacion.cuadra
            : withinTolerance(excelVal, memReserva, 1);
        return {
          passed: cuadra,
          severity: cuadra ? undefined : "error",
          sugerencia: cuadra
            ? undefined
            : "Revise la reserva de capitalización indisponible en CALCIS y en la propuesta de aplicación.",
          data: {
            tieneApartado,
            excelReserva: excelVal,
            memReserva,
            cuadra,
            excelReservaTracked: excelReserva,
            memReservaTracked: propuesta?.reservaIndisponible,
          },
        };
      }

      const soloExcel = excelReserva !== undefined && memReserva === undefined;
      const soloMemoria = memReserva !== undefined && excelReserva === undefined;

      return {
        passed: false,
        severity: "warning",
        sugerencia: soloExcel
          ? "La hoja CALCIS muestra reserva de capitalización pero la memoria no la refleja en la propuesta de aplicación."
          : "La memoria declara reserva indisponible pero no se localiza en la hoja CALCIS ni en cuenta 1146.",
        data: {
          tieneApartado,
          excelReserva: unwrapValue(excelReserva),
          memReserva,
          soloExcel,
          soloMemoria,
          excelReservaTracked: excelReserva,
          memReservaTracked: propuesta?.reservaIndisponible,
        },
      };
    },
    explanation(outcome) {
      if (outcome.data.skipped) {
        return seniorExplanationPass("Regla no aplicable o sin cifras de reserva de capitalización.");
      }
      if (outcome.passed) {
        return seniorExplanationPass(
          "La reserva de capitalización indisponible cuadra entre CALCIS y la memoria."
        );
      }

      const excelReserva = outcome.data.excelReserva as number | undefined;
      const memReserva = outcome.data.memReserva as number | undefined;
      const tieneApartado = outcome.data.tieneApartado as boolean;

      if (!tieneApartado) {
        return seniorExplanation(
          "La memoria Normal no incluye el apartado de propuesta de aplicación del resultado.",
          "Es un apartado obligatorio en memorias Normal para documentar la distribución del resultado.",
          "Añada el apartado de propuesta de aplicación con el desglose legal de reservas y dividendos."
        );
      }

      if (excelReserva !== undefined && memReserva !== undefined) {
        return seniorExplanation(
          `CALCIS registra ${formatEuro(excelReserva)} de reserva de capitalización frente a ${formatEuro(memReserva)} en la memoria.`,
          "La reserva de capitalización indisponible (art. 25 LIS) debe coincidir entre el libro de cierre y la memoria.",
          "Ajuste la propuesta de aplicación o revise el epígrafe en la hoja CALCIS / cuenta 1146."
        );
      }

      return seniorExplanation(
        excelReserva !== undefined
          ? `CALCIS muestra ${formatEuro(excelReserva)} de reserva de capitalización sin cifra equivalente en la memoria.`
          : `La memoria declara ${formatEuro(memReserva!)} de reserva indisponible sin respaldo en CALCIS.`,
        "El cruce Excel–memoria permite detectar omisiones en la propuesta de aplicación.",
        outcome.sugerencia ?? "Revise CALCIS, cuenta 1146 y el apartado de propuesta de aplicación."
      );
    },
    evidence(outcome) {
      if (outcome.passed || outcome.data.skipped) return [];

      const excelReserva = outcome.data.excelReserva as number | undefined;
      const memReserva = outcome.data.memReserva as number | undefined;
      const ev: ReturnType<RuleDefinition["evidence"]> = [];

      if (excelReserva !== undefined) {
        const tracked = outcome.data.excelReservaTracked as import("@/types/tracking").TrackingValue<number> | undefined;
        if (tracked) {
          ev.push(fromTrackingValue(tracked, "high"));
        } else {
          ev.push(
            withEuro("excel", "Reserva capitalización (CALCIS)", outcome.data.excelReserva as number, "high", undefined, {
              sheet: "calcis",
            })
          );
        }
      }
      if (memReserva !== undefined) {
        const tracked = outcome.data.memReservaTracked as import("@/types/tracking").TrackingValue<number> | undefined;
        if (tracked) {
          ev.push(fromTrackingValue(tracked, "high"));
        } else {
          ev.push(
            withEuro("memory", "Reserva indisponible (memoria)", memReserva, "high", undefined, {
              sectionTitle: "Propuesta de aplicación del resultado",
            })
          );
        }
      }
      if (!outcome.data.tieneApartado) {
        ev.push(
          withText(
            "memory",
            "Apartado propuesta de aplicación",
            "No detectado en memoria Normal",
            "high"
          )
        );
      }
      return ev;
    },
  },
];
