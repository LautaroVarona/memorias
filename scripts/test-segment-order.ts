import assert from "node:assert/strict";
import { segmentarBloquesDeTexto } from "../src/lib/parsers/memoria/extractors";
import { segmentMemoriaContent } from "../src/components/review/parse-pipe-table";
import { buildContentComparison } from "../src/components/review/apartado-line-diff";

function assertTextBeforeTable(
  contenido: string,
  frase: string,
  label: string
): void {
  const segs = segmentMemoriaContent(contenido);
  const idx = segs.findIndex(
    (s) => s.type === "text" && s.content.toLowerCase().includes(frase.toLowerCase())
  );
  assert(idx >= 0, `${label}: no se encontró "${frase}"`);
  assert(
    segs[idx + 1]?.type === "table",
    `${label}: "${frase}" debe ir inmediatamente antes de una tabla`
  );
  assert(
    segs[idx - 1]?.type !== "table",
    `${label}: "${frase}" no debe ir después de una tabla`
  );
}

const casos = [
  {
    label: "concesiones",
    frase: "No ha habido movimientos de concesiones",
    texto: [
      "No ha habido movimientos de concesiones administrativas en el ejercicio.",
      "MOVIMIENTOS CONCESIONES | IMPORTE 2025 | IMPORTE 2024",
      "SALDO INICIAL BRUTO | 20.800,00 | 20.800,00",
      "SALDO FINAL BRUTO | 20.800,00 | 20.800,00",
    ].join("\n"),
  },
  {
    label: "existencias",
    frase: "Composición de las existencias",
    texto: [
      "Composición de las existencias",
      "CONCEPTO | IMPORTE 2025 | IMPORTE 2024",
      "Comerciales | 1.000,00 | 900,00",
      "Totales | 1.000,00 | 900,00",
    ].join("\n"),
  },
  {
    label: "movimiento",
    frase: "A continuación, se detalla el movimiento",
    texto: [
      "A continuación, se detalla el movimiento:",
      "MOVIMIENTO | IMPORTE 2025 | IMPORTE 2024",
      "Saldo al inicio del ejercicio | 16.574,64 | 20.928,53",
    ].join("\n"),
  },
  {
    label: "cifra de negocios",
    frase: "Importe neto de la cifra de negocios",
    texto: [
      "Importe neto de la cifra de negocios",
      "CONCEPTO | IMPORTE 2025 | IMPORTE 2024",
      "Venta de mercaderías | 1,00 | 2,00",
      "TOTAL | 1,00 | 2,00",
    ].join("\n"),
  },
  {
    label: "propuesta distribución",
    frase: "A continuación se detalla la propuesta de distribución",
    texto: [
      "Propuesta de distribución de beneficios",
      "A continuación se detalla la propuesta de distribución de resultados:",
      "BASE DE REPARTO | IMPORTE 2025 | IMPORTE 2024",
      "Pérdidas y ganancias | 100,00 | 80,00",
      "DISTRIBUCIÓN | IMPORTE 2025 | IMPORTE 2024",
      "A reservas voluntarias | 50,00 | 40,00",
    ].join("\n"),
  },
];

for (const caso of casos) {
  assertTextBeforeTable(caso.texto, caso.frase, caso.label);

  const bloques = segmentarBloquesDeTexto(caso.texto);
  const idxBloque = bloques.findIndex(
    (b) => b.type === "text" && b.content.toLowerCase().includes(caso.frase.toLowerCase())
  );
  assert(idxBloque >= 0, `${caso.label}: bloque texto no encontrado`);
  const siguiente = bloques[idxBloque + 1];
  assert(
    siguiente?.type === "table",
    `${caso.label}: el bloque de texto debe ir seguido de una tabla`
  );
}

// Comparativa interanual: mismo orden en ambos lados → sin ruptura estructural en el intro.
const prior = casos[0].texto.replace(/2025/g, "2024").replace(/2024/g, "2023");
const current = casos[0].texto;
const diff = buildContentComparison(prior, current);
const introDiff = diff.find(
  (b) =>
    b.type === "text" &&
    b.line.prior.toLowerCase().includes("no ha habido movimientos") &&
    b.line.kind === "structural"
);
assert.equal(introDiff, undefined, "el intro de concesiones no debe marcar ruptura estructural");

// Word binario puede volcar intro después de la tabla: se reubica automáticamente.
const invertido = [
  "MOVIMIENTOS CONCESIONES | IMPORTE 2025 | IMPORTE 2024",
  "SALDO INICIAL BRUTO | 20.800,00 | 20.800,00",
  "No ha habido movimientos de concesiones administrativas en el ejercicio.",
].join("\n");
assertTextBeforeTable(invertido, "No ha habido movimientos", "reorden concesiones");

// Word binario: cabecera titular, intro en medio, filas de datos (tabla partida)
const introLP = "El importe total de los activos financieros a largo plazo es:";
const headerInst = "INSTRUMENTOS DE PATRIMONIO LP | IMPORTE 2025 | IMPORTE 2024";
const filaDatos = "Saldo final | 1.234,56 | 1.000,00";
const rawPartido = [headerInst, introLP, filaDatos].join("\n");
const segsPartido = segmentMemoriaContent(rawPartido);
assert.equal(segsPartido[0]?.type, "text", "intro LP antes de tabla");
assert(segsPartido[0]?.type === "text" && segsPartido[0].content.includes("importe total"));
assert.equal(segsPartido[1]?.type, "table", "tabla fusionada tras intro");
if (segsPartido[1]?.type === "table") {
  assert(segsPartido[1].rows.length >= 2, "tabla con cabecera y al menos una fila de datos");
}

console.log("OK: segment order tests passed (" + (casos.length + 2) + " casos)");
