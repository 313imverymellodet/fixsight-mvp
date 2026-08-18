# FixSight Job Mode

Job Mode turns the original photo-markup prototype into a full field workflow:

**Intake → Guide → Technician review → After verification → Closeout**

## 1. Intake

The technician records business, customer, vehicle, and service details, selects a task mode, uploads a before photo, describes the work, and asks an optional narrow field question.

A new before photo starts a new active job. Recent completed or in-progress jobs remain available in browser history.

## 2. AI visual guide

`POST /api/analyze` returns a strict structured response with:

- visible evidence and likely interpretation
- overall confidence
- safety level and required action
- repair classification
- interactive image annotations
- fastener/tool guidance
- ordered steps and checkpoints
- tools, warnings, missing information, time, price guidance, and customer note

The UI overlays markers on the original photo rather than creating a replacement image.

## 3. Technician marker review

Every annotation begins as `unreviewed`. The technician must choose one of three states:

### Verified

The marker and description match the physical vehicle.

### Incorrect

The marker or description is wrong. The technician can add a note and tap the correct point on the image. FixSight records the original and corrected normalized coordinates.

### Need photo

The current view cannot safely verify the marker. The technician records the required angle or close-up.

The review meter must reach 100% before completion verification can run. Incorrect and Need photo states remain visible as unresolved context; they are not silently treated as approval.

## 4. Step checks

Each field step includes a technician checkbox: **Step completed and checkpoint verified**. These checks are stored in the job snapshot and evaluation export.

They are supporting evidence, not a substitute for the four final manual checks.

## 5. After-photo verification

The technician uploads an after photo and describes the work performed. FixSight sends:

- original analysis
- technician marker reviews
- step checks
- manual checks
- before photo
- after photo
- work-performed description
- vehicle context

to `POST /api/verify`.

The verification response can be:

- `likely_complete`
- `needs_attention`
- `cannot_verify`
- `unsafe`

The response includes visible changes, itemized checks, unresolved items, safety guidance, and optional markers on the after photo.

An `unsafe` result blocks job completion. `needs_attention` and `cannot_verify` can be documented and closed only as **Completed with attention**, preserving the unresolved condition in the report.

## 6. Manual completion checks

The technician confirms:

1. The work area is clear of tools and loose parts.
2. Visible hardware, terminals, or supports are secured.
3. No visible leak, smoke, abnormal heat, or active hazard is present.
4. Limitations and next steps were explained to the customer.

All four are required for closeout.

## 7. Invoice and payment handoff

The closeout form supports:

- service-call charge
- labor hours and rate
- parts and materials
- discount
- tax rate
- amount paid
- payment status and method
- limitations, warranty language, referral, or next steps

FixSight calculates subtotal components, tax, total, paid amount, and balance. Selecting Paid automatically fills the amount paid when it is still zero. A job cannot close when payment status says Paid but a positive balance remains.

This is a prototype invoice builder, not jurisdiction-specific tax or accounting software.

## 8. Signature and sign-off

The customer or authorized signer signs directly in the browser using a finger, stylus, or mouse. Closeout requires:

- signer name
- captured signature
- customer acknowledgment
- technician sign-off

The signature is stored only in the browser prototype and is embedded in the printable/downloadable report.

## 9. Service report

The live preview includes:

- business, invoice, date, customer, vehicle, technician, and service location
- work performed
- before and after photos
- marker-review totals
- completion-verification status
- limitations and next steps
- charges, total, payment, and balance
- acknowledgment, technician sign-off, and signature
- visual-triage disclaimer

The report can be printed/saved as PDF, downloaded as a standalone HTML file, or summarized to the clipboard.

## 10. Persistence

The active job and recent jobs are stored in browser `localStorage`. This is suitable for a local prototype, not production records. A production build should move job state to an authenticated backend with encryption, tenant isolation, retention policies, and audit logs.
