"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ServerInfo = {
  hostname: string;
  platform: string;
  arch: string;
  node: string;
  uptime: number;
  cpus: number;
};

type Info = {
  ip: string;
  server: ServerInfo;
};

type Phase = "idle" | "latency" | "download" | "upload" | "done";

const MIB = 1 << 20;
const DOWNLOAD_SIZES = [1, 5, 15];
const UPLOAD_SIZES = [1, 4, 10];

const toMbps = (bytesPerSec: number) => (bytesPerSec * 8) / 1e6;

function fmtSpeed(mbps: number | null) {
  if (mbps === null || !isFinite(mbps) || mbps < 0) return "—";
  if (mbps >= 100) return mbps.toFixed(0);
  if (mbps >= 10) return mbps.toFixed(1);
  return mbps.toFixed(2);
}

function fmtPing(ms: number | null) {
  if (ms === null || !isFinite(ms)) return "—";
  if (ms >= 100) return ms.toFixed(0);
  return ms.toFixed(1);
}

function randomBytes(size: number) {
  const arr = new Uint8Array(size);
  let seed = (Date.now() ^ ((Math.random() * 0xffffffff) >>> 0)) >>> 0;
  for (let i = 0; i < size; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    arr[i] = (seed >>> 24) & 0xff;
  }
  return arr;
}

async function measurePing(): Promise<number> {
  let best = Infinity;
  for (let i = 0; i < 6; i++) {
    const t0 = performance.now();
    try {
      await fetch(`/api/ping?t=${Date.now()}`, { cache: "no-store" });
      best = Math.min(best, performance.now() - t0);
    } catch {
      /* ignore */
    }
  }
  return best === Infinity ? 0 : best;
}

