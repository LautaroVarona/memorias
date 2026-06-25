import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = "examples";
for (const name of readdirSync(dir)) {
  if (!/\.docx?$/i.test(name)) continue;
  const buf = readFileSync(join(dir, name));
  const head = buf.subarray(0, 8);
  const hex = [...head].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  const ascii = [...head].map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : ".")).join("");
  let fmt = "desconocido";
  if (buf.subarray(0, 5).toString("latin1") === "{\\rtf") fmt = "RTF";
  else if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) fmt = "OLE2 (doc binario)";
  else if (head[0] === 0x50 && head[1] === 0x4b) fmt = "ZIP (docx)";
  console.log(`${name.padEnd(24)} ${fmt.padEnd(20)} hex=${hex} ascii=${ascii}`);
}
