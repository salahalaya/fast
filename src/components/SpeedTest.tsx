"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "idle" | "latency" | "download" | "upload" | "done";

const MIB = 1 << 20;
const DOWNLOAD_STREAMS = 4;
const DOWNLOAD_ROUNDS = [8, 24];
const UPLOAD_STREAMS = 3;
const UPLOAD_ROUNDS = [6, 18];
const RING = 2 * Math.PI * 42;

type Tier = {
  min: number;
  label: string;
  cap: string;
  text: string;
  bar: string;
  dot: string;
};

const DOWN_TIERS: Tier[] = [
  { min: 0, label: "Très lent", cap: "Utilisable pour email et lecture. Les vidéos peuvent mettre du temps à charger.", text: "text-red-400", bar: "bg-red-500", dot: "bg-red-500" },
  { min: 5, label: "Lent", cap: "Correct pour navigation et musique. La vidéo HD fonctionne.", text: "text-orange-400", bar: "bg-orange-500", dot: "bg-orange-500" },
  { min: 15, label: "Bon", cap: "Streaming HD confortable et appels vidéo.", text: "text-amber-300", bar: "bg-amber-400", dot: "bg-amber-400" },
  { min: 50, label: "Rapide", cap: "Streaming 4K, jeux en ligne et appels vidéo fluides.", text: "text-emerald-300", bar: "bg-emerald-400", dot: "bg-emerald-400" },
  { min: 150, label: "Très rapide", cap: "4K partout, gaming intensif et nombreux appareils simultanés.", text: "text-sky-300", bar: "bg-sky-400", dot: "bg-sky-400" },
  { min: 500, label: "Ultra rapide", cap: "Vitesse maximale pour tout ce que vous faites.", text: "text-violet-300", bar: "bg-violet-400", dot: "bg-violet-400" },
];

const UP_TIERS: Tier[] = [
  { min: 0, label: "Faible", cap: "Correct pour photos et documents.", text: "text-orange-400", bar: "bg-orange-500", dot: "bg-orange-500" },
  { min: 5, label: "Bon", cap: "Sauvegardes cloud et appels vidéo fonctionnent bien.", text: "text-amber-300", bar: "bg-amber-400", dot: "bg-amber-400" },
  { min: 20, label: "Rapide", cap: "Les gros fichiers s'envoient vite, le streaming en direct fonctionne.", text: "text-emerald-300", bar: "bg-emerald-400", dot: "bg-emerald-400" },
  { min: 100, label: "Très rapide", cap: "Même les gros fichiers professionnels s'envoient instantanément.", text: "text-sky-300", bar: "bg-sky-400", dot: "bg-sky-400" },
];

const PING_TIERS: Tier[] = [
  { min: 0, label: "Excellent", cap: "Parfait pour les jeux en ligne et les appels.", text: "text-emerald-300", bar: "bg-emerald-400", dot: "bg-emerald-400" },
  { min: 35, label: "Bon", cap: "Idéal pour le streaming et la plupart des jeux en ligne.", text: "text-sky-300", bar: "bg-sky-400", dot: "bg-sky-400" },
  { min: 80, label: "Moyen", cap: "Correct pour la vidéo et les appels vidéo.", text: "text-amber-300", bar: "bg-amber-400", dot: "bg-amber-400" },
  { min: 150, label: "Lent", cap: "Les pages web et l'email fonctionnent quand même.", text: "text-orange-400", bar: "bg-orange-500", dot: "bg-orange-500" },
];

function pickTier(tiers: Tier[], value: number | null) {
  let tier = tiers[0];
  if (value !== null && isFinite(value)) {
    for (const t of tiers) if (value >= t.min) tier = t;
  }
  return tier;
}

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

function uploadBlob(size: number) {
  const chunkSize = 512 * 1024;
  const parts: Uint8Array[] = [];
  let remaining = size;
  while (remaining > 0) {
    parts.push(randomBytes(Math.min(chunkSize, remaining)));
    remaining -= chunkSize;
  }
  return new Blob(parts as BlobPart[], { type: "application/octet-stream" });
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

function splitSize(total: number, streams: number) {
  const per = Math.floor(total / streams);
  return Array.from({ length: streams }, (_, i) =>
    i === streams - 1 ? total - per * (streams - 1) : per
  );
}

function downloadRound(mbytes: number, streams: number, onLive: (mbps: number) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const sizes = splitSize(mbytes * MIB, streams);
    const t0 = performance.now();
    let bytes = 0;
    let finished = 0;
    let lastUpdate = 0;
    let errored = false;

    const tick = () => {
      const now = performance.now();
      if (now - lastUpdate >= 100) {
        lastUpdate = now;
        onLive(toMbps(bytes / ((now - t0) / 1000)));
      }
    };

    const finalize = () => {
      const elapsed = (performance.now() - t0) / 1000;
      const speed = toMbps(bytes / elapsed);
      onLive(speed);
      resolve(speed);
    };

    for (const size of sizes) {
      (async () => {
        const res = await fetch(`/api/download?size=${size}`, { cache: "no-store" });
        if (!res.ok || !res.body) throw new Error("Download failed");
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          tick();
        }
      })()
        .then(() => {
          if (++finished === streams) finalize();
        })
        .catch((err) => {
          if (!errored) {
            errored = true;
            reject(err);
          }
        });
    }
  });
}