function downloadPass(sizeBytes: number, onLive: (mbps: number) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    fetch(`/api/download?size=${sizeBytes}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok || !res.body) throw new Error("Download failed");
        const reader = res.body.getReader();
        const t0 = performance.now();
        let bytes = 0;
        let lastUpdate = 0;
        for (;;) {
          const { done, value } = await reader.read();
          const now = performance.now();
          if (done) break;
          bytes += value.byteLength;
          if (now - lastUpdate >= 80) {
            lastUpdate = now;
            onLive(toMbps(bytes / ((now - t0) / 1000)));
          }
        }
        const elapsed = (performance.now() - t0) / 1000;
        onLive(toMbps(bytes / elapsed));
        resolve(toMbps(bytes / elapsed));
      })
      .catch(reject);
  });
}

function uploadPass(sizeBytes: number, onLive: (mbps: number) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const data = randomBytes(sizeBytes);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.responseType = "json";
    const start = performance.now();
    let lastUpdate = 0;
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const now = performance.now();
      if (now - lastUpdate >= 80) {
        lastUpdate = now;
        onLive(toMbps(e.loaded / ((now - start) / 1000)));
      }
    };
    xhr.onload = () => {
      const elapsed = (performance.now() - start) / 1000;
      const received = (xhr.response as { received?: number })?.received ?? 0;
      onLive(toMbps(received / elapsed));
      resolve(toMbps(received / elapsed));
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(data);
  });
}

export default function SpeedTest() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [live, setLive] = useState<number | null>(null);
  const [download, setDownload] = useState<number | null>(null);
  const [upload, setUpload] = useState<number | null>(null);
  const [ping, setPing] = useState<number | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const running = useRef(false);

  const runTest = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setError(null);
    setProgress(0);
    setLive(null);
    setStarted(true);

    try {
      setPhase("latency");
      setStatus("Measuring latency…");
      const pingMs = await measurePing();
      setPing(pingMs);
      setProgress(0.08);

      let bestDown = 0;
      setPhase("download");
      for (let i = 0; i < DOWNLOAD_SIZES.length; i++) {
        const size = DOWNLOAD_SIZES[i] * MIB;
        setStatus(`Download ${DOWNLOAD_SIZES[i]} MB`);
        const speed = await downloadPass(size, (mbps) => {
          setLive(mbps);
          setProgress(0.08 + (0.46 * (i + 1)) / DOWNLOAD_SIZES.length);
        });
        bestDown = Math.max(bestDown, speed);
        setDownload(bestDown);
      }
      setDownload(bestDown);
      setProgress(0.55);

      let bestUp = 0;
      setPhase("upload");
      setLive(null);
      for (let i = 0; i < UPLOAD_SIZES.length; i++) {
        const size = UPLOAD_SIZES[i] * MIB;
        setStatus(`Upload ${UPLOAD_SIZES[i]} MB`);
        const speed = await uploadPass(size, (mbps) => {
          setLive(mbps);
          setProgress(0.55 + (0.45 * (i + 1)) / UPLOAD_SIZES.length);
        });
        bestUp = Math.max(bestUp, speed);
        setUpload(bestUp);
      }
      setUpload(bestUp);
      setProgress(1);
      setPhase("done");
      setLive(bestDown);
      setStatus("Test complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed. Please try again.");
      setPhase("done");
      setStatus("Test interrupted");
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    fetch("/api/info", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: Info) => setInfo(data))
      .catch(() => setInfo(null));

    const t = setTimeout(runTest, 350);
    return () => clearTimeout(t);
  }, [runTest]);

  const activeLabel =
    phase === "latency" ? "LATENCY" : phase === "upload" ? "UPLOAD" : "DOWNLOAD";
  const isTesting = phase === "latency" || phase === "download" || phase === "upload";
  const heroSpeed = phase === "upload" ? live : phase === "download" ? live : download;

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-orange-500/[0.07] blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 -z-10 h-[360px] w-[420px] translate-y-1/2 rounded-full bg-sky-500/[0.06] blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-1/3 -z-10 h-[320px] w-[380px] translate-x-1/2 rounded-full bg-fuchsia-500/[0.05] blur-3xl" />

      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 font-black shadow-lg shadow-orange-500/30">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" fill="white" />
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-tight">speed&nbsp;<span className="text-orange-500">test</span></span>
        </div>
        <div className="hidden items-center gap-2 text-sm text-zinc-400 sm:flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          {info?.server.hostname ?? "connecting…"}{info ? ` · ${info.server.platform}/${info.server.arch}` : ""}
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 pb-10">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-orange-400">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
            {activeLabel}
          </div>

          <div className="flex items-start leading-none">
            <span className="bg-gradient-to-b from-white via-white to-white/60 bg-clip-text text-[7rem] font-black tabular-nums tracking-tight text-transparent sm:text-[10rem]">
              {fmtSpeed(heroSpeed)}
            </span>
            <span className="mt-6 ml-3 flex flex-col items-start text-xl font-semibold text-zinc-400 sm:mt-10 sm:text-3xl">
              <span>Mb</span>
              <span className="text-base text-zinc-500 sm:text-xl">/s</span>
            </span>
          </div>

          <p className="mt-4 h-6 text-sm font-medium uppercase tracking-[0.25em] text-zinc-500">
            {phase === "idle" && "Ready to test"}
            {phase === "latency" && "Latency"}
            {phase === "download" && status}
            {phase === "upload" && status}
            {phase === "done" && error ? "Something went wrong" : "Test complete"}
          </p>

          <div className="mt-8 h-1.5 w-64 overflow-hidden rounded-full bg-white/10 sm:w-96">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-300"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>

          <div className="mt-2 flex w-64 justify-between text-[11px] text-zinc-500 sm:w-96">
            <span>ping {fmtPing(ping)} ms</span>
            <span>↓ {fmtSpeed(download)}</span>
            <span>↑ {fmtSpeed(upload)}</span>
          </div>

          <button
            onClick={runTest}
            disabled={isTesting}
            className="group mt-10 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 font-bold shadow-2xl shadow-orange-500/40 transition-all duration-200 hover:scale-105 hover:shadow-orange-500/60 active:scale-95 disabled:cursor-wait disabled:opacity-70 disabled:hover:scale-100"
            aria-label={isTesting ? "Testing…" : started ? "Run test again" : "Run speed test"}
          >
            {isTesting ? (
              <svg className="h-8 w-8 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="3" />
                <path className="opacity-90" fill="white" d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4Z" />
              </svg>
            ) : (
              <svg className="ml-1 h-8 w-8" viewBox="0 0 24 24" fill="white" aria-hidden>
                <path d="M8 5v14l11-7Z" />
              </svg>
            )}
          </button>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-6 pb-10">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="IP Address" value={info?.ip ?? "—"} accent="orange" />
          <Stat label="Download" value={`${fmtSpeed(download)} Mbps`} accent="emerald" />
          <Stat label="Upload" value={`${fmtSpeed(upload)} Mbps`} accent="sky" />
          <Stat label="Ping" value={`${fmtPing(ping)} ms`} accent="violet" />
          <Stat
            label="Server"
            value={info?.server.hostname ?? "—"}
            sub={info?.server.platform ?? ""}
            accent="zinc"
          />
          <Stat label="Node" value={info?.server.node ?? "—"} sub={`${info?.server.cpus ?? ""} cores`} accent="zinc" />
        </div>
      </section>
    </main>
  );
}

const ACCENTS: Record<string, string> = {
  orange: "from-orange-500/25 to-orange-500/0 border-orange-500/30 text-orange-400",
  emerald: "from-emerald-500/25 to-emerald-500/0 border-emerald-500/30 text-emerald-400",
  sky: "from-sky-500/25 to-sky-500/0 border-sky-500/30 text-sky-400",
  violet: "from-violet-500/25 to-violet-500/0 border-violet-500/30 text-violet-400",
  zinc: "from-zinc-500/25 to-zinc-500/0 border-zinc-500/30 text-zinc-400",
};

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: keyof typeof ACCENTS;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-b p-4 ${ACCENTS[accent]}`}
    >
      <span className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-white/[0.04]" />
      <div className="truncate text-[11px] font-semibold uppercase tracking-[0.15em] opacity-70">{label}</div>
      <div className="mt-2 truncate text-lg font-bold tabular-nums" title={value}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 truncate text-xs opacity-70">{sub}</div> : null}
    </div>
  );
}