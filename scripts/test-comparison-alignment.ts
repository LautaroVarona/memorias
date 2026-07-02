import assert from "node:assert/strict";
import {
  buildContentComparison,
  isStructuralDiffKind,
  summarizeMemoriaDiff,
} from "../src/components/review/apartado-line-diff";

function assertNoRupturaEnFrase(prior: string, current: string, frase: string, label: string) {
  const blocks = buildContentComparison(prior, current);
  const lineas = blocks.filter((b) => b.type === "text").map((b) => b.line);
  const problematicas = lineas.filter(
    (l) =>
      (l.prior.includes(frase) || l.current.includes(frase)) && isStructuralDiffKind(l.kind)
  );
  assert.equal(
    problematicas.length,
    0,
    `${label}: "${frase}" no debe marcarse como ruptura (${problematicas.map((l) => l.kind).join(", ")})`
  );
}

// Caso imagen 1: intro idéntico antes de tabla de amortización construcciones
const introAmort =
  "Durante el ejercicio, el movimiento de la amortización de la partida construcciones ha sido el siguiente:";
const tablaAmort = [
  "MOVIMIENTO | IMPORTE 2025 | IMPORTE 2024",
  "Amortización del ejercicio | 1.000,00 | 900,00",
].join("\n");

const prior05 = [
  "Análisis de movimiento",
  "Terrenos y construcciones",
  "La partida de terrenos y construcciones presenta, durante el ejercicio económico, los siguientes movimientos:",
  introAmort,
  tablaAmort.replace(/2025/g, "2024").replace(/2024/g, "2023"),
].join("\n\n");

const current05 = [
  "Análisis de movimiento",
  "Terrenos y construcciones",
  "La partida de terrenos y construcciones presenta, durante el ejercicio económico, los siguientes movimientos:",
  introAmort,
  tablaAmort,
].join("\n\n");

assertNoRupturaEnFrase(prior05, current05, introAmort, "amortización construcciones");

// Caso imagen 3: detalle por elementos (idéntico, posible desplazamiento)
const introDetalle =
  "El detalle por elementos de la amortización del Inmovilizado Material; es el siguiente:";
const priorDetalle = [introDetalle, tablaAmort.replace(/2025/g, "2024").replace(/2024/g, "2023")].join(
  "\n\n"
);
const currentDetalle = [tablaAmort, introDetalle].join("\n\n");
assertNoRupturaEnFrase(priorDetalle, currentDetalle, introDetalle, "detalle por elementos");

// Caso imagen 2: párrafo nuevo en 2025 pero intro idéntico al final del bloque anterior
const paraAltas2023 =
  "Las altas producidas en el ejercicio 2023 corresponden principalmente a mobiliario adquirido para las viviendas del edificio Bolzano y a mejoras realizadas en las líneas II y III de los hornos de Zinc.";
const paraAltas2024 =
  "Las altas producidas en el ejercicio 2024 y 2023 corresponden principalmente a mobiliario adquirido para las viviendas del edificio Bolzano, a mejoras realizadas en las líneas II y III de los hornos de Zinc, y renovación de flota de transporte interno.";
const paraBajas2024 =
  "Las bajas de 2024 corresponden a la venta de tres carretillas elevadoras y las de 2023 a un analizador de áreas. En ambos ejercicios, se trata de elementos totalmente amortizados.";
const introInstalaciones =
  "Durante el ejercicio, el movimiento de la amortización de la partida instalaciones técnicas y otro inmovilizado material ha sido el siguiente:";

const priorInst = [paraAltas2023, introInstalaciones, tablaAmort.replace(/2025/g, "2024").replace(/2024/g, "2023")].join(
  "\n\n"
);
const currentInst = [paraAltas2024, paraBajas2024, introInstalaciones, tablaAmort].join("\n\n");

assertNoRupturaEnFrase(priorInst, currentInst, introInstalaciones, "instalaciones técnicas");

const resumenInst = summarizeMemoriaDiff(priorInst, currentInst);
assert(resumenInst.expectedCount >= 1, "debe detectar cambio esperado en párrafo de altas");
assert(
  resumenInst.structuralCount === 0 ||
    !buildContentComparison(priorInst, currentInst).some(
      (b) =>
        b.type === "text" &&
        b.line.current.includes(introInstalaciones) &&
        isStructuralDiffKind(b.line.kind)
    ),
  "el intro de instalaciones no debe ser ruptura"
);

// Caso activos financieros LP: Word 2025 vuelca cabecera, intro y datos separados
const introLP = "El importe total de los activos financieros a largo plazo es:";
const introCP = "Los activos financieros a corto plazo son los siguientes:";
const hInst = "INSTRUMENTOS DE PATRIMONIO LP | IMPORTE 2025 | IMPORTE 2024";
const hCred = "CRÉDITOS, DERIVADOS Y OTROS LP | IMPORTE 2025 | IMPORTE 2024";
const hTotal = "TOTAL ACTIVOS FINANCIEROS LP | IMPORTE 2025 | IMPORTE 2024";
const fila = "Saldo final | 100,00 | 90,00";

function bloquePartido2025(header: string) {
  return [header, introLP, fila].join("\n");
}
function bloqueCorrecto2024(header: string, intro: string) {
  return [intro, header, fila].join("\n\n");
}

const priorFin = [
  bloqueCorrecto2024(hInst.replace(/2025/g, "2024").replace(/2024/g, "2023"), introLP),
  bloqueCorrecto2024(hCred.replace(/2025/g, "2024").replace(/2024/g, "2023"), introLP),
  bloqueCorrecto2024(hTotal.replace(/2025/g, "2024").replace(/2024/g, "2023"), introCP),
].join("\n\n");

const currentFin = [bloquePartido2025(hInst), bloquePartido2025(hCred), bloquePartido2025(hTotal)].join(
  "\n\n"
);

const diffFin = buildContentComparison(priorFin, currentFin);
const tablasVacias = diffFin.filter(
  (b) =>
    b.type === "table" &&
    b.table.rows.every((r) => !r.prior?.length && r.current?.length) &&
    b.table.priorHeader.length === 0
);
assert.equal(tablasVacias.length, 0, "no debe haber tablas vacías en el lado 2024");

console.log("OK: comparison alignment tests passed");
