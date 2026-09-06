# ⚡ Fast — Internet Speed Test

A simple, fast, beautiful internet speed test built with **Next.js** and **Tailwind CSS**. Shows your **download speed**, **upload speed**, **ping** and **public IP** — no sign-up, no ads, no cookies.

Powered by the "big-pickle" model. Deploys straight to Vercel or any Node.js host.

## Features

- **Accurate measurement** — parallel multi-connection transfers (like fast.com / Ookla) saturate your link, incompressible pseudo-random payloads, and compression disabled server-side so results aren't faked by gzip
- **Live gauge** — big animated Mbps number that updates during each transfer, plus a progress ring around the start button
- **Ping** — minimum of 6 latency probes
- **Your IP** — client IP resolved from proxy headers
- **Manual start** — the test only runs when you press the button; tap again to retest
- Graceful error handling, fully responsive dark UI, zero third-party dependencies

## How the test works

| Phase | Method |
| --- | --- |
| Ping | 6 × `GET /api/ping`, take min |
| Download | 2 rounds (8 / 24 MB) × **4 parallel streams**, keep the highest Mbps |
| Upload | 2 rounds (6 / 18 MB) × **3 parallel streams** over XHR (progress events), keep the highest Mbps |

`next.config.ts` sets `compress: false` so the response stream is never gzip-compressed and the measured throughput reflects the real network speed.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and press the button to start.

## Production

```bash
npm run build
npm run start
```

### Deploy on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fanomalyco%2Ffast)

Vercel already sets the `x-forwarded-for` header, so the real client IP is shown out of the box.

## API endpoints

- `GET /api/ping` — latency probe
- `GET /api/download?size=<bytes>` — streams `size` bytes of random data
- `POST /api/upload` — consumes the upload body and echoes bytes received
- `GET /api/info` — client IP only

## License

MIT