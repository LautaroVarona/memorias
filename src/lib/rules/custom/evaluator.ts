import type { CustomRuleExpression, RuleResult } from "@/types/domain";
import { withinTolerance } from "../types";

function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function toNumber(val: unknown): number | null {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = parseFloat(val.replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? null : n;
  }
  return null;
}

export function evaluateCustomRule(
  ruleId: string,
  expression: CustomRuleExpression,
  ctx: Record<string, unknown>
): RuleResult {
  const fieldVal = getByPath(ctx, expression.field);
  const compareVal =
    expression.compareTo !== undefined
      ? typeof expression.compareTo === "string" && expression.compareTo.includes(".")
        ? getByPath(ctx, expression.compareTo)
        : expression.compareTo
      : undefined;

  const tolerance = expression.tolerance ?? 0.01;
  let passed = false;

  switch (expression.operator) {
    case "eq": {
      const a = toNumber(fieldVal);
      const b = toNumber(compareVal);
      passed = a !== null && b !== null ? withinTolerance(a, b, tolerance) : fieldVal === compareVal;
      break;
    }
    case "neq": {
      const a = toNumber(fieldVal);
      const b = toNumber(compareVal);
      passed = a !== null && b !== null ? !withinTolerance(a, b, tolerance) : fieldVal !== compareVal;
      break;
    }
    case "gt":
      passed = toNumber(fieldVal)! > toNumber(compareVal)!;
      break;
    case "lt":
      passed = toNumber(fieldVal)! < toNumber(compareVal)!;
      break;
    case "gte":
      passed = toNumber(fieldVal)! >= toNumber(compareVal)!;
      break;
    case "lte":
      passed = toNumber(fieldVal)! <= toNumber(compareVal)!;
      break;
    case "contains":
      passed = String(fieldVal ?? "").toLowerCase().includes(String(compareVal ?? "").toLowerCase());
      break;
    case "empty":
      passed = fieldVal === undefined || fieldVal === null || fieldVal === "";
      break;
  }

  const evidence = [
    {
      type: "excel" as const,
      reference: expression.field,
      text: String(fieldVal ?? ""),
    },
    ...(compareVal !== undefined
      ? [
          {
            type: "excel" as const,
            reference: String(expression.compareTo),
            text: String(compareVal),
          },
        ]
      : []),
  ];

  if (passed) {
    const msg = `Regla personalizada superada: ${expression.message}`;
    return {
      ruleId,
      title: "Regla personalizada",
      categoria: "custom",
      type: "custom",
      severidad: "pass",
      severity: "ok",
      mensaje: msg,
      explanation: msg,
      evidencia: evidence.map((e) => ({
        tipo: "sistema" as const,
        referencia: e.reference,
        detalle: e.text,
      })),
      evidence,
    };
  }

  return {
    ruleId,
    title: "Regla personalizada",
    categoria: "custom",
    type: "custom",
    severidad: "warning",
    severity: "warning",
    mensaje: expression.message,
    explanation: expression.message,
    evidencia: evidence.map((e) => ({
      tipo: "sistema" as const,
      referencia: e.reference,
      detalle: e.text,
    })),
    evidence,
    sugerencia: "Revise la condición de la regla personalizada.",
  };
}