function uploadRound(mbytes: number, streams: number, onLive: (mbps: number) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const sizes = splitSize(mbytes * MIB, streams);
    const t0 = performance.now();
    const progressByStream = new Array(streams).fill(0);
    const receivedByStream = new Array(streams).fill(0);
    let finished = 0;
    let lastUpdate = 0;
    let errored = false;

    const emitLive = () => {
      const total = progressByStream.reduce((a, b) => a + b, 0);
      const now = performance.now();
      if (now - lastUpdate >= 100) {
        lastUpdate = now;
        onLive(toMbps(total / ((now - t0) / 1000)));
      }
    };

    const finalize = () => {
      const elapsed = (performance.now() - t0) / 1000;
      const total = receivedByStream.reduce((a, b) => a + b, 0);
      const speed = toMbps(total / elapsed);
      onLive(speed);
      resolve(speed);
    };

    sizes.forEach((size, i) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload");
      xhr.responseType = "json";
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        progressByStream[i] = e.loaded;
        emitLive();
      };
      xhr.onload = () => {
        receivedByStream[i] = (xhr.response as { received?: number })?.received ?? 0;
        if (++finished === streams) finalize();
      };
      xhr.onerror = () => {
        if (!errored) {
          errored = true;
          reject(new Error("Upload failed"));
        }
      };
      xhr.send(uploadBlob(size));
    });
  });
}

