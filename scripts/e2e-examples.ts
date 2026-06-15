/**
 * Caso de aceptación: pipeline completo contra los archivos reales de examples/.
 *
 * Uso: npx tsx scripts/e2e-examples.ts
 */
import { readFileSync } from "fs";
import path from "path";
import { buildCaseData } from "../src/lib/case/build-case-data";
import { clasificarEmpresa } from "../src/lib/classifier";
import { parseExcel } from "../src/lib/parsers/excel/parser";
import { detectarFormatoMemoria, parseMemoria } from "../src/lib/parsers/memoria/parser";
import { runValidationEngine, computeCaseScore } from "../src/lib/rules/engine";
import type { MemoriaNormalizada } from "../src/types/domain";

const EXAMPLES = path.join(__dirname, "..", "examples");

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error(`  ✗ FALLO: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

function resumenMemoria(nombre: string, m: MemoriaNormalizada) {
  console.log(`\n— ${nombre} (formato: ${m.metadata.formato})`);
  const numerados = m.apartados.filter((a) => a.numero !== undefined);
  console.log(`  Apartados numerados: ${numerados.map((a) => a.id).join(", ")}`);
  console.log(`  Tablas: ${m.tablas.length} (vacías: ${m.tablas.filter((t) => t.vacia).length})`);
  console.log(`  Datos clave:`, JSON.stringify(m.datosClave));
}

async function main() {
  // ── 1. Libro de cierre ────────────────────────────────────────────────────
  console.log("== 1. Libro de cierre (.xlsm) ==");
  const xlsmPath = path.join(EXAMPLES, "PROFILTEK IBERGROUP, S.L. - 2025.xlsm");
  const excel = parseExcel(readFileSync(xlsmPath), path.basename(xlsmPath));
  const libro = excel.libroCierre;

  assert(libro, "Se detecta como libro de cierre del despacho");
  if (!libro) return;
  assert(libro.cliente?.includes("PROFILTEK"), `Cliente detectado: ${libro.cliente}`);
  assert(libro.ejercicio === 2025, `Ejercicio detectado: ${libro.ejercicio}`);
  assert(libro.ejercicioAnterior === 2024, `Ejercicio anterior: ${libro.ejercicioAnterior}`);
  assert(libro.sumasSaldos.length > 100, `Sumas y saldos: ${libro.sumasSaldos.length} cuentas`);
  assert(libro.cuentas4.length > 30, `Agregado 4 dígitos: ${libro.cuentas4.length} cuentas`);
  assert(libro.a3soc.length > 20, `A3SOC: ${libro.a3soc.length} cuentas con saldo`);
  assert(libro.balanceEpigrafes.length > 30, `Epígrafes balance: ${libro.balanceEpigrafes.length}`);
  assert(libro.pygEpigrafes.length > 20, `Epígrafes PyG: ${libro.pygEpigrafes.length}`);
  assert(libro.notas.length > 0, `Notas del despacho: ${libro.notas.length} (pendientes: ${libro.notas.filter((n) => n.pendiente).length})`);

  const totalActivo = libro.balanceEpigrafes.find((e) => /^TOTAL ACTIVO$/i.test(e.etiqueta));
  assert(
    totalActivo && Math.abs(totalActivo.actual - 13623993.48) < 0.05,
    `TOTAL ACTIVO 2025 = ${totalActivo?.actual.toFixed(2)} (esperado 13.623.993,48)`
  );
  assert(
    totalActivo && Math.abs(totalActivo.anterior - 13180135.56) < 0.05,
    `TOTAL ACTIVO 2024 = ${totalActivo?.anterior.toFixed(2)} (esperado 13.180.135,56)`
  );

  const cta2423 = libro.cuentas4.find((c) => c.cuenta === "2423");
  assert(
    cta2423 && Math.abs(cta2423.saldo - 821917.23) < 0.05,
    `Cuenta 2423 (créditos l/p grupo) = ${cta2423?.saldo.toFixed(2)} (esperado 821.917,23)`
  );

  // ── 2. Memorias .DOC ──────────────────────────────────────────────────────
  console.log("\n== 2. Memorias .DOC ==");
  const rtfPath = path.join(EXAMPLES, "M0106643.DOC");
  const docPath = path.join(EXAMPLES, "M0106643[1].DOC");
  const rtfBuffer = readFileSync(rtfPath);
  const docBuffer = readFileSync(docPath);

  assert(detectarFormatoMemoria(rtfBuffer) === "rtf", "M0106643.DOC se detecta como RTF");
  assert(detectarFormatoMemoria(docBuffer) === "doc_binario", "M0106643[1].DOC se detecta como Word binario");

  const memoria2024 = await parseMemoria(rtfBuffer, "M0106643.DOC", "memoria_word");
  const memoria2025 = await parseMemoria(docBuffer, "M0106643[1].DOC", "memoria_word");

  resumenMemoria("Memoria RTF", memoria2024);
  resumenMemoria("Memoria Word binario", memoria2025);

  assert(memoria2024.datosClave.ejercicio === 2024, `Ejercicio memoria RTF: ${memoria2024.datosClave.ejercicio}`);
  assert(memoria2025.datosClave.ejercicio === 2025, `Ejercicio memoria binaria: ${memoria2025.datosClave.ejercicio}`);
  assert(memoria2024.datosClave.nif === "B97932073", `NIF: ${memoria2024.datosClave.nif}`);
  assert(memoria2024.datosClave.tipoMemoria === "abreviada", `Tipo memoria: ${memoria2024.datosClave.tipoMemoria}`);
  assert(
    memoria2024.apartados.filter((a) => a.numero !== undefined).length >= 10,
    "La memoria RTF tiene los apartados numerados 01..11"
  );
  assert(memoria2024.tablas.length >= 5, `Tablas extraídas en RTF: ${memoria2024.tablas.length}`);
  assert(
    memoria2024.anios.some((a) => a.anio === 2022 && !a.esReferenciaLegal),
    "Se capturan las menciones a 2022 (texto arrastrado) en la memoria 2024"
  );

  // ── 3. Motor de validación: memoria 2025 + libro 2025 ────────────────────
  console.log("\n== 3. Validación expediente 2025 (memoria binaria + libro) ==");
  const cuentas = excel.balance?.cuentas ?? [];
  const caseData = buildCaseData({
    expedienteId: "e2e",
    cliente: libro.cliente ?? "PROFILTEK",
    ejercicio: libro.ejercicio ?? 2025,
    tipoEmpresa: clasificarEmpresa(cuentas),
    balance: excel.balance,
    sumasSaldos: excel.sumasSaldos,
    libroCierre: libro,
    memoria: memoria2025,
    priorYear: {
      ejercicio: libro.ejercicioAnterior ?? 2024,
      balance: excel.balanceAnterior,
      memoria: memoria2024,
    },
  });

  const results = runValidationEngine(caseData);
  const score = computeCaseScore(results);
  console.log(`  Reglas ejecutadas: ${results.length} — score ${score.score} (${score.estado})`);

  for (const r of results.filter((x) => x.severity !== "ok")) {
    console.log(`  [${r.severity.toUpperCase()}] ${r.ruleId} — ${r.title}`);
    console.log(`      ${r.explanation.split("\n")[0]}`);
    for (const ev of r.evidence.slice(0, 3)) {
      console.log(`      · (${ev.type}) ${ev.reference}: ${ev.formattedValue ?? ev.text ?? ev.value ?? ""}`);
    }
  }

  const ruleById = (id: string) => results.find((r) => r.ruleId === id);
  assert(ruleById("CIERRE_001")?.severity === "ok", "CIERRE_001: las sumas y saldos cuadran");
  assert(ruleById("CIERRE_002")?.severity === "ok", "CIERRE_002: el balance cuadra");
  assert(ruleById("TEMP_003")?.severity === "ok", "TEMP_003: memorias 2025 y 2024 consecutivas");
  assert(ruleById("CIERRE_008")?.severity === "warning", "CIERRE_008: detecta los pendientes del despacho");
  console.log(`  CIERRE_004 (vinculadas memoria↔excel): ${ruleById("CIERRE_004")?.severity} — ${ruleById("CIERRE_004")?.explanation.split("\n")[0]}`);
  console.log(`  CIERRE_005 (impuesto corriente): ${ruleById("CIERRE_005")?.severity} — ${ruleById("CIERRE_005")?.explanation.split("\n")[0]}`);

  // ── 4. Validación de la memoria 2024 (errores reales de arrastre) ─────────
  console.log("\n== 4. Validación memoria 2024 (RTF con texto arrastrado) ==");
  const caseData2024 = buildCaseData({
    expedienteId: "e2e-2024",
    cliente: libro.cliente ?? "PROFILTEK",
    ejercicio: 2024,
    tipoEmpresa: clasificarEmpresa(cuentas),
    memoria: memoria2024,
  });
  const results2024 = runValidationEngine(caseData2024);
  const r2024 = (id: string) => results2024.find((r) => r.ruleId === id);

  for (const r of results2024.filter((x) => x.severity !== "ok" && ["TEMP_001", "TEMP_002", "CIERRE_007"].includes(x.ruleId))) {
    console.log(`  [${r.severity.toUpperCase()}] ${r.ruleId} — ${r.title}`);
    for (const ev of r.evidence.slice(0, 4)) {
      console.log(`      · ${ev.reference}: ${String(ev.text ?? "").slice(0, 110)}`);
    }
  }

  assert(r2024("TEMP_001")?.severity !== "ok", "TEMP_001: detecta los años obsoletos (2022/2019) en la memoria 2024");
  assert(r2024("TEMP_002")?.severity !== "ok", "TEMP_002: detecta el boilerplate de pandemia/estado de alarma");
  assert(r2024("CIERRE_007")?.severity !== "ok", "CIERRE_007: detecta la tabla de coeficientes de amortización ausente");

  console.log(`\n${process.exitCode ? "❌ E2E con fallos" : "✅ E2E completado sin fallos"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
