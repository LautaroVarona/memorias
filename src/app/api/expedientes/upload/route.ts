import { NextRequest } from "next/server";
import { createExpedienteFromFormUpload } from "@/lib/expediente-upload";

export const maxDuration = 300;

/** Compatibilidad: misma lógica que POST /api/expedientes con multipart. */
export async function POST(request: NextRequest) {
  return createExpedienteFromFormUpload(request);
}
