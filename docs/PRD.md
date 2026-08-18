# FixSight Product Requirements Document — v0.3

## Product statement

FixSight converts real repair photos into human-verifiable visual guides and carries a field job from intake through documented customer handoff.

**Core workflow:**

**Intake → before-photo analysis → annotated guide → technician review → after-photo verification → invoice/signature → report**

## Problem

Mechanics and roadside technicians often receive vague, urgent questions:

- “What is hanging?”
- “Which nut do I loosen?”
- “What socket should I try?”
- “Which cable goes on first?”
- “Can I temporarily secure this?”
- “How do I explain this to the customer?”
- “What should I charge?”

Text-only guidance makes the technician translate advice back onto the physical vehicle. Generic AI answers can also hide uncertainty and fail to preserve what was actually verified.

FixSight makes the real photo the shared working surface, requires human review of every marker, and turns the completed job into a traceable before/after service record.

## Target users

### Primary

- solo mobile mechanics
- roadside-assistance operators
- small independent repair shops
- fleet maintenance technicians

### Secondary

- apprentices under supervision
- service advisors
- field inspectors
- informed DIY users performing low-risk inspection

## Jobs to be done

1. Identify visible parts and areas of concern on my photo.
2. Show where to inspect, lift, support, remove, or avoid.
3. Answer a narrow mid-job question without forcing a full diagnostic workflow.
4. Distinguish visible evidence from likely interpretation.
5. Tell me whether the job is temporary, permanent, needs more evidence, or must stop.
6. Let me verify or correct every AI marker.
7. Preserve before/after evidence and unresolved conditions.
8. Create a clean price and customer handoff record.
9. Export evaluation evidence so the product can improve safely.

## v0.3 scope

### Intake

- business/shop and technician
- customer name, phone, email, and service address
- vehicle year, make, model, engine, VIN/plate, and odometer
- service area and context
- task mode
- free-text concern
- technician note
- quick field question
- before-photo upload
- safety acknowledgment

### Visual guide

- visible findings
- likely issue and confidence
- Ready / More Photos Needed / Stop Work
- Green / Yellow / Red safety level
- repair class
- time and price guidance
- tools and warnings
- fastener map
- ordered field steps and checkpoints
- image markers
- customer-ready note
- downloadable marked image

### Technician Review Mode

- marker states: Unreviewed, Verified, Incorrect, Need photo
- note field for incorrect or missing-evidence cases
- coordinate repositioning on the original image
- step completion and checkpoint confirmation
- progress and unresolved-count UI
- event log and privacy-conscious evaluation export

### Completion verification

- after-photo upload
- before/after comparison
- work-performed description
- four manual completion checks
- visual comparison endpoint
- Likely complete / Needs attention / Cannot verify / Unsafe
- visible changes, itemized checks, unresolved items, and after-photo markers
- Unsafe closeout block

### Closeout

- invoice number/date
- service call, labor, parts, materials, discount, tax, amount paid
- payment status and method
- limitations, warranty, referral, and next steps
- customer/authorized signer name and signature
- customer acknowledgment
- technician sign-off
- live service-report preview
- print/save PDF
- standalone HTML download
- copyable summary
- browser-only history and restore

## Explicitly excluded from the prototype

- authentication and multi-user organizations
- cloud database/file storage
- payment processing
- parts ordering
- insurance estimates
- tax/accounting compliance
- automatic repair approval
- roadworthiness certification
- licensed OEM service-information retrieval
- model-generated torque, capacity, pressure, or wiring specifications
- remote control of tools or vehicles

## Golden workflows

### 1. 2015 Chevrolet Equinox exhaust

**Visible issue:** Rear resonator/exhaust assembly separated and dragging.

**Expected guide behavior:**

- identify visible separation
- mark the assembly to lift
- mark lines/moving components to avoid
- request physical verification of any upper support point
- recommend redundant temporary support only when appropriate
- label the action temporary
- provide customer-facing limitations

**Expected completion behavior:**

A same-angle photo still showing the component at road-contact height returns Unsafe or Cannot verify, not approval.

### 2. 2016 Ford Flex SEL battery

