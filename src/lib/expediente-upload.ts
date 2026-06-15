import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";

import { logger } from "@/lib/logger";

import { uploadFilesToExpediente } from "@/lib/process/upload-files";



const log = logger.child({ module: "expediente-upload" });



function redirect(request: NextRequest, path: string) {

  return NextResponse.redirect(new URL(path, request.url), 303);

}



export async function createExpedienteFromFormUpload(request: NextRequest) {

  const startedAt = Date.now();



  try {

    const formData = await request.formData();

    const files = formData.getAll("files") as File[];



    log.info("subida multipart recibida", {

      fileCount: files.length,

      files: files.map((f) => ({ name: f.name, sizeBytes: f.size })),

    });



    if (!files.length) {

      return redirect(

        request,

        "/expedientes/new?error=" + encodeURIComponent("No se enviaron archivos")

      );

    }



    const expediente = await prisma.expediente.create({

      data: {

        cliente: "Pendiente de identificar",

        ejercicio: 0,

      },

    });



    await uploadFilesToExpediente(expediente.id, files);



    log.info("subida multipart completada", {

      expedienteId: expediente.id,

      durationMs: Date.now() - startedAt,

    });



    return redirect(request, `/expedientes/${expediente.id}?process=1`);

  } catch (err) {

    log.error("subida multipart falló", err, { durationMs: Date.now() - startedAt });

    const message = err instanceof Error ? err.message : "Error al subir archivos";

    return redirect(request, "/expedientes/new?error=" + encodeURIComponent(message));

  }

}

