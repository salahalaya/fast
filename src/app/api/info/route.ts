import { NextRequest } from "next/server";
import os from "node:os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    "127.0.0.1";

  return Response.json(
    {
      ip,
      server: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        node: process.version,
        uptime: Math.floor(os.uptime()),
        cpus: os.cpus().length,
        totalMem: os.totalmem(),
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": "application/json",
      },
    }
  );
}