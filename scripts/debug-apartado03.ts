import { readFileSync } from "node:fs";
import { parseMemoria } from "../src/lib/parsers/memoria/parser";

async function dump(path: string, tipo: "memoria_word" | "memoria_pdf") {
  const buf = readFileSync(path);
  const mem = await parseMemoria(buf, path, tipo);
  console.log("\n==================================================");
  console.log("ARCHIVO:", path, "| formato:", mem.metadata.formato);
  console.log("==================================================");

  const ap = mem.apartados.find((a) => a.numero === 3) ?? mem.apartados.find((a) => /aplicaci/i.test(a.titulo));
  if (!ap) {
    console.log("No se encontró apartado 03. Apartados:", mem.apartados.map((a) => `${a.id}:${a.titulo}`));
    return;
  }
  console.log("APARTADO:", ap.id, ap.titulo);
  console.log("\n--- CONTENIDO (string) ---");
  console.log(JSON.stringify(ap.contenido));
  console.log("\n--- BLOQUES ---");
  for (const b of ap.bloques ?? []) {
    if (b.type === "text") console.log("TEXT:", JSON.stringify(b.content));
    else console.log("TABLE:", JSON.stringify(b.content));
  }

  console.log("\n--- TABLAS (apartado 03) ---");
  for (const t of mem.tablas.filter((t) => t.apartado === "03")) {
    console.log("titulo:", JSON.stringify(t.titulo), "| vacia:", t.vacia);
    console.log("  cabecera:", JSON.stringify(t.cabecera));
    for (const f of t.filas) console.log("  fila:", JSON.stringify(f));
  }
}

(async () => {
  await dump("examples/M0106578-2024.DOC", "memoria_word");
  await dump("examples/M0106578.DOC", "memoria_word");
})();
