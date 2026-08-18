# FixSight AI Response Contracts

FixSight uses two strict structured-output contracts:

1. `fixsight_repair_visual_guide` for the before-photo analysis.
2. `fixsight_completion_verification` for the before/after comparison.

Both contracts use normalized image coordinates so the browser can place interactive markers on the exact uploaded image.

## Coordinate system

- Image plane: 1000 × 1000 normalized units
- Origin: top-left
- `x = 0`, `y = 0`: top-left corner
- `x = 1000`, `y = 1000`: bottom-right corner

The browser converts coordinates to percentages. Coordinates identify a visual target, not a guaranteed safe physical location.

# Contract 1: Repair visual guide

## Top-level fields

- `status`: `ready`, `needs_more_photos`, or `stop_work`
- `title`
- `vehicle_summary`
- `task_summary`
- `visible_findings[]`
- `likely_issue`
- `confidence`: 0–100
- `safety`
  - `level`: `green`, `yellow`, or `red`
  - `headline`
  - `reasons[]`
  - `required_action`
- `repair_class`
  - `inspection_only`
  - `temporary_support`
  - `temporary_repair`
  - `permanent_repair`
  - `professional_service`
- `estimated_time_minutes`: low/high
- `price_estimate`: currency, low, high, recommended, assumptions
- `tools[]`: name, required, notes
- `fasteners[]`: label, action, tool size/type, detail, caution
- `steps[]`: order, title, instruction, checkpoint
- `warnings[]`
- `annotations[]`
- `customer_note`
- `missing_information[]`

## Repair annotation types

- `attach` — a clearly visible factory hanger/bracket or structural candidate that still requires physical verification
- `lift` — the component/assembly to raise
- `support` — an assembly or area needing support
- `inspect` — uncertain item, fastener, line, mount, or requested close-up
- `avoid` — prohibited line, wire, moving part, heat source, terminal, or mounting point
- `damaged` — visible break, separation, crack, leak origin, or failed component
- `remove` — component the requested task may remove when the visual evidence and safety context support it

A weak attachment candidate must be `inspect`, not `attach`.

## Fastener actions

- `loosen`
- `remove`
- `leave_alone`
- `inspect`

Exact tool sizes must be framed as a field check unless vehicle-specific service information or an unmistakable fastener head proves the specification.

## Stop-work behavior

When `status` is `stop_work`:

- `safety.level` must be `red`.
- Steps must focus on shutdown, isolation, leaving the hazard area, towing, or qualified professional inspection.
- The response must not provide a detailed critical-system repair procedure.
- Pricing may cover inspection, service call, or tow coordination, not a photo-approved repair.

# Contract 2: Completion verification

The verification endpoint compares the before and after photos while considering the original guide and technician-entered work context.

## Top-level fields

- `status`
  - `likely_complete`
  - `needs_attention`
  - `cannot_verify`
  - `unsafe`
- `headline`
- `summary`
- `confidence`: 0–100
- `safety`
  - `level`: `green`, `yellow`, or `red`
  - `headline`
  - `reasons[]`
  - `release_recommendation`
- `visible_changes[]`
- `checks[]`
  - `label`
  - `status`: `pass`, `attention`, or `not_visible`
  - `detail`
- `unresolved_items[]`
- `annotations[]`
- `customer_note`

## After-photo annotation types

- `confirmed` — visible evidence supporting the completion claim
- `attention` — visible concern or unresolved condition
- `inspect` — required physical check or missing view

## Verification limits

The model must not claim that an image proves:

- torque
- internal electrical integrity
- pressure
- fluid level outside a readable indicator
- hidden fastener engagement
- under-load behavior
- roadworthiness
- absence of hidden leaks or damage

When a completion claim depends on those facts, the response must state the physical check or additional evidence required.

## Human-review layer

The AI response is not the final approval record. The browser adds:

- marker review states
- corrected coordinates
- technician notes
- step checks
- manual completion checks
- signature and sign-offs

Those fields belong to the Job Mode snapshot and evaluation export, not the model contract.