**Requested task:** Replace the 12V battery and answer fastener/tool/order questions.

**Expected guide behavior:**

- distinguish positive and negative terminals
- identify the hold-down
- distinguish battery clamp fasteners from power-distribution studs
- show removal and installation order separately
- treat exact socket sizes as field checks unless proven
- preserve electrical safety warnings

**Expected completion behavior:**

The after photo can visually support terminal orientation and hold-down presence, while torque, charging behavior, and BMS reset remain physical/procedural checks.

## Functional requirements

### FR-1: Image preparation

- Accept JPEG, PNG, and WebP.
- Reject unsupported types and oversized files.
- Compress before transmission.
- Keep overlay coordinates aligned with the displayed image.

### FR-2: Structured analysis

- Use a strict schema.
- Require all safety, tool, fastener, step, pricing, and annotation fields.
- Return calibrated confidence and missing-information requests.

### FR-3: Human verification

- Do not allow completion verification while markers remain unreviewed.
- Preserve rejected markers and corrections.
- Do not relabel a corrected marker as verified automatically.

### FR-4: Completion comparison

- Send both before and after images in one verification request.
- Require a work-performed description.
- Return a bounded verification status and unresolved items.
- Never use image evidence to claim hidden/measured facts.

### FR-5: Closeout gating

A job cannot close until:

- all markers are reviewed
- completion verification has run
- result is not Unsafe
- all four manual checks are complete
- service description is present
- signer name and signature are present
- customer acknowledgment is checked
- technician sign-off is checked
- Paid status does not conflict with a remaining balance

`needs_attention` and `cannot_verify` close as Completed with attention.

### FR-6: Export and persistence

- Save active/recent job summaries in the browser.
- Restore saved jobs.
- Export annotated image, report, service summary, and evaluation JSON.
- Exclude direct customer data and image/signature/payment data from evaluation export.

## Safety requirements

1. Observation and interpretation must remain separate.
2. Uncertain support/lift/attachment points must be Inspect.
3. Critical systems and active hazards must default to Stop Work.
4. Temporary work must be labeled temporary.
5. Physical verification is mandatory for every marker.
6. Before/after comparison must state what the image cannot prove.
7. Unsafe completion results cannot be overridden by the prototype UI.
8. The service report must preserve limitations and unresolved items.

## Product-quality metrics

- marker verification rate
- marker correction rate and average correction distance
- Need photo rate
- annotation-type accuracy
- fastener-action accuracy
- safety false-negative rate
- completion-verification disagreement rate
- unresolved-item rate
- time to review all markers
- percentage of jobs reaching report export
- customer-note/report usage

## Business hypotheses

### Solo

Target: approximately $19/month for higher guide limits, saved cloud jobs, branding, and labor settings.

### Mobile Pro

Target: approximately $39/month for before/after reports, travel fees, customer delivery, material tracking, and payment integrations.

### Shop

Target: approximately $129–$299/month for technician seats, approvals, audit logs, shared jobs, evaluation dashboards, and branded reports.

These are hypotheses to validate, not committed pricing.

## Roadmap

### Phase 1 — Controlled pilot

- run v0.3 with 10–20 real jobs
- collect marker review and correction data
- score safety and completion calibration
- interview mobile mechanics about closeout/report value

### Phase 2 — Private beta

- authentication and organizations
- Postgres/Supabase job records
- secure object storage
- multiple before and after photos
- explicit requested-photo workflow
- shop labor/travel settings
- branded customer delivery
- category-specific prompts and evaluation sets

### Phase 3 — Commercial pilot

- roles and supervisor approval
- customer SMS/email delivery
- payment provider integration
- service-information links
- parts/labor integrations
- evaluation dashboard and release gates
- incident reporting and audit controls

## Open questions

- Which paid value is strongest: guidance, documentation, quoting, or customer communication?
- How often will technicians correct markers rather than abandon the guide?
- Which visual categories produce repeat weekly usage?
- Should new users default to a more conservative Inspect-only mode?
- Which jobs require supervisor approval before customer release?
- What licensed service-information source can support exact specifications?
- What legal, insurance, tax, privacy, and electronic-signature structure is required by market?
