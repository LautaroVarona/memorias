import { getAccounts } from "@/lib/case/build-case-data";
import { formatEuro, sumByPrefix } from "@/lib/rules/helpers/accounts";
import { seniorExplanationPass, seniorIssue } from "@/lib/rules/helpers/explanation";
import { withEuro, withText } from "@/lib/rules/helpers/evidence";
import type { RuleDefinition } from "../types";

export const companyTypeRules: RuleDefinition[] = [
  {
    id: "TIPO_COM_001",
    title: "Comercial: coherencia ventas vs clientes",
    type: "balance",
    defaultSeverity: "warning",
    normativa: "PGC",
    referencia: "Perfil comercial — ciclo de cobros",
    execute(data) {
      if (data.metadata.tipoEmpresa !== "comercial") {
        return { passed: true, data: { skip: true } };
      }
      const accounts = getAccounts(data);
      const ventas = sumByPrefix(accounts, ["700", "705"]);
      const clientes = sumByPrefix(accounts, ["430", "431"]);
      const ratio = ventas > 0 ? clientes / ventas : 0;
      const triggered = ventas > 50_000 && (clientes === 0 || ratio > 1.5);

      return {
        passed: !triggered,
        severity: "warning",
        warningLevel: "medium",
        diagnosis: triggered ? "Ciclo comercial incoherente (ventas vs clientes)" : undefined,
        sugerencia: "Verifique saldos de clientes y reconocimiento de ingresos.",
        data: { ventas, clientes, ratio },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        if (outcome.data.skip) return seniorExplanationPass("Regla no aplicable: empresa no comercial.");
        return seniorExplanationPass("Ventas y clientes son coherentes para perfil comercial.");
      }
      const { ventas, clientes } = outcome.data as { ventas: number; clientes: number };
      return seniorIssue(
        `Empresa comercial con ventas de ${formatEuro(ventas)} y clientes de ${formatEuro(clientes)} — relación incoherente.`,
        `Un desajuste en el ciclo comercial puede indicar cobros pendientes mal clasificados o ingresos no registrados.`,
        `Revise cuentas 430/431 frente a ventas 700/705 y la narrativa de actividad.`,
        "Perfil comercial con saldos de clientes atípicos"
      ).explanation;
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const d = outcome.data as { ventas: number; clientes: number };
      return [
        withEuro("excel", "Ventas (700/705)", d.ventas, "high"),
        withEuro("excel", "Clientes (430/431)", d.clientes, "high"),
      ];
    },
  },
  {
    id: "TIPO_COM_002",
    title: "Comercial: actividad narrativa vs ingresos",
    type: "cross",
    defaultSeverity: "warning",
    normativa: "PGC",
    referencia: "Memoria — actividad comercial",
    execute(data) {
      if (data.metadata.tipoEmpresa !== "comercial") {
        return { passed: true, data: { skip: true } };
      }
      const accounts = getAccounts(data);
      const ventas = sumByPrefix(accounts, ["700", "705"]);
      const describeActividad = data.memory?.statements.some((s) => s.type === "actividad") ?? false;
      const triggered = ventas > 100_000 && !describeActividad;

      return {
        passed: !triggered,
        severity: "warning",
        warningLevel: "medium",
        diagnosis: triggered ? "Actividad comercial relevante sin narrativa" : undefined,
        sugerencia: "Describa la actividad comercial y el origen de los ingresos.",
        data: { ventas },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        if (outcome.data.skip) return seniorExplanationPass("Regla no aplicable: empresa no comercial.");
        return seniorExplanationPass("La actividad comercial está documentada en la memoria.");
      }
      const ventas = outcome.data.ventas as number;
      return seniorIssue(
        `Empresa comercial con ${formatEuro(ventas)} en ventas sin descripción de actividad en la memoria.`,
        `La memoria de una sociedad comercial debe explicar el origen de la cifra de negocios.`,
        `Incorpore en el apartado de actividad la descripción del negocio y principales líneas de ingreso.`,
        "Perfil comercial sin narrativa de explotación"
      ).explanation;
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      return [
        withEuro("excel", "Ventas", outcome.data.ventas as number, "high"),
        withText("memory", "Descripción actividad", "No detectada", "medium"),
      ];
    },
  },
  {
    id: "TIPO_HOLD_001",
    title: "Holding: participaciones y préstamos intragrupo",
    type: "balance",
    defaultSeverity: "warning",
    normativa: "PGC",
    referencia: "Perfil holding — estructura financiera",
    execute(data) {
      if (data.metadata.tipoEmpresa !== "holding") {
        return { passed: true, data: { skip: true } };
      }
      const accounts = getAccounts(data);
      const participaciones = sumByPrefix(accounts, ["240", "241", "242", "25"]);
      const prestamos = sumByPrefix(accounts, ["2423", "2424", "552"]);
      const ventas = sumByPrefix(accounts, ["700", "705"]);
      const sinEstructura = participaciones < 10_000 && prestamos < 10_000 && ventas < 10_000;

      return {
        passed: !sinEstructura,
        severity: "warning",
        warningLevel: "medium",
        diagnosis: sinEstructura ? "Perfil holding sin estructura patrimonial esperada" : undefined,
        sugerencia: "Verifique participaciones (24x) y financiación intragrupo (242, 552).",
        data: { participaciones, prestamos, ventas },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        if (outcome.data.skip) return seniorExplanationPass("Regla no aplicable: empresa no holding.");
        return seniorExplanationPass("La estructura financiera es coherente con perfil holding.");
      }
      const { participaciones, prestamos } = outcome.data as { participaciones: number; prestamos: number };
      return seniorIssue(
        `Empresa clasificada como holding sin participaciones (${formatEuro(participaciones)}) ni préstamos intragrupo (${formatEuro(prestamos)}) relevantes.`,
        `Un holding sin inversiones financieras ni financiación de grupo cuestiona la clasificación y la memoria.`,
        `Revise cuentas 240/25x y 242/552, y documente la estructura del grupo en la memoria.`,
        "Clasificación holding incoherente con saldos patrimoniales"
      ).explanation;
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const d = outcome.data as { participaciones: number; prestamos: number };
      return [
        withEuro("excel", "Participaciones (24x/25x)", d.participaciones, "high"),
        withEuro("excel", "Préstamos intragrupo (242/552)", d.prestamos, "high"),
      ];
    },
  },
  {
    id: "TIPO_IND_001",
    title: "Industrial: stocks vs costes de producción",
    type: "balance",
    defaultSeverity: "warning",
    normativa: "PGC",
    referencia: "Perfil industrial — inventarios",
    execute(data) {
      if (data.metadata.tipoEmpresa !== "industrial") {
        return { passed: true, data: { skip: true } };
      }
      const accounts = getAccounts(data);
      const stocks = sumByPrefix(accounts, ["30", "31", "32", "33", "34", "35"]);
      const costesProd = sumByPrefix(accounts, ["61", "71"]);
      const triggered = costesProd > 50_000 && stocks < costesProd * 0.03;

      return {
        passed: !triggered,
        severity: "warning",
        warningLevel: "medium",
        diagnosis: triggered ? "Costes de producción sin stocks proporcionales" : undefined,
        sugerencia: "Verifique inventarios y costes de producción del ejercicio.",
        data: { stocks, costesProd },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        if (outcome.data.skip) return seniorExplanationPass("Regla no aplicable: empresa no industrial.");
        return seniorExplanationPass("Stocks y costes de producción son coherentes.");
      }
      const { stocks, costesProd } = outcome.data as { stocks: number; costesProd: number };
      return seniorIssue(
        `Empresa industrial con costes de producción de ${formatEuro(costesProd)} y stocks de solo ${formatEuro(stocks)}.`,
        `Un desfase entre producción e inventarios puede indicar error en valoración de existencias o omisión de stocks.`,
        `Revise cuentas 30-35 frente a costes 61/71 y documente la política de inventarios.`,
        "Perfil industrial con inventarios atípicamente bajos"
      ).explanation;
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const d = outcome.data as { stocks: number; costesProd: number };
      return [
        withEuro("excel", "Stocks (30-35)", d.stocks, "high"),
        withEuro("excel", "Costes producción (61/71)", d.costesProd, "high"),
      ];
    },
  },
  {
    id: "TIPO_HOLD_002",
    title: "Holding: coherencia financiera dividendos vs participaciones",
    type: "cross",
    defaultSeverity: "warning",
    normativa: "PGC",
    referencia: "Perfil holding — rentas financieras",
    execute(data) {
      if (data.metadata.tipoEmpresa !== "holding") {
        return { passed: true, data: { skip: true } };
      }
      const accounts = getAccounts(data);
      const dividendos = sumByPrefix(accounts, ["760", "761"]);
      const participaciones = sumByPrefix(accounts, ["240", "241", "25"]);
      const triggered = participaciones > 50_000 && dividendos === 0;

      return {
        passed: !triggered,
        severity: "warning",
        warningLevel: "low",
        diagnosis: triggered ? "Participaciones sin rentas financieras asociadas" : undefined,
        sugerencia: "Verifique el reconocimiento de dividendos de participadas.",
        data: { dividendos, participaciones },
      };
    },
    explanation(outcome) {
      if (outcome.passed) {
        if (outcome.data.skip) return seniorExplanationPass("Regla no aplicable: empresa no holding.");
        return seniorExplanationPass("Dividendos y participaciones son coherentes.");
      }
      const { participaciones } = outcome.data as { dividendos: number; participaciones: number };
      return seniorIssue(
        `Participaciones por ${formatEuro(participaciones)} sin dividendos registrados en 760/761.`,
        `Puede indicar participadas sin distribución, error de imputación o falta de actualización del cierre.`,
        `Confirme si las participadas distribuyeron dividendos y actualice la memoria.`,
        "Holding con cartera de participaciones sin ingresos financieros"
      ).explanation;
    },
    evidence(outcome) {
      if (outcome.passed) return [];
      const d = outcome.data as { dividendos: number; participaciones: number };
      return [
        withEuro("excel", "Participaciones", d.participaciones, "high"),
        withEuro("excel", "Dividendos (760/761)", d.dividendos, "medium"),
      ];
    },
  },
];
