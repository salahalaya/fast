import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHUNK = new Uint8Array(1 << 20);
for (let i = 0; i < CHUNK.length; i += 4) {
  let r = Math.imul(Date.now() + i, 2654435761) >>> 0;
  r ^= r >>> 16;
  r = Math.imul(r, 2246822519) >>> 0;
  r ^= r >>> 13;
  CHUNK[i] = r & 0xff;
  CHUNK[i + 1] = (r >>> 8) & 0xff;
  CHUNK[i + 2] = (r >>> 16) & 0xff;
  CHUNK[i + 3] = (r >>> 24) & 0xff;
}

const MAX = 200 << 20;

export async function GET(request: NextRequest) {
  const raw = Number(request.nextUrl.searchParams.get("size") || 0);
  const size = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), MAX) : CHUNK.length;

  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= size) {
        controller.close();
        return;
      }
      const remaining = size - sent;
      const block = remaining >= CHUNK.length ? CHUNK : CHUNK.slice(0, remaining);
      sent += block.length;
      controller.enqueue(block);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
      "Cache-Control": "no-store, max-age=0",
      "Access-Control-Expose-Headers": "Content-Length",
    },
  });
}