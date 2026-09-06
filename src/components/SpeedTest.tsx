"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ServerInfo = {
  hostname: string;
  platform: string;
  arch: string;
  node: string;
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
const RING = 2 * Math.PI * 42;

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
  const [status, setStatus] = useState("Press the button to start");
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
        setStatus(`Downloading ${DOWNLOAD_SIZES[i]} MB`);
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
        setStatus(`Uploading ${UPLOAD_SIZES[i]} MB`);
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
  }, []);

  const isTesting = phase === "latency" || phase === "download" || phase === "upload";
  const neverStarted = !started && !isTesting;
  const heroSpeed = phase === "upload" ? live : phase === "download" ? live : download;
  const pill = neverStarted
    ? { label: "Ready", dot: "bg-orange-500", text: "text-orange-400" }
    : phase === "latency"
      ? { label: "Latency", dot: "bg-amber-400", text: "text-amber-300" }
      : phase === "download"
        ? { label: "Download", dot: "bg-emerald-400", text: "text-emerald-300" }
        : phase === "upload"
          ? { label: "Upload", dot: "bg-sky-400", text: "text-sky-300" }
          : { label: "Done", dot: "bg-emerald-400", text: "text-emerald-300" };

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="pointer-events-none absolute -top-44 left-1/2 -z-10 h-[560px] w-[960px] -translate-x-1/2 rounded-full bg-orange-500/[0.08] blur-3xl" />
      <div className="pointer-events-none absolute -left-24 bottom-0 -z-10 h-[380px] w-[420px] rounded-full bg-sky-500/[0.07] blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-1/3 -z-10 h-[340px] w-[400px] rounded-full bg-fuchsia-500/[0.06] blur-3xl" />

      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 shadow-lg shadow-orange-500/30">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" fill="white" />
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-tight">
            speed<b className="text-orange-500">test</b>
          </span>
        </div>
        <div className="hidden items-center gap-2 text-sm text-zinc-400 sm:flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          {info?.server.hostname ?? "connecting…"}
          {info ? ` · ${info.server.platform}/${info.server.arch}` : ""}
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 pb-8">
        <div className="flex flex-col items-center text-center">
          <div
            className={`mb-4 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] ${pill.text}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${pill.dot}`} />
            {pill.label}
          </div>

          <div className="flex h-[7rem] items-center sm:h-[10rem]">
            {neverStarted ? (
              <div className="flex h-28 w-28 animate-[spin_7s_linear_infinite] items-center justify-center text-zinc-600 sm:h-36 sm:w-36">
                <SyncIcon />
              </div>
            ) : (
              <>
                <span className="bg-gradient-to-b from-white via-white to-white/55 bg-clip-text text-[6.5rem] font-black tabular-nums leading-none tracking-tight text-transparent sm:text-[9.5rem]">
                  {fmtSpeed(heroSpeed)}
                </span>
                <span className="mt-5 ml-3 flex flex-col items-start text-xl font-semibold text-zinc-400 sm:mt-9 sm:text-3xl">
                  <span>Mb</span>
                  <span className="text-base text-zinc-500 sm:text-xl">/s</span>
                </span>
              </>
            )}
          </div>

          <p className="mt-3 flex h-6 items-center text-sm font-medium text-zinc-500">
            <StatusMessage phase={phase} status={status} error={error} />
          </p>

          <div className="relative mt-10 h-24 w-24 sm:h-28 sm:w-28">
            {!isTesting && (
              <span className="absolute inset-0 animate-ping rounded-full bg-orange-500/25" />
            )}
            <button
              onClick={runTest}
              disabled={isTesting}
              className={`relative z-10 grid h-full w-full place-items-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 shadow-2xl shadow-orange-500/40 transition-transform duration-200 ${
                isTesting
                  ? "cursor-wait"
                  : "hover:scale-105 hover:shadow-orange-500/60 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-400"
              }`}
              aria-label={isTesting ? "Testing…" : started ? "Run the test again" : "Run the speed test"}
            >
              {isTesting ? (
                <svg className="h-9 w-9 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="3" />
                  <path className="opacity-90" fill="white" d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4Z" />
                </svg>
              ) : (
                <svg
                  className={`ml-1 h-10 w-10 ${started ? "opacity-90" : ""}`}
                  viewBox="0 0 24 24"
                  fill="white"
                  aria-hidden
                >
                  <path d="M8 5v14l11-7Z" />
                </svg>
              )}
            </button>
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
              viewBox="0 0 96 96"
              fill="none"
              aria-hidden
            >
              <circle cx="48" cy="48" r="42" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
              <circle
                cx="48"
                cy="48"
                r="42"
                stroke="rgba(255,255,255,0.85)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={RING}
                strokeDashoffset={RING * (1 - progress)}
                className="transition-all duration-300 ease-out"
              />
            </svg>
          </div>

          <div className="mt-9 flex w-72 items-center justify-between text-xs font-medium text-zinc-400 sm:w-96">
            <span className="flex items-center gap-1.5">
              <ArrowDownIcon className="h-3.5 w-3.5 text-emerald-400" />
              {fmtSpeed(download)} Mb/s
            </span>
            <span className="flex items-center gap-1.5">
              <ArrowUpIcon className="h-3.5 w-3.5 text-sky-400" />
              {fmtSpeed(upload)} Mb/s
            </span>
            <span className="flex items-center gap-1.5">
              <SignalIcon className="h-3.5 w-3.5 text-violet-400" />
              {fmtPing(ping)} ms
            </span>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-6 pb-10">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat
            label="IP Address"
            value={info?.ip ?? "—"}
            icon={<GlobeIcon className="h-4 w-4 text-orange-400" />}
            bar="from-orange-500 to-amber-400"
          />
          <Stat
            label="Download"
            value={`${fmtSpeed(download)} Mb/s`}
            icon={<ArrowDownIcon className="h-4 w-4 text-emerald-400" />}
            bar="from-emerald-500 to-teal-400"
          />
          <Stat
            label="Upload"
            value={`${fmtSpeed(upload)} Mb/s`}
            icon={<ArrowUpIcon className="h-4 w-4 text-sky-400" />}
            bar="from-sky-500 to-cyan-400"
          />
          <Stat
            label="Ping"
            value={`${fmtPing(ping)} ms`}
            icon={<SignalIcon className="h-4 w-4 text-violet-400" />}
            bar="from-violet-500 to-purple-400"
          />
          <Stat
            label="Server"
            value={info?.server.hostname ?? "—"}
            sub={info?.server.platform ?? ""}
            icon={<ServerIcon className="h-4 w-4 text-zinc-300" />}
            bar="from-zinc-500 to-zinc-400"
          />
          <Stat
            label="Runtime"
            value={info?.server.node ?? "—"}
            sub={`${info?.server.cpus ?? ""}-core CPU`}
            icon={<ChipIcon className="h-4 w-4 text-zinc-300" />}
            bar="from-zinc-500 to-zinc-400"
          />
        </div>
        <p className="mt-6 text-center text-xs text-zinc-600">
          Results are estimates and vary with network conditions. Server: {info?.server.hostname ?? "—"} · Node {info?.server.node ?? "—"}{" "}
          · {info ? `${info.server.platform}/${info.server.arch}` : ""}
        </p>
      </section>
    </main>
  );
}

function StatusMessage({
  phase,
  status,
  error,
}: {
  phase: Phase;
  status: string;
  error: string | null;
}) {
  if (phase === "done" && error) return <span className="text-red-400">{error}</span>;
  return <span className="uppercase tracking-[0.25em]">{status}</span>;
}

function Stat({
  label,
  value,
  sub,
  icon,
  bar,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  bar: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.05]">
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${bar} opacity-70`} />
      <div className="flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.05]">{icon}</div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{label}</span>
      </div>
      <div className="mt-3 truncate text-lg font-bold tabular-nums text-zinc-50" title={value}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 truncate text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}

function SyncIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M19 7v4h-4" />
      <path d="M5 17v-4h4" />
      <path d="M17.4 11a6 6 0 0 0-10.3-3.2L5 10" />
      <path d="M6.6 13a6 6 0 0 0 10.3 3.2L19 14" />
    </svg>
  );
}

function ArrowDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 5v14" />
      <path d="m6 13 6 6 6-6" />
    </svg>
  );
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </svg>
  );
}

function SignalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden>
      <path d="M2 20h.01" />
      <path d="M7 20v-4" />
      <path d="M12 20v-8" />
      <path d="M17 20V8" />
      <path d="M22 20V4" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
    </svg>
  );
}

function ServerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01" />
      <path d="M7 16.5h.01" />
    </svg>
  );
}

function ChipIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2v3" />
      <path d="M15 2v3" />
      <path d="M9 19v3" />
      <path d="M15 19v3" />
      <path d="M2 9h3" />
      <path d="M2 15h3" />
      <path d="M19 9h3" />
      <path d="M19 15h3" />
    </svg>
  );
}