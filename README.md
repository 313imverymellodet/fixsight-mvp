# FixSight MVP v0.3 — Job Mode

**See the job. Mark the fix. Verify the work. Close it out.**

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
OPENAI_MODEL=gpt-5.6
PORT=3000
```

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

- `server.mjs` — static server, demo data, `/api/status`, `/api/analyze`, `/api/verify`, prompts, schemas, and live API calls
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

## Prototype data behavior

- Job summaries and Job Mode state are stored in browser `localStorage`.
- Full-resolution photos are not written to disk by the Node starter.
- Saved history uses reduced-size image data and may be limited by browser storage quotas.
- Clearing browser storage removes local jobs.
- Evaluation JSON excludes direct customer/contact fields, service address, images, signature, and payment data; free-text task fields and model outputs should still be reviewed for identifiers before sharing.
- A production deployment still needs authentication, encrypted persistence, access controls, retention policies, consent language, audit controls, and legal/insurance review.

## Safety position

FixSight is a **visual triage, documentation, and communication layer**. It does not replace physical inspection, vehicle-specific service information, safe lifting/support procedures, calibrated tools, or qualified technician judgment. Every marker must be physically verified before action. Completion verification is a visual comparison, not proof of hidden condition, torque, pressure, electrical integrity, or roadworthiness.
