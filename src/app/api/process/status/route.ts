/** Respuesta vacía para peticiones de otras apps que comparten el puerto 3000. */
export async function GET() {
  return Response.json({ status: "idle", app: "memorias" });
}
