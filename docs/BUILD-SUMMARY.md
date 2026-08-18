# FixSight v0.3 Build Summary

## Product

FixSight is a visual field assistant for mechanics, mobile technicians, roadside operators, fleet teams, and service advisors.

**v0.3 workflow:**

**Before photo → visual guide → technician marker review → work steps → after photo → completion check → invoice → signature → service report**

## Implemented in this build

### Core visual assistant

- Responsive, mobile-first single-page app
- Browser-side image compression
- Demo and live AI modes
- Strict JSON-schema response contracts
- Interactive normalized-coordinate marker overlay
- Visible findings separated from likely interpretation
- Safety classification and stop-work behavior
- Repair class, steps, checkpoints, tools, warnings, time, and suggested charge
- Fastener map with Loosen, Remove, Inspect, and Leave Alone states
- Downloadable annotated PNG and printable visual guide

### Job Mode

- Five-stage progress navigation
- Business/customer/vehicle job record
- Required technician review of every AI marker
- Verified, Incorrect, and Need photo states
- On-photo marker repositioning
- Technician notes and review progress
- Step-completion checkboxes
- Evaluation event log and privacy-conscious JSON export

### Completion verification

- Before/after comparison workspace
- Work-performed description
- Four manual technician checks
- `/api/verify` endpoint using two image inputs in live mode
- Likely complete, Needs attention, Cannot verify, and Unsafe results
- After-photo annotations and unresolved-item list
- Unsafe-result closeout block

### Business closeout

- Invoice number/date
- Service call, labor, parts, materials, discount, tax, paid amount, and balance
- Payment status and method
- Customer-facing work description and limitations
- Customer signature pad
- Customer acknowledgment and technician sign-off
- Closeout gate for required review and handoff fields
- Live report preview
- Print / Save PDF, standalone HTML download, and copied service summary
- Browser-only active job and recent-job restoration

### Test coverage

- JavaScript syntax validation
- Demo server startup
- `/api/status`
- `/api/analyze`
- `/api/verify`
- homepage workflow sections
- Job Mode asset delivery

Run all included checks with:

```bash
npm run validate
```

## Golden field workflows

### 2015 Chevrolet Equinox exhaust

Tests temporary roadside stabilization, support/avoid markers, cautious pricing, and an unsafe completion result when the same dragging condition remains visible.

### 2016 Ford Flex SEL battery

Tests terminal and hold-down identification, fastener mapping, field tool guidance, disconnect/reconnect order, and cautious completion verification that still preserves physical checks such as torque and BMS reset.

## Current prototype boundary

- No authentication or organizations
- No cloud database or file storage
- No payment processing
- No licensed service-information integration
- No automatic parts ordering
- No guarantee of repair correctness or roadworthiness
- No jurisdiction-specific invoice/tax compliance

The build is ready for a controlled pilot and technician evaluation, not unsupervised public release.