export default function SpeedTest() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [live, setLive] = useState<number | null>(null);
  const [download, setDownload] = useState<number | null>(null);
  const [upload, setUpload] = useState<number | null>(null);
  const [ping, setPing] = useState<number | null>(null);
  const [ip, setIp] = useState<string | null>(null);
  const [status, setStatus] = useState("Appuyez sur le bouton pour commencer");
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
      setStatus("Mesure de la latence\u2026");
      const pingMs = await measurePing();
      setPing(pingMs);
      setProgress(0.1);

      let bestDown = 0;
      setPhase("download");
      for (let i = 0; i < DOWNLOAD_ROUNDS.length; i++) {
        const mbytes = DOWNLOAD_ROUNDS[i];
        setStatus(`T\u00e9l\u00e9chargement de ${mbytes} Mo \u00b7 ${DOWNLOAD_STREAMS} flux`);
        const speed = await downloadRound(mbytes, DOWNLOAD_STREAMS, (mbps) => {
          setLive(mbps);
          setProgress(0.1 + (0.45 * (i + 1)) / DOWNLOAD_ROUNDS.length);
        });
        bestDown = Math.max(bestDown, speed);
        setDownload(bestDown);
      }
      setDownload(bestDown);
      setProgress(0.55);

      let bestUp = 0;
      setPhase("upload");
      setLive(null);
      for (let i = 0; i < UPLOAD_ROUNDS.length; i++) {
        const mbytes = UPLOAD_ROUNDS[i];
        setStatus(`Envoi de ${mbytes} Mo \u00b7 ${UPLOAD_STREAMS} flux`);
        const speed = await uploadRound(mbytes, UPLOAD_STREAMS, (mbps) => {
          setLive(mbps);
          setProgress(0.55 + (0.45 * (i + 1)) / UPLOAD_ROUNDS.length);
        });
        bestUp = Math.max(bestUp, speed);
        setUpload(bestUp);
      }
      setUpload(bestUp);
      setProgress(1);
      setPhase("done");
      setLive(bestDown);
      setStatus("Test termin\u00e9");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Le test a \u00e9chou\u00e9. Veuillez r\u00e9essayer.");
      setPhase("done");
      setStatus("Test interrompu");
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    fetch("/api/info", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { ip?: string }) => setIp(data.ip ?? "—"))
      .catch(() => setIp("—"));
  }, []);

  const isTesting = phase === "latency" || phase === "download" || phase === "upload";
  const neverStarted = !started && !isTesting;
  const heroSpeed = phase === "upload" ? live : phase === "download" ? live : download;
  const downTier = pickTier(DOWN_TIERS, download);
  const upTier = pickTier(UP_TIERS, upload);
  const pingTier = pickTier(PING_TIERS, ping);
  const pill = neverStarted
    ? { label: "Pr\u00eat", dot: "bg-orange-500", text: "text-orange-400" }
    : phase === "latency"
      ? { label: "Latence", dot: "bg-amber-400", text: "text-amber-300" }
      : phase === "download"
        ? { label: "T\u00e9l\u00e9chargement", dot: "bg-emerald-400", text: "text-emerald-300" }
        : phase === "upload"
          ? { label: "Envoi", dot: "bg-sky-400", text: "text-sky-300" }
          : download !== null
            ? { label: downTier.label, dot: downTier.dot, text: downTier.text }
            : { label: "Termin\u00e9", dot: "bg-emerald-400", text: "text-emerald-300" };

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
            vitesse<b className="text-orange-500">test</b>
          </span>
        </div>
        <div className="hidden items-center gap-2 text-sm text-zinc-400 sm:flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          {ip ?? "connexion\u2026"}
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
            {error ? (
              <span className="text-red-400">{error}</span>
            ) : download !== null && phase === "done" ? (
              <span className="normal-case tracking-normal text-zinc-300">{downTier.cap}</span>
            ) : (
              <span className="uppercase tracking-[0.25em]">{status}</span>
            )}
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
              aria-label={isTesting ? "Test en cours\u2026" : started ? "Relancer le test" : "Lancer le test de vitesse"}
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Adresse IP"
            value={ip ?? "—"}
            icon={<GlobeIcon className="h-4 w-4 text-orange-400" />}
            bar="from-orange-500 to-amber-400"
          />
          <Stat
            label="T\u00e9l\u00e9chargement"
            value={`${fmtSpeed(download)} Mb/s`}
            icon={<ArrowDownIcon className="h-4 w-4 text-emerald-400" />}
            bar="from-emerald-500 to-teal-400"
          />
          <Stat
            label="Envoi"
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
        </div>
      </section>

      {download !== null && (
        <section className="mx-auto w-full max-w-2xl animate-[fade-up_0.4s_ease] px-6 pb-12">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-zinc-300">
                Ce que cela signifie
              </h3>
              <span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-zinc-500 sm:block">
                compar\u00e9 \u00e0 un forfait classique de 50 Mb/s
              </span>
            </div>
            <div className="mt-1 divide-y divide-white/[0.06]">
              <ResultRow
                label="T\u00e9l\u00e9chargement"
                value={fmtSpeed(download)}
                unit="Mb/s"
                tier={downTier}
                meter={Math.min(100, (download / 50) * 100)}
                icon={<ArrowDownIcon className="h-4 w-4 text-emerald-400" />}
              />
              <ResultRow
                label="Envoi"
                value={fmtSpeed(upload)}
                unit="Mb/s"
                tier={upTier}
                meter={Math.min(100, ((upload ?? 0) / 20) * 100)}
                icon={<ArrowUpIcon className="h-4 w-4 text-sky-400" />}
              />
              <ResultRow
                label="Ping"
                value={fmtPing(ping)}
                unit="ms"
                tier={pingTier}
                meter={Math.max(6, 100 - ((ping ?? 300) / 200) * 100)}
                icon={<SignalIcon className="h-4 w-4 text-violet-400" />}
              />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-zinc-500">
              Ces valeurs sont des estimations \u2014 la vitesse r\u00e9elle varie selon le Wi-Fi et vos appareils.
              Les barres comparent avec un forfait classique de 50 Mb/s : plus long = plus rapide.
              Pour le ping, un nombre plus bas signifie une connexion plus r\u00e9active.
            </p>
          </div>
        </section>
      )}
    </main>
  );
}

function ResultRow({
  label,
  value,
  unit,
  tier,
  meter,
  icon,
}: {
  label: string;
  value: string;
  unit: string;
  tier: Tier;
  meter: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 py-4">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.05]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-zinc-300">{label}</span>
          <span
            className={`rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-bold ${tier.text}`}
          >
            {tier.label}
          </span>
        </div>
        <p className="mt-1 text-xs text-zinc-500">{tier.cap}</p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full ${tier.bar} transition-[width] duration-1000 ease-out`}
            style={{ width: `${meter}%` }}
          />
        </div>
      </div>
      <div className="min-w-0 text-right">
        <div className="text-lg font-bold tabular-nums text-zinc-50">{value}</div>
        <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{unit}</div>
      </div>
    </div>
  );
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