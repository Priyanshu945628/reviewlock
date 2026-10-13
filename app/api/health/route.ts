import { NextResponse } from "next/server";
import { checkDbHealth } from "@/lib/db";
import { getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  let dbOk = false;
  let driveOk = false;

  try {
    dbOk = await checkDbHealth();
  } catch (err) {
    console.error("[Health] DB check error:", err);
  }

  try {
    driveOk = await getStorageProvider().ping();
  } catch (err) {
    console.error("[Health] Drive check error:", err);
  }

  const healthy = dbOk && driveOk;

  const details = {
    status: healthy ? "ok" : "degraded",
    services: {
      database: dbOk ? "connected" : "unreachable",
      drive: driveOk ? "connected" : "unreachable",
    },
    timestamp: new Date().toISOString(),
  };

  if (!healthy) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVICE_DEGRADED",
          message: "One or more dependent services are unreachable",
        },
        data: details,
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: details,
  });
}
