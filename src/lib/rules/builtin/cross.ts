import { getAccounts, hasStatement } from "@/lib/case/build-case-data";
import { seniorExplanation, seniorExplanationPass, seniorIssue } from "@/lib/rules/helpers/explanation";
import { buildCrossEvidence, enrichEvidence, withEuro, withExcelCell, withMemoryLocator, withText } from "@/lib/rules/helpers/evidence";
import {
  breakdownGroupAccounts,
  dominantGroupCategory,
  GROUP_CATEGORY_LABELS,
  severityByGroupTotal,
} from "@/lib/rules/helpers/group-accounts";
import {
  buildVinculadasExcelBreakdown,
  categoryLabel,
  computeVinculadasTotals,
  diagnoseVinculadasMismatch,
  DIAGNOSIS_LABELS,
} from "@/lib/rules/helpers/vinculadas";
import { compareWithTolerance, formatEuro, sumByPrefix } from "@/lib/rules/helpers/accounts";
import type { CuentaNormalizada } from "@/types/domain";
import type { RuleDefinition } from "../types";

const GROUP_PREFIXES = ["24", "25", "552", "242", "43", "40"];

function filterGroupAccounts(accounts: CuentaNormalizada[]) {
  return accounts.filter(
    (c) =>
      Math.abs(c.saldo) > 0 &&
      GROUP_PREFIXES.some((p) => c.cuenta.startsWith(p))
  );
}

