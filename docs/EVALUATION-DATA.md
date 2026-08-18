# FixSight Evaluation Data

FixSight v0.3 records technician interaction as product-quality evidence. The goal is to measure whether the visual guide was useful and safe, not merely whether it looked convincing.

## Export

The **Export evaluation JSON** action creates `fixsight-evaluation-v1` with:

- export timestamp and job ID
- non-customer vehicle/task context
- model name and response ID when available
- original structured analysis
- every marker review
- original and corrected coordinates
- rejection or requested-photo notes
- step checks
- completion verification
- completion model metadata
- chronological evaluation events

## Marker-review record

Each marker can include:

```json
{
  "annotationId": "positive-terminal",
  "label": "Positive terminal",
  "kind": "inspect",
  "status": "incorrect",
  "note": "Marker should be centered on the clamp nut.",
  "originalX": 311,
  "originalY": 417,
  "correctedX": 345,
  "correctedY": 395,
  "updatedAt": "2026-08-16T...Z"
}
```

Coordinates use a normalized 1000 × 1000 image plane.

## Event examples

- `marker_review`
- `marker_reposition`
- `step_check`
- `after_photo_added`
- `manual_check`
- `completion_verification`
- `customer_signature`
- `job_completed`

Events include timestamps, job ID, originating analysis response ID when available, and event-specific details.

## Privacy boundary

The evaluation export intentionally excludes:

- customer name
- customer phone and email
- service address
- before/after image data
- customer signature
- invoice payment details

Direct customer fields and media are excluded, but free-text task fields and model outputs may still contain identifiers entered by the technician. Review exports before sharing. Production implementations should add automated redaction where practical and apply data minimization, consent, deletion, access control, and retention rules at the backend.

## Suggested quality metrics

- marker verification rate
- marker rejection rate
- coordinate correction distance
- Need photo rate
- annotation-type accuracy
- step completion rate
- completion-verification disagreement rate
- unsafe false-negative rate
- unresolved-item rate at closeout
- time from analysis to technician review
- report/export usage

Safety failures must be reviewed separately from general quality. A high overall accuracy rate cannot offset a dangerous missed condition.
