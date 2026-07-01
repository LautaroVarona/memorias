/**
 * Caso de aceptación: pipeline completo contra los archivos reales de examples/.
 *
 * Uso: npx tsx scripts/e2e-examples.ts
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { buildCaseData } from "../src/lib/case/build-case-data";
import { clasificarEmpresa } from "../src/lib/classifier";
import { parseExcel } from "../src/lib/parsers/excel/parser";
import { detectarFormatoMemoria, parseMemoria } from "../src/lib/parsers/memoria/parser";
import { parseImporte } from "../src/lib/parsers/memoria/extractors";
import { runValidationEngine, computeCaseScore } from "../src/lib/rules/engine";
import type { MemoriaNormalizada } from "../src/types/domain";
import { assignMemorias, resolveEjercicioActual } from "../src/lib/process/resolve-ejercicio";
import { buildContentComparison } from "../src/components/review/apartado-line-diff";
import { buildApartadoGroups } from "../src/components/review/group-by-apartado";

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

  // ── 2b. Memorias MARIO PILATO (RTF 2024 + Word binario 2025) ─────────────
  console.log("\n== 2b. Memorias M0106578 (RTF vs Word binario) ==");
  const marioRtfPath = path.join(EXAMPLES, "M0106578-2024.DOC");
  const marioDocPath = path.join(EXAMPLES, "M0106578.DOC");
  if (existsSync(marioRtfPath) && existsSync(marioDocPath)) {
    const marioRtfBuf = readFileSync(marioRtfPath);
    const marioDocBuf = readFileSync(marioDocPath);

    assert(detectarFormatoMemoria(marioRtfBuf) === "rtf", "M0106578-2024.DOC se detecta como RTF");
    assert(detectarFormatoMemoria(marioDocBuf) === "doc_binario", "M0106578.DOC se detecta como Word binario");

    const memoriaMario2024 = await parseMemoria(marioRtfBuf, "M0106578-2024.DOC", "memoria_word");
    const memoriaMario2025 = await parseMemoria(marioDocBuf, "M0106578.DOC", "memoria_word");

    resumenMemoria("MARIO 2024 (RTF)", memoriaMario2024);
    resumenMemoria("MARIO 2025 (binario)", memoriaMario2025);

    assert(memoriaMario2024.datosClave.ejercicio === 2024, `Ejercicio RTF por nombre: ${memoriaMario2024.datosClave.ejercicio}`);
    assert(memoriaMario2025.datosClave.ejercicio === 2025, `Ejercicio binario por contenido: ${memoriaMario2025.datosClave.ejercicio}`);
    assert(memoriaMario2025.datosClave.nif === "A46092094", `NIF MARIO: ${memoriaMario2025.datosClave.nif}`);

    const tablasImporte2025 = memoriaMario2025.tablas.filter((t) =>
      t.cabecera.some((c) => /IMPORTE\s+2025/i.test(c))
    );
    assert(tablasImporte2025.length >= 3, `Tablas con columnas IMPORTE 2025/2024: ${tablasImporte2025.length}`);

    const cabeceraMov = tablasImporte2025.find((t) => /TERRENOS/i.test(t.cabecera[0] ?? ""));
    if (cabeceraMov) {
      assert(cabeceraMov.cabecera.length >= 3, `Cabecera movimientos parseada: ${cabeceraMov.cabecera.join(" | ")}`);
      const filaSaldo = cabeceraMov.filas.find((f) => /SALDO INICIAL BRUTO/i.test(f[0] ?? ""));
      assert(
        filaSaldo && filaSaldo.length >= 3 && parseImporte(filaSaldo[1] ?? "") !== null,
        `Fila SALDO INICIAL con importe 2025 separado: ${filaSaldo?.join(" | ")}`
      );
    }

    assert(
      !memoriaMario2025.textoCompleto.includes("\u0007"),
      "El texto normalizado no conserva separadores \\u0007"
    );
  } else {
    console.log("  (fixtures M0106578 no presentes — omitido)");
  }

  // ── 2c. Memorias ENMIN M0106567 (Word binario 2025 + RTF 2024) ───────────
  console.log("\n== 2c. Memorias M0106567 ENMIN (binario vs RTF) ==");
  const enmin2025Path = path.join(EXAMPLES, "M0106567.DOC");
  const enmin2024Path = path.join(EXAMPLES, "M0106567[1].DOC");
  if (existsSync(enmin2025Path) && existsSync(enmin2024Path)) {
    const enmin2025Buf = readFileSync(enmin2025Path);
    const enmin2024Buf = readFileSync(enmin2024Path);

    assert(detectarFormatoMemoria(enmin2025Buf) === "doc_binario", "M0106567.DOC es Word binario (2025)");
    assert(detectarFormatoMemoria(enmin2024Buf) === "rtf", "M0106567[1].DOC es RTF (2024)");

    const memoriaEnmin2025 = await parseMemoria(enmin2025Buf, "M0106567.DOC", "memoria_word", 2025);
    const memoriaEnmin2024 = await parseMemoria(enmin2024Buf, "M0106567[1].DOC", "memoria_word", 2024);

    resumenMemoria("ENMIN 2025 (binario)", memoriaEnmin2025);
    resumenMemoria("ENMIN 2024 (RTF)", memoriaEnmin2024);

    assert(
      memoriaEnmin2025.textoCompleto.includes("MEMORIA ABREVIADA 2025"),
      "Memoria 2025: portada con año 2025 en el texto extraído"
    );
    assert(
      memoriaEnmin2024.textoCompleto.includes("MEMORIA ABREVIADA 2024"),
      "Memoria 2024: portada con año 2024 en el texto extraído"
    );
    assert(
      memoriaEnmin2025.textoCompleto.includes("ejercicio 2025"),
      "Memoria 2025: párrafo de estimaciones con ejercicio 2025"
    );
    assert(
      memoriaEnmin2025.apartados
        .find((a) => a.numero === 1)
        ?.contenido?.includes("Actividad de la empresa\nLa sociedad tiene como actividad principal"),
      "Memoria 2025: subtítulo «Actividad de la empresa» antes del párrafo de actividad"
    );
    assert(
      memoriaEnmin2024.textoCompleto.includes("ejercicio 2024"),
      "Memoria 2024: párrafo de estimaciones con ejercicio 2024"
    );

    const ejercicioEnmin = resolveEjercicioActual({
      memoriasEjercicios: [
        memoriaEnmin2025.datosClave.ejercicio,
        memoriaEnmin2024.datosClave.ejercicio,
      ].filter((y): y is number => y !== undefined),
      expedienteEjercicio: 2025,
    });
    const { memoria: actualEnmin, memoriaAnterior: anteriorEnmin } = assignMemorias(
      [memoriaEnmin2025, memoriaEnmin2024],
      ejercicioEnmin
    );
    assert(actualEnmin?.metadata.archivo === "M0106567.DOC", "Asignación: actual = M0106567.DOC (2025)");
    assert(anteriorEnmin?.metadata.archivo === "M0106567[1].DOC", "Asignación: anterior = M0106567[1].DOC (2024)");

    const groupsEnmin = buildApartadoGroups(
      actualEnmin!.apartados,
      [],
      anteriorEnmin!.apartados
    );
    const g02 = groupsEnmin.find((g) => g.num === "02");
    const cmpEst = g02
      ? buildContentComparison(g02.contenidoAnterior ?? "", g02.contenido ?? "").find(
          (b) => b.type === "text" && /elaboraci[oó]n de la cuentas/.test(b.line.current)
        )
      : undefined;
    assert(
      cmpEst?.type === "text" &&
        cmpEst.line.kind === "expected" &&
        cmpEst.line.current.includes("2025") &&
        cmpEst.line.prior.includes("2024"),
      "Comparativa apartado 02: estimaciones 2024 vs 2025 como cambio esperado"
    );
  } else {
    console.log("  (fixtures M0106567 no presentes — omitido)");
  }

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