export const crossRules: RuleDefinition[] = [
  {
    id: "CROSS_001",
    title: "Operaciones vinculadas no reflejadas",
    type: "cross",
    defaultSeverity: "error",
    normativa: "PGC",
    referencia: "Memoria — operaciones vinculadas",
    execute(data) {
      const accounts = getAccounts(data);
      const groupAccounts = filterGroupAccounts(accounts);
      const totals = computeVinculadasTotals(data, groupAccounts);
      const memorySaysNo = hasStatement(data, "vinculadas", true);
      const breakdown = breakdownGroupAccounts(groupAccounts);
      const dominantType = dominantGroupCategory(breakdown);
      const sourceText = data.memory?.statements.find((s) => s.type === "vinculadas")?.sourceText;
      const diagnosis = diagnoseVinculadasMismatch(totals, memorySaysNo);
      const vinculadasIdx = data.memory?.fullText.toLowerCase().search(/vinculad|operaciones con partes vinculadas/i) ?? -1;
      const memoryPage =
        vinculadasIdx >= 0
          ? Math.max(1, (data.memory!.fullText.slice(0, vinculadasIdx).match(/\f/g) || []).length + 1)
          : undefined;

      const hasGroupBalance = totals.excel.total > 10_000;
      const descuadreTotal =
        totals.memoria.total > 0 &&
        totals.diferencia > Math.max(1_000, totals.excel.total * 0.05);
      const triggered = (hasGroupBalance && memorySaysNo) || descuadreTotal;

      return {
        passed: !triggered,
        severity: triggered ? severityByGroupTotal(totals.excel.total) : undefined,
        warningLevel: "high",
        tags: ["cross-document"],
        diagnosis: triggered ? DIAGNOSIS_LABELS[diagnosis] : undefined,
        sugerencia: triggered
          ? "Actualice el apartado de vinculadas con los importes del cierre definitivo."
          : undefined,
        data: {
          hasGroupBalance,
          memorySaysNo,
          totals,
          breakdown,
          dominantType,
          groupAccounts,
          sourceText,
          diagnosis,
          descuadreTotal,
          excelDoc: data.financials.libroCierre?.hojasDetectadas?.[0],
          memoryDoc: data.memory?.metadata.archivo,
          memoryPage,
        },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass(
          "Las operaciones vinculadas son coherentes entre contabilidad y memoria."
        );
      }
      const d = outcome.data;
      const totals = d.totals as ReturnType<typeof computeVinculadasTotals>;
      const diagnosis = d.diagnosis as keyof typeof DIAGNOSIS_LABELS;
      const dominant = d.dominantType as keyof typeof GROUP_CATEGORY_LABELS;
      const tema = GROUP_CATEGORY_LABELS[dominant] ?? GROUP_CATEGORY_LABELS.mixto;
      const memorySaysNo = d.memorySaysNo as boolean;

      const what = memorySaysNo
        ? `Excel muestra ${formatEuro(totals.excel.total)} en vinculadas (${tema}) y la memoria niega su existencia.`
        : `Total vinculadas Excel ${formatEuro(totals.excel.total)} vs memoria ${formatEuro(totals.memoria.total)} (diferencia ${formatEuro(totals.diferencia)}).`;

      const issue = seniorIssue(
        what,
        `Las operaciones con partes vinculadas son de las más revisadas; un descuadre debilita la defensa del cierre.`,
        `Revise apartado 09: clientes grupo ${formatEuro(totals.excel.clientesGrupo)}, proveedores ${formatEuro(totals.excel.proveedoresGrupo)}, préstamos ${formatEuro(totals.excel.prestamos)}.`,
        DIAGNOSIS_LABELS[diagnosis]
      );
      return issue.explanation;
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const totals = outcome.data.totals as ReturnType<typeof computeVinculadasTotals>;
      const sourceText = outcome.data.sourceText as string | undefined;
      const diagnosis = outcome.data.diagnosis as string;
      const groupAccounts = (outcome.data.groupAccounts as CuentaNormalizada[]) ?? [];
      const breakdown = buildVinculadasExcelBreakdown(groupAccounts);
      const excelDoc = outcome.data.excelDoc as string | undefined;

      const ev = [
        withEuro("excel", "Total vinculadas Excel", totals.excel.total, "high", undefined, {
          sheet: "SYS_cliente",
        }),
        withEuro("excel", "Clientes grupo", totals.excel.clientesGrupo, "medium", undefined, {
          sheet: "SYS_cliente",
          group: "clientes",
        }),
        withEuro("excel", "Proveedores grupo", totals.excel.proveedoresGrupo, "medium", undefined, {
          sheet: "SYS_cliente",
          group: "proveedores",
        }),
        withEuro("excel", "Préstamos intragrupo", totals.excel.prestamos, "high", undefined, {
          sheet: "SYS_cliente",
          group: "prestamos",
        }),
        withEuro("excel", "Participaciones", totals.excel.participaciones, "medium", undefined, {
          sheet: "SYS_cliente",
          group: "participaciones",
        }),
      ];

      for (const line of breakdown.slice(0, 12)) {
        ev.push(
          withExcelCell(
            `Cta ${line.cuenta} — ${line.descripcion}`,
            line.saldo,
            {
              sheet: line.hoja ?? "SYS_cliente",
              row: line.fila ?? 0,
              column: line.columna,
              documentName: excelDoc,
            },
            "high",
            undefined,
            categoryLabel(line.categoria)
          )
        );
      }

      if (totals.memoria.total > 0) {
        ev.push(withEuro("memory", "Total vinculadas memoria", totals.memoria.total, "high"));
        ev.push(withEuro("excel", "Diferencia Excel − memoria", totals.diferencia, "high"));
      }

      if (sourceText) {
        ev.push(
          withMemoryLocator(
            "Afirmación en memoria (apartado 09)",
            sourceText,
            {
              documentName: outcome.data.memoryDoc as string | undefined,
              page: outcome.data.memoryPage as number | undefined,
            },
            "high"
          )
        );
      }

      if (diagnosis) {
        ev.push(withText("memory", "Diagnóstico", DIAGNOSIS_LABELS[diagnosis as keyof typeof DIAGNOSIS_LABELS], "high"));
      }

      return enrichEvidence(ev);
    },
  },
  {
    id: "CROSS_002",
    title: "Activos financieros incoherentes",
    type: "cross",
    defaultSeverity: "warning",
    normativa: "PGC",
    referencia: "Memoria — notas a los EEFF",
    execute(data) {
      const accounts = getAccounts(data);
      const excelTotal = sumByPrefix(accounts, ["24", "25"]);
      const memoria = data.memory?.figures.activosFinancieros;
      const comparable = excelTotal > 0 && memoria !== undefined;
      const coherent = !comparable || compareWithTolerance(excelTotal, memoria!, 0.1);

      return {
        passed: coherent,
        severity: "warning",
        sugerencia: "Revise el desglose de activos financieros en la memoria.",
        data: { excelTotal, memoria, comparable },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("Los activos financieros coinciden entre contabilidad y memoria.");
      }
      const { excelTotal, memoria } = outcome.data as { excelTotal: number; memoria: number };
      return seniorExplanation(
        `Los activos financieros en contabilidad (${formatEuro(excelTotal)}) no coinciden con la cifra en memoria (${formatEuro(memoria)}).`,
        `Esta discrepancia puede indicar un error en las notas a los estados financieros o en la clasificación contable de inversiones.`,
        `Se recomienda revisar el desglose de activos financieros (cuentas 24x y 25x) y alinearlo con la memoria.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const { excelTotal, memoria } = outcome.data as { excelTotal: number; memoria: number };
      return buildCrossEvidence(
        "Total activos financieros (24x+25x)",
        excelTotal,
        "Activos financieros en memoria",
        memoria
      );
    },
  },
  {
    id: "CROSS_003",
    title: "Pasivos financieros incoherentes",
    type: "cross",
    defaultSeverity: "error",
    normativa: "PGC",
    referencia: "Memoria — notas a los EEFF",
    execute(data) {
      const accounts = getAccounts(data);
      const excelTotal = sumByPrefix(accounts, ["520", "170", "171", "172"]);
      const memoria = data.memory?.figures.pasivoTotal;
      const comparable = excelTotal > 5000 && memoria !== undefined;
      const coherent = !comparable || compareWithTolerance(excelTotal, memoria!, 0.1);

      return {
        passed: coherent,
        severity: "error",
        sugerencia: "Alinee la descripción de deudas en la memoria con los pasivos financieros del balance.",
        data: { excelTotal, memoria, comparable },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("Los pasivos financieros son coherentes entre contabilidad y memoria.");
      }
      const { excelTotal, memoria } = outcome.data as { excelTotal: number; memoria: number };
      return seniorExplanation(
        `Los pasivos financieros contables (${formatEuro(excelTotal)}) no coinciden con la cifra de pasivo en memoria (${formatEuro(memoria)}).`,
        `Puede tratarse de una omisión relevante en las notas sobre endeudamiento y obligaciones financieras.`,
        `Se recomienda revisar el apartado de deudas y compromisos financieros en la memoria.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const { excelTotal, memoria } = outcome.data as { excelTotal: number; memoria: number };
      return buildCrossEvidence(
        "Pasivos financieros (520, 170-172)",
        excelTotal,
        "Pasivo total en memoria",
        memoria
      );
    },
  },
  {
    id: "CROSS_004",
    title: "Ingresos vs actividad narrativa",
    type: "cross",
    defaultSeverity: "warning",
    normativa: "PGC",
    referencia: "Memoria — actividad y resultados",
    execute(data) {
      const accounts = getAccounts(data);
      const ingresos = sumByPrefix(accounts, ["700", "705"]);
      const describeActividad = data.memory?.statements.some((s) => s.type === "actividad") ?? false;
      const triggered = ingresos > 10_000 && !describeActividad;

      return {
        passed: !triggered,
        severity: "warning",
        sugerencia: "Incluya una descripción de la actividad y los ingresos en la memoria.",
        data: { ingresos, describeActividad },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass("Los ingresos contables están acompañados de descripción en la memoria.");
      }
      const ingresos = outcome.data.ingresos as number;
      return seniorExplanation(
        `Existen ingresos contables por ${formatEuro(ingresos)} en cuentas 700/705 sin descripción suficiente de la actividad en la memoria.`,
        `La ausencia de narrativa sobre la actividad debilita la coherencia del cierre y la utilidad informativa de la memoria.`,
        `Se recomienda incluir una descripción de la actividad principal y el origen de los ingresos de explotación.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      return enrichEvidence([
        withEuro("excel", "Ventas (700/705)", outcome.data.ingresos as number, "high"),
        withText("memory", "Descripción de actividad", "No detectada", "medium"),
      ]);
    },
  },
  {
    id: "CROSS_005",
    title: "Impuesto sobre sociedades incoherente",
    type: "cross",
    defaultSeverity: "error",
    normativa: "PGC",
    referencia: "Memoria — impuesto sobre sociedades",
    execute(data) {
      const accounts = getAccounts(data);
      const isExcel = sumByPrefix(accounts, ["630"]);
      const isMemoria = data.memory?.figures.impuestoSociedades;
      const comparable = isExcel > 0 && isMemoria !== undefined;
      const coherent = !comparable || compareWithTolerance(isExcel, isMemoria!, 0.05);

      return {
        passed: coherent,
        severity: "error",
        sugerencia: "Revise la conciliación del impuesto en la memoria y la cuenta 630.",
        data: { isExcel, isMemoria, comparable },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        return seniorExplanationPass(
          "El gasto por impuesto sobre sociedades es coherente entre contabilidad y memoria."
        );
      }
      const { isExcel, isMemoria } = outcome.data as { isExcel: number; isMemoria: number };
      return seniorExplanation(
        `El gasto por impuesto sobre sociedades en cuenta 630 (${formatEuro(isExcel)}) no coincide con la cifra en memoria (${formatEuro(isMemoria)}).`,
        `Esta inconsistencia puede afectar la credibilidad de la conciliación fiscal y la situación tributaria declarada.`,
        `Se recomienda revisar la conciliación del impuesto sobre sociedades antes del cierre definitivo.`
      );
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const { isExcel, isMemoria } = outcome.data as { isExcel: number; isMemoria: number };
      return buildCrossEvidence("Cuenta 630", isExcel, "IS en memoria", isMemoria);
    },
  },
];
