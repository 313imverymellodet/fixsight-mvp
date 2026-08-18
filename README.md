# FixSight MVP v0.3 — Job Mode

**See the job. Mark the fix. Verify the work. Close it out.**

> **🚀 Live (public):** https://fixsight-mvp-romello-morris-projects-3c79cb47.vercel.app
> **Host:** Vercel (team "Romello Morris' projects", Pro) · **Repo:** https://github.com/313imverymellodet/fixsight-mvp · **Mode:** live (`gpt-4o`)
> Deployment Protection is **off** (fully public). The app has no login and uses a single server-side OpenAI key, so anyone with the URL can trigger AI calls — set an OpenAI spend limit. See [Deployment](#deployment).

FixSight is a working, no-runtime-dependency web-app starter for mechanics, mobile technicians, roadside operators, fleet teams, and service advisors. It turns a repair photo and field question into an interactive visual guide, requires technician review of every AI marker, compares before/after photos, and produces a customer-ready service report with charges and signature.

## What v0.3 includes

### Intake and visual guide

- Business, technician, customer, vehicle, VIN/plate, odometer, and service-location fields
- Task modes for diagnosis, replacement, temporary stabilization, fastener/tool identification, and install-order verification
- Before-photo upload with browser-side compression
- Narrow field-question input for questions such as “Which nut?”, “What socket?”, and “Which terminal first?”
- Structured photo analysis with visible findings, likely issue, confidence, safety gate, repair class, time, tools, warnings, and suggested pricing
- Numbered image markers for Attach, Lift, Support, Inspect, Avoid, Damaged, and Remove
- Fastener map showing what to loosen, remove, inspect, or leave alone
- Ordered steps with explicit checkpoints

### Technician Review Mode

- A required review state for every AI marker:
  - **Verified**
  - **Incorrect**
  - **Need photo**
- Marker correction by tapping the correct position on the original photo
- Notes for rejected markers and requested photo angles
- Step-completion checkboxes
- Review progress meter and unresolved-item visibility
- Privacy-conscious evaluation JSON export containing model metadata, marker decisions, coordinate corrections, step checks, completion result, and event history while excluding customer identity, images, signature, and payment data

### Before/after completion check

- Separate after-photo upload and side-by-side comparison
- Work-performed description
- Four technician completion checks
- AI comparison of the before and after photos
- Completion states:
  - **Likely complete**
  - **Needs attention**
  - **Cannot verify**
  - **Unsafe**
- After-photo markers, visible changes, verification checks, unresolved items, and release guidance
- Safe closeout gating: an unsafe completion result cannot be marked complete

### Invoice and handoff

- Service call, labor hours/rate, parts, materials, discount, tax, amount paid, payment status, and payment method
- Automatic totals and remaining balance
- Customer-facing service description, limitations, warranty notes, and next steps
- Finger/mouse/stylus signature pad
- Required customer acknowledgment and technician sign-off
- Completion rules that prevent closeout when required review, verification, manual checks, description, signature, or sign-offs are missing
- Printable / Save-as-PDF report
- Downloadable standalone HTML report
- Copyable service summary
- Browser-only recent job history and job restoration

### Golden test workflows

1. **2015 Chevrolet Equinox exhaust** — separated rear resonator/exhaust section, temporary stabilization, support/avoid markers, and unsafe completion behavior when the dragging condition remains visible.
2. **2016 Ford Flex SEL battery** — battery replacement, terminal/hold-down identification, fastener map, tool guidance, disconnect/reconnect order, and cautious completion verification.

## Run locally

Requirements: Node.js 20 or newer.

```bash
cd fixsight-mvp
npm start
```

Open `http://localhost:3000`.

Without an API key, FixSight runs in **demo mode**. Both golden workflows, marker review, before/after verification, invoicing, signature, reports, exports, and local history remain usable.

## Enable live photo analysis

```bash
cp .env.example .env
```

Add your server-side key:

```env
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o
PORT=3000
```

> **Model note:** `OPENAI_MODEL` must be a real multimodal model your OpenAI
> account can access (defaults to `gpt-4o`; `gpt-4.1` also works). The original
> v0.3 handoff referenced `gpt-5.6`, which is not a live model and returns a
> `502` from the API. Change `OPENAI_MODEL` only to another model that supports
> the Responses API with strict `json_schema` structured output.

Restart:

```bash
npm start
```

The API key stays on the Node server. It is not included in browser JavaScript or stored in job history.

## Architecture

```text
Browser
  ├─ compresses before and after photos
  ├─ POST /api/analyze with one before photo + job context
  ├─ overlays normalized markers on the original image
  ├─ records technician verification and corrections
  ├─ POST /api/verify with before photo + after photo + work context
  ├─ renders completion evidence and unresolved items
  └─ builds invoice, signature, report, and evaluation export locally

Node server
  ├─ serves static assets
  ├─ returns built-in demo analyses when no API key is configured
  ├─ calls the OpenAI Responses API in live mode
  ├─ requests strict JSON-schema output for analysis
  └─ requests strict JSON-schema output for completion verification
```

This starter intentionally has no third-party runtime packages and no cloud database.

## Main files

- `server.mjs` — static server, demo data, `/health`, `/api/status`, `/api/analyze`, `/api/verify`, prompts, schemas, live API calls (with retry), and the exported `handleAnalyze`/`handleVerify`/`getStatus` handlers shared with the Vercel functions
- `api/*.mjs` — Vercel serverless functions that reuse the shared handlers
- `vercel.json` / `railway.json` / `render.yaml` — per-host deployment config
- `public/index.html` — five-stage field workflow
- `public/app.js` — intake, image preparation, analysis rendering, annotated PNG export, and recent-job history
- `public/job-mode.js` — marker review, coordinate correction, step checks, after-photo verification, invoice, signature, closeout, report, and evaluation export
- `public/styles.css` — responsive field UI and printable report styles
- `tests/smoke.test.mjs` — demo API and static-asset smoke test
- `docs/JOB-MODE.md` — detailed Job Mode behavior
- `docs/EVALUATION-DATA.md` — evaluation export structure and privacy boundary
- `docs/AI-RESPONSE-CONTRACT.md` — analysis and verification response contracts
- `docs/SAFETY-GUARDRAILS.md` — product safety rules
- `docs/PRD.md` — product scope and roadmap

## Validate the build

```bash
npm run validate
```

That command performs syntax checks and starts the demo server to exercise:

- `/api/status`
- `/api/analyze`
- `/api/verify`
- homepage rendering
- Job Mode asset delivery

Generate the browser preview set with Chromium:

```bash
npm run preview
```

The command walks the Ford Flex demo through analysis, marker correction, completion verification, signature, and closeout, then writes PNG previews to `preview/`.

## Docker

```bash
docker build -t fixsight .
docker run --rm -p 3000:3000 -e OPENAI_API_KEY=your_key_here fixsight
```

## Deployment

FixSight ships with config for two hosts. The same code runs on both:

- **Railway / Render / Fly / any Node or Docker host** — runs `server.mjs`
  directly as a persistent HTTP server. **Recommended** (a single AI call takes
  ~15–30s, which suits a long-lived server better than serverless).
- **Vercel** — the `api/*.mjs` serverless functions in `/api` reuse the exact
  same `handleAnalyze` / `handleVerify` logic from `server.mjs`; `public/` is
  served as static files. `vercel.json` sets `maxDuration: 60` and security
  headers.

Confirm live vs demo at `GET /api/status` → `{"mode":"live"}` once the key is set
(`{"mode":"demo"}` otherwise). Health check: `GET /health`.

### Environment variables (set as host secrets — never commit)

| Variable | Required | Value |
| --- | --- | --- |
| `OPENAI_API_KEY` | for live mode | your server-side OpenAI key |
| `OPENAI_MODEL` | no | `gpt-4o` (default) or another multimodal Responses-API model |
| `PORT` | no | injected by the host; server reads it automatically |
| `HOST` | no | defaults to `0.0.0.0` (all interfaces) |

### Railway (recommended)

1. Push this repo to GitHub.
2. Railway → **New Project → Deploy from GitHub repo** → pick this repo.
   `railway.json` selects the Dockerfile build and `/health` health check.
3. **Variables** tab → add `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`).
4. Railway builds, deploys, and gives a public `*.up.railway.app` URL. Pushes to
   the default branch auto-deploy.
- **Redeploy/rollback:** Deployments tab → redeploy or roll back to any prior build.
- **Logs:** Deployments tab → the live log stream.

### Vercel (currently deployed here)

Already deployed at the URL above. To reproduce from scratch:

1. Push this repo to GitHub.
2. Vercel → **Add New → Project → Import** this repo. `vercel.json` pins the
   config: `outputDirectory: public`, no build, `/api/*` functions,
   `maxDuration: 60`, security headers.
3. **Environment Variables** → add `OPENAI_API_KEY` and `OPENAI_MODEL=gpt-4o`
   (do **not** set `PORT` — serverless ignores it).
4. Deploy → `*.vercel.app` URL. Pushes to `main` auto-deploy; PRs get previews.
5. To make it publicly reachable, **Settings → Deployment Protection → turn off
   "Require Log In" (Vercel Authentication)**. On a Pro team this is ON by
   default and gates every URL behind team login.

- **Redeploy/rollback:** Deployments tab → Promote/Redeploy any deployment.
- **Logs:** Vercel dashboard → the function's Runtime Logs.
- **Confirm live vs demo:** `GET /api/status` → `{"mode":"live"}`.
- **Note:** the browser compresses photos to ~1800px JPEG before upload, so
  requests stay well under Vercel's 4.5 MB body limit.
- **⚠️ Cost/exposure:** with protection off and no app login, anyone with the
  URL can spend your OpenAI credits — set a spend limit at
  platform.openai.com/settings/organization/limits.

### Render (Blueprint)

`render.yaml` defines a Docker web service with a `/health` check. Render →
**New → Blueprint** → point at the repo → set `OPENAI_API_KEY` as a secret.

## Prototype data behavior

- Job summaries and Job Mode state are stored in browser `localStorage`.
- Full-resolution photos are not written to disk by the Node starter.
- Saved history uses reduced-size image data and may be limited by browser storage quotas.
- Clearing browser storage removes local jobs.
- Evaluation JSON excludes direct customer/contact fields, service address, images, signature, and payment data; free-text task fields and model outputs should still be reviewed for identifiers before sharing.
- A production deployment still needs authentication, encrypted persistence, access controls, retention policies, consent language, audit controls, and legal/insurance review.

## Safety position

FixSight is a **visual triage, documentation, and communication layer**. It does not replace physical inspection, vehicle-specific service information, safe lifting/support procedures, calibrated tools, or qualified technician judgment. Every marker must be physically verified before action. Completion verification is a visual comparison, not proof of hidden condition, torque, pressure, electrical integrity, or roadworthiness.
