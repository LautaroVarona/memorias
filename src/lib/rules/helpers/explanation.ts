/** Formato estándar de explicación tipo asesor senior */
export function seniorExplanation(
  what: string,
  implies: string,
  review: string
): string {
  return `${what}\n\n${implies}\n\n${review}`;
}

export function seniorExplanationPass(summary: string): string {
  return summary;
}

export interface SeniorIssue {
  explanation: string;
  diagnosis: string;
  impact: string;
  action: string;
}

/** Estructura senior: qué / impacto / acción + diagnóstico */
export function seniorIssue(
  what: string,
  impact: string,
  action: string,
  diagnosis: string
): SeniorIssue {
  return {
    explanation: seniorExplanation(what, impact, action),
    diagnosis,
    impact,
    action,
  };
}
