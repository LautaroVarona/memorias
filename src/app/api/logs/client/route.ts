import { NextRequest, NextResponse } from "next/server";

import { logClientEvent } from "@/lib/logger";
import type { LogContext, LogLevel } from "@/lib/logger/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      level?: LogLevel;
      message?: string;
      context?: LogContext;
      ts?: string;
    };

    if (!body.message || !body.level) {
      return NextResponse.json({ error: "Mensaje o nivel inválido" }, { status: 400 });
    }

    logClientEvent({
      level: body.level,
      message: body.message,
      context: body.context,
      ts: body.ts,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }
}
