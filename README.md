# ⚡ Fast — Internet Speed Test

A simple, fast, beautiful internet speed test built with **Next.js** and **Tailwind CSS**. Shows your **download speed**, **upload speed**, **ping**, **public IP** and **server details** — no sign-up, no ads, no cookies.

Powered by the "big-pickle" model. Deploys straight to Vercel or any Node.js host.

## Features

- **Real measurement** — streams an incompressible pseudo-random payload (compression disabled server-side so numbers aren't faked by gzip) over multiple size passes, keeping the best result
- **Live gauge** — big animated Mbps number that updates as each pass runs, plus a progress bar
- **Ping** — median of 6 latency probes
- **Your IP + server** — public IP (from proxy headers), hostname, OS/arch, Node version, CPU count
- **One-click retest**, graceful error handling, fully responsive dark UI
- Zero third-party dependencies at runtime

## How the test works

| Phase | Method |
| --- | --- |
| Ping | 6 × `GET /api/ping`, take min |
| Download | stream `GET /api/download?size=N` with 1 / 5 / 15 MB passes, keep the highest Mbps |
| Upload | `POST /api/upload` with 1 / 4 / 10 MB of random bytes over XHR (progress events), keep the highest Mbps |

`next.config.ts` sets `compress: false` so the response stream is not gzip-compressed and the measured throughput reflects the real network speed.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The test starts automatically.

## Production

```bash
npm run build
npm run start
```

### Deploy on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fanomalyco%2Ffast)

Vercel already sets the `x-forwarded-for` header, so the real client IP and server info are shown out of the box.

## API endpoints

- `GET /api/ping` — latency probe
- `GET /api/download?size=<bytes>` — streams `size` bytes of random data
- `POST /api/upload` — consumes the upload body and echoes bytes received
- `GET /api/info` — client IP + server details (`hostname`, `platform`, `arch`, `node`, `cpus`, …)

## License

MIT