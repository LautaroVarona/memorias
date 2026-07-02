import { readFileSync } from "fs";
import { detectarFormatoMemoria, parseMemoria } from "../src/lib/parsers/memoria/parser";
import { segmentMemoriaContent } from "../src/components/review/parse-pipe-table";
import { segmentarBloquesDeTexto } from "../src/lib/parsers/memoria/extractors";

const MARKERS = [
  "INSTRUMENTOS DE PATRIMONIO",
  "CRÉDITOS, DERIVADOS",
  "TOTAL ACTIVOS FINANCIEROS",
  "DEUDAS CON ENTIDADES",
  "TOTAL PASIVOS FINANCIEROS",
  "importe total de los activos",
  "importe total de los pasivos",
  "A continuación se detalla el movimiento",
];

async function inspect(file: string, label: string) {
  const buf = readFileSync(file);
  const formato = detectarFormatoMemoria(buf);
  const mem = await parseMemoria(buf, file.split(/[/\\]/).pop()!, "memoria_word");

  console.log(`\n========== ${label} (${formato}) ejercicio=${mem.datosClave.ejercicio} ==========`);

  for (const apartado of mem.apartados) {
    if (!/activo|pasivo|financier/i.test(apartado.titulo + apartado.contenido.slice(0, 200))) {
      continue;
    }

    console.log(`\n--- Apartado ${apartado.id} ${apartado.titulo} ---`);
    const segs = segmentMemoriaContent(apartado.contenido);
    const bloques = segmentarBloquesDeTexto(apartado.contenido);

    console.log(`Segmentos: ${segs.length}, Bloques: ${bloques.length}`);
    console.log("  Bloques orden:");
    for (let i = 0; i < bloques.length; i++) {
      const b = bloques[i]!;
      if (b.type === "table") {
        const h = b.rows[0]?.cells.join(" | ") ?? "";
        if (MARKERS.some((m) => h.toUpperCase().includes(m.toUpperCase())) || b.rows.length <= 2) {
          console.log(`    b[${i}] TABLE (${b.rows.length}): ${h.slice(0, 90)}`);
        }
      } else if (MARKERS.some((m) => b.content.toLowerCase().includes(m.toLowerCase()))) {
        console.log(`    b[${i}] TEXT: ${b.content.slice(0, 90).replace(/\n/g, " ")}`);
      }
    }

    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]!;
      if (s.type === "table") {
        const h = s.cabecera.join(" | ");
        const filas = s.rows.length;
        const hit = MARKERS.some((m) => h.toUpperCase().includes(m.toUpperCase()));
        if (hit || filas <= 1) {
          console.log(`  [${i}] TABLE (${filas} rows): ${h.slice(0, 100)}`);
          if (filas <= 2) {
            for (const r of s.rows) console.log(`       -> ${r.cells.join(" | ")}`);
          }
        }
      } else {
        for (const m of MARKERS) {
          if (s.content.toLowerCase().includes(m.toLowerCase())) {
            console.log(`  [${i}] TEXT: ${s.content.slice(0, 120).replace(/\n/g, " ")}`);
            break;
          }
        }
      }
    }

    // Raw lines around markers in texto
    const lineas = apartado.contenido.split("\n");
    for (let li = 0; li < lineas.length; li++) {
      const l = lineas[li] ?? "";
      if (MARKERS.some((m) => l.toUpperCase().includes(m.toUpperCase()))) {
        const ctx = lineas.slice(Math.max(0, li - 2), li + 4).map((x, j) => {
          const idx = Math.max(0, li - 2) + j;
          const mark = idx === li ? ">>" : "  ";
          return `${mark} ${idx}: ${JSON.stringify(x.slice(0, 120))}`;
        });
        console.log(`\n  Contexto línea ${li}:`);
        console.log(ctx.join("\n"));
      }
    }
  }
}

async function main() {
  await inspect("examples/M0106643.DOC", "2024 RTF");
  await inspect("examples/M0106643[1].DOC", "2025 binario");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
