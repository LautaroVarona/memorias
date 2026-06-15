import { processExpediente } from "../src/lib/process/expediente";

const id = process.argv[2] ?? "cmqf4cszo002jpdfg7i2iffu7";

processExpediente(id)
  .then((r) => {
    console.log("OK", JSON.stringify(r.resumen));
    process.exit(0);
  })
  .catch((err) => {
    console.error("FAIL", err);
    process.exit(1);
  });
