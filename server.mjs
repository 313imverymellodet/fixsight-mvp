import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnvFile(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);
// Bind to 0.0.0.0 by default so the server is reachable inside containers and
// behind the reverse proxies used by Render/Railway/Fly/Azure. Override with HOST.
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
// Default to a real, widely-available multimodal model that supports the
// Responses API with strict json_schema structured output. Override with
// OPENAI_MODEL. (The v0.3 handoff used the placeholder "gpt-5.6", which is not
// a live model and returns a 502 from the API — see README "Live vs demo mode".)
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const APP_VERSION = "0.3.0";
const MAX_BODY_BYTES = 38 * 1024 * 1024;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

const REPAIR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: {
      type: "string",
      enum: ["ready", "needs_more_photos", "stop_work"]
    },
    title: { type: "string" },
    vehicle_summary: { type: "string" },
    task_summary: { type: "string" },
    visible_findings: {
      type: "array",
      items: { type: "string" }
    },
    likely_issue: { type: "string" },
    confidence: {
      type: "integer",
      minimum: 0,
      maximum: 100
    },
    safety: {
      type: "object",
      additionalProperties: false,
      properties: {
        level: {
          type: "string",
          enum: ["green", "yellow", "red"]
        },
        headline: { type: "string" },
        reasons: {
          type: "array",
          items: { type: "string" }
        },
        required_action: { type: "string" }
      },
      required: ["level", "headline", "reasons", "required_action"]
    },
    repair_class: {
      type: "string",
      enum: [
        "inspection_only",
        "temporary_support",
        "temporary_repair",
        "permanent_repair",
        "professional_service"
      ]
    },
    estimated_time_minutes: {
      type: "object",
      additionalProperties: false,
      properties: {
        low: { type: "integer", minimum: 0 },
        high: { type: "integer", minimum: 0 }
      },
      required: ["low", "high"]
    },
    price_estimate: {
      type: "object",
      additionalProperties: false,
      properties: {
        currency: { type: "string" },
        low: { type: "number", minimum: 0 },
        high: { type: "number", minimum: 0 },
        recommended: { type: "number", minimum: 0 },
        assumptions: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: ["currency", "low", "high", "recommended", "assumptions"]
    },
    tools: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          required: { type: "boolean" },
          notes: { type: "string" }
        },
        required: ["name", "required", "notes"]
      }
    },
    fasteners: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          action: { type: "string", enum: ["loosen", "remove", "leave_alone", "inspect"] },
          tool_size: { type: "string" },
          tool_type: { type: "string" },
          detail: { type: "string" },
          caution: { type: "string" }
        },
        required: ["label", "action", "tool_size", "tool_type", "detail", "caution"]
      }
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          order: { type: "integer", minimum: 1 },
          title: { type: "string" },
          instruction: { type: "string" },
          checkpoint: { type: "string" }
        },
        required: ["order", "title", "instruction", "checkpoint"]
      }
    },
    warnings: {
      type: "array",
      items: { type: "string" }
    },
    annotations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          kind: {
            type: "string",
            enum: ["attach", "lift", "avoid", "inspect", "damaged", "remove", "support"]
          },
          x: { type: "integer", minimum: 0, maximum: 1000 },
          y: { type: "integer", minimum: 0, maximum: 1000 },
          label: { type: "string" },
          detail: { type: "string" },
          confidence: { type: "integer", minimum: 0, maximum: 100 }
        },
        required: ["id", "kind", "x", "y", "label", "detail", "confidence"]
      }
    },
    customer_note: { type: "string" },
    missing_information: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: [
    "status",
    "title",
    "vehicle_summary",
    "task_summary",
    "visible_findings",
    "likely_issue",
    "confidence",
    "safety",
    "repair_class",
    "estimated_time_minutes",
    "price_estimate",
    "tools",
    "fasteners",
    "steps",
    "warnings",
    "annotations",
    "customer_note",
    "missing_information"
  ]
};


const VERIFICATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: {
      type: "string",
      enum: ["likely_complete", "needs_attention", "cannot_verify", "unsafe"]
    },
    headline: { type: "string" },
    summary: { type: "string" },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    safety: {
      type: "object",
      additionalProperties: false,
      properties: {
        level: { type: "string", enum: ["green", "yellow", "red"] },
        release_recommendation: { type: "string" },
        reasons: { type: "array", items: { type: "string" } }
      },
      required: ["level", "release_recommendation", "reasons"]
    },
    visible_changes: {
      type: "array",
      items: { type: "string" }
    },
    checks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          status: { type: "string", enum: ["pass", "attention", "not_visible"] },
          detail: { type: "string" }
        },
        required: ["label", "status", "detail"]
      }
    },
    unresolved_items: {
      type: "array",
      items: { type: "string" }
    },
    annotations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["confirmed", "attention", "inspect"] },
          x: { type: "integer", minimum: 0, maximum: 1000 },
          y: { type: "integer", minimum: 0, maximum: 1000 },
          label: { type: "string" },
          detail: { type: "string" },
          confidence: { type: "integer", minimum: 0, maximum: 100 }
        },
        required: ["id", "kind", "x", "y", "label", "detail", "confidence"]
      }
    },
    customer_note: { type: "string" }
  },
  required: [
    "status",
    "headline",
    "summary",
    "confidence",
    "safety",
    "visible_changes",
    "checks",
    "unresolved_items",
    "annotations",
    "customer_note"
  ]
};

const VERIFICATION_SYSTEM_PROMPT = `You are FixSight Completion Verification, a cautious before-and-after visual comparison assistant for vehicle service documentation.

You receive a before image, an after image, the original visual guide, technician marker reviews, completed-step checks, manual safety checks, and a description of work performed.

Rules:
1. Compare only visible evidence. Never claim that hidden fasteners, torque, fluid levels, electrical measurements, diagnostic codes, programming, calibration, or internal component condition were verified from a photo.
2. A matching after angle improves confidence. If the after photo does not show a required area, use not_visible and status cannot_verify or needs_attention.
3. Technician marker corrections are human feedback. Respect them, but do not treat them as proof that work was completed.
4. If a critical hazard is visible or the repair appears incomplete in a way that could make operation dangerous, return status unsafe and red safety.
5. likely_complete means only that the visible completion evidence is consistent with the described work. It is not a certification of mechanical safety.
6. Put after-image annotation coordinates on the 1000 x 1000 normalized image plane. Use confirmed for visibly completed items, attention for visible concerns, and inspect when a required check cannot be established.
7. Customer notes must be factual, distinguish visual verification from physical verification, and preserve temporary-repair limitations.
8. Never invent torque specifications, scan-tool results, battery-monitor resets, pressure readings, test-drive results, or OEM procedures.`;

const SYSTEM_PROMPT = `You are FixSight Visual Triage, an image-based assistant for trained mechanics, mobile technicians, roadside operators, and informed DIY users.

Your job is to convert visible evidence in a vehicle photo plus the user's stated task into a cautious, structured visual guide. You are not a service manual and you must never present an uncertain visual guess as a verified repair point.

Core rules:
1. Describe only what is visible or clearly supported by the supplied vehicle/task information. Separate observations from likely interpretations.
2. Annotation coordinates use a 1000 x 1000 normalized image plane with (0,0) at the top-left. Place each point directly on the relevant component or hazard.
3. Mark a point as "attach" only when a factory hanger, bracket, or unquestionably structural mounting point is clearly visible. When uncertain, use "inspect" and request a closer photo.
4. For brakes, steering, airbags, fuel systems, high-voltage EV components, load-bearing suspension, wheel retention, active leaks near ignition sources, or any situation requiring someone beneath an inadequately supported vehicle: set safety.level to red and status to stop_work. Give only safe isolation/tow/professional-service guidance, not procedural repair steps.
5. Temporary supports must be labeled temporary. Never recommend attaching to brake lines, fuel lines, wiring, driveshafts, moving suspension, heat shields that cannot carry load, or hot/high-pressure components.
6. Price estimates are ballpark labor/service-call guidance only. State assumptions. Do not treat them as guaranteed local market pricing.
7. If the image is insufficient, return status needs_more_photos, list exactly what views are needed, and keep annotations limited to what is visible.
8. Keep steps concise, field-usable, and ordered. Every step needs a checkpoint that tells the technician what to verify before continuing.
9. Customer notes must clearly distinguish temporary stabilization from permanent repair.
10. Do not identify a vehicle solely from appearance when year/make/model are not provided.
11. When the task involves a specific fastener, terminal, clamp, bracket, or tool size, populate fasteners. Use "inspect" and say "verify size on vehicle" when a socket size is not visually or contextually reliable. Never invent torque specifications.
12. For 12V battery work, clearly separate REMOVAL order from INSTALL order: disconnect negative first for removal; reconnect positive first during installation. Treat sparks, heat, swelling, damaged cables, or reversed polarity as stop conditions.`;

const DEMO_ANALYSIS = {
  status: "ready",
  title: "Temporarily support the separated rear exhaust section",
  vehicle_summary: "2015 Chevrolet Equinox - rear underbody view",
  task_summary: "Raise the dragging rear resonator/exhaust section for temporary transport to an exhaust shop.",
  visible_findings: [
    "The exhaust pipe is visibly separated immediately ahead of the rear resonator section.",
    "The rear resonator and connected pipe are resting on or extremely close to the ground.",
    "A light-colored line is visible high on the right side and must not be used as a support point.",
    "The factory hanger location is not shown closely enough to verify its condition from this single photo."
  ],
  likely_issue: "Broken or rust-separated exhaust connection with loss of support at the rear resonator section.",
  confidence: 91,
  safety: {
    level: "yellow",
    headline: "Temporary stabilization only",
    reasons: [
      "The exhaust is heavy, sharp, and may still be hot.",
      "An incorrect attachment point could damage a brake/fuel line or wiring.",
      "The vehicle must not be entered underneath while supported only by a jack."
    ],
    required_action: "Cool the exhaust completely, use ramps or correctly placed jack stands if access is required, verify a factory hanger or structural crossmember, and drive only far enough for permanent exhaust repair."
  },
  repair_class: "temporary_support",
  estimated_time_minutes: {
    low: 15,
    high: 30
  },
  price_estimate: {
    currency: "USD",
    low: 40,
    high: 75,
    recommended: 50,
    assumptions: [
      "Local mobile-service call within a short travel radius",
      "No cutting, welding, or replacement parts",
      "Stainless cable ties or mechanic wire supplied by the technician",
      "Temporary support only; permanent exhaust repair billed separately"
    ]
  },
  tools: [
    {
      name: "Stainless-steel cable ties or mechanic wire",
      required: true,
      notes: "Use two independent supports when practical; do not use ordinary plastic ties on the exhaust."
    },
    {
      name: "Ramps or rated jack stands",
      required: true,
      notes: "Required whenever body placement under the vehicle is necessary. Never rely on a jack alone."
    },
    {
      name: "Gloves and eye protection",
      required: true,
      notes: "Rust flakes and cut metal-tie ends are sharp."
    },
    {
      name: "Metal snips or flush cutters",
      required: false,
      notes: "Trim and fold sharp tie tails away from moving parts and tires."
    }
  ],
  fasteners: [],
  steps: [
    {
      order: 1,
      title: "Cool and stabilize the vehicle",
      instruction: "Shut the vehicle off, allow the exhaust to cool fully, set the parking brake, chock a wheel, and use proper support equipment before reaching underneath.",
      checkpoint: "The exhaust is cool to the touch and the vehicle cannot roll or fall."
    },
    {
      order: 2,
      title: "Inspect the factory support area",
      instruction: "Locate the original rubber hanger and metal hanger rod above/behind the resonator. Confirm whether the rubber isolator, rod, or nearby pipe has failed.",
      checkpoint: "The chosen upper point is a verified factory hanger or structural crossmember, not a line, wire, heat shield, or suspension link."
    },
    {
      order: 3,
      title: "Lift the rear exhaust section",
      instruction: "Raise the resonator and attached rear pipe toward their normal position while keeping the separated front edge clear of the body and suspension.",
      checkpoint: "The assembly has several inches of ground clearance and does not press against moving or heat-sensitive components."
    },
    {
      order: 4,
      title: "Install two independent temporary supports",
      instruction: "Run stainless ties or mechanic wire through verified support points and around a factory hanger rod or a load-tolerant portion of the exhaust. Tighten each support evenly without crushing the pipe.",
      checkpoint: "Either support can prevent the assembly from returning to the ground if the other loosens."
    },
    {
      order: 5,
      title: "Clearance and movement check",
      instruction: "Fold or trim sharp tie tails. Shake the exhaust by hand and check clearance from the tire, axle, suspension, driveshaft, wiring, lines, and floor.",
      checkpoint: "Nothing contacts a moving component and the exhaust remains securely above the lowest underbody point."
    },
    {
      order: 6,
      title: "Document the temporary nature",
      instruction: "Tell the customer this only prevents dragging and does not seal the exhaust or restore the factory mounting system.",
      checkpoint: "The customer understands the vehicle needs prompt exhaust-shop repair and limited driving."
    }
  ],
  warnings: [
    "Do not use the light-colored line at the upper right as an anchor.",
    "Do not work under a vehicle supported only by a jack.",
    "Do not start or idle the vehicle while someone is underneath it.",
    "Stop and tow the vehicle if the exhaust cannot be kept clear of tires, suspension, the fuel system, or the road.",
    "Exhaust fumes may enter the cabin because the system is separated."
  ],
  annotations: [
    {
      id: "damage-1",
      kind: "damaged",
      x: 414,
      y: 520,
      label: "Separated exhaust joint",
      detail: "The forward pipe and rear resonator section are no longer connected.",
      confidence: 98
    },
    {
      id: "lift-1",
      kind: "lift",
      x: 494,
      y: 500,
      label: "Lift this rear section",
      detail: "Raise the resonator and attached rear pipe until they have safe road clearance.",
      confidence: 97
    },
    {
      id: "inspect-1",
      kind: "inspect",
      x: 474,
      y: 220,
      label: "Inspect for factory hanger",
      detail: "Confirm the original metal rod/rubber isolator or a structural mounting point before securing anything.",
      confidence: 66
    },
    {
      id: "avoid-1",
      kind: "avoid",
      x: 815,
      y: 83,
      label: "Do not attach to this line",
      detail: "Treat all visible lines and wiring as prohibited attachment points.",
      confidence: 93
    },
    {
      id: "support-1",
      kind: "support",
      x: 850,
      y: 455,
      label: "Add a second independent support",
      detail: "Use a separate verified point closer to the rear so one tie is not carrying the entire assembly.",
      confidence: 70
    }
  ],
  customer_note: "The rear exhaust/resonator assembly had separated and was dragging. I installed temporary metal supports to raise it off the road for limited transport. This does not reconnect or seal the exhaust and is not a permanent repair. The vehicle should be taken directly to an exhaust shop, and driving should stop if the assembly moves, contacts another component, or exhaust fumes enter the cabin.",
  missing_information: [
    "Close-up photo of the factory rubber exhaust hanger and hanger rod above the resonator",
    "Rear-side view showing the second hanger and tire/suspension clearance"
  ]
};

const BATTERY_DEMO_ANALYSIS = {
  status: "ready",
  title: "Replace the 12V battery and verify terminal order",
  vehicle_summary: "2016 Ford Flex SEL - engine bay battery view",
  task_summary: "Identify the battery terminals, hold-down, fasteners, tool sizes to verify, and safe removal/install order.",
  visible_findings: [
    "The positive terminal is under the red protective cover at the upper-left side of the battery.",
    "The negative terminal and battery-monitoring sensor assembly are visible at the opposite end of the battery.",
    "A transverse hold-down bar secures the battery in the tray.",
    "The positive terminal includes a power-distribution assembly with additional studs that should not be removed for a routine battery swap."
  ],
  likely_issue: "Routine 12V battery replacement with terminal and hold-down identification required.",
  confidence: 96,
  safety: {
    level: "yellow",
    headline: "Standard 12V battery precautions",
    reasons: [
      "A battery can arc if a tool bridges the positive terminal to chassis ground.",
      "A small brief spark on final negative connection can occur as vehicle modules wake, but sustained or heavy arcing is a stop condition.",
      "Battery acid, damaged cases, reversed polarity, heat, smoke, or swelling require stopping work."
    ],
    required_action: "Ignition off, key/fob away, accessories off, eye protection on, and verify polarity before removing or installing any cable."
  },
  repair_class: "permanent_repair",
  estimated_time_minutes: { low: 15, high: 30 },
  price_estimate: {
    currency: "USD",
    low: 50,
    high: 100,
    recommended: 75,
    assumptions: [
      "Battery supplied separately or billed as a part",
      "Mobile service within a short travel radius",
      "No seized terminal, damaged cable, or charging-system diagnosis",
      "Includes basic battery replacement and BMS reset/check when supported"
    ]
  },
  tools: [
    { name: "10 mm socket or wrench", required: true, notes: "Common size for Ford battery terminal clamp hardware; verify fit before turning." },
    { name: "8 mm / 10 mm / 13 mm sockets", required: false, notes: "Bring a small metric set for the hold-down because prior repairs may change hardware." },
    { name: "Ratchet and extension", required: true, notes: "Useful for the hold-down hardware and restricted access." },
    { name: "Eye protection and gloves", required: true, notes: "Protect against acid residue, corrosion, and accidental arcing." }
  ],
  fasteners: [
    { label: "Negative terminal clamp", action: "loosen", tool_size: "10 mm (verify)", tool_type: "socket or wrench", detail: "Loosen only enough to remove the negative clamp from the post. Disconnect this side first during removal.", caution: "Do not pry on or damage the battery-monitoring sensor/wiring attached to the negative cable." },
    { label: "Positive terminal clamp", action: "loosen", tool_size: "10 mm (verify)", tool_type: "socket or wrench", detail: "Loosen the clamp fastener that actually grips the positive battery post, then lift the complete terminal assembly off the post.", caution: "Leave the other power-distribution studs/nuts installed unless the service procedure specifically requires removal." },
    { label: "Battery hold-down", action: "remove", tool_size: "8-13 mm (verify)", tool_type: "socket + extension", detail: "Remove the fastener securing the transverse hold-down, then lift the hold-down clear before removing the battery.", caution: "Reinstall and tighten the hold-down before reconnecting the final terminal." },
    { label: "Power distribution studs", action: "leave_alone", tool_size: "N/A", tool_type: "none", detail: "These studs feed the positive distribution assembly and are not routine battery-removal fasteners.", caution: "Removing the wrong stud can disturb high-current electrical connections." }
  ],
  steps: [
    { order: 1, title: "Power the vehicle down", instruction: "Ignition off, key/fob away, lights and accessories off. Open the red positive cover only for identification at this stage.", checkpoint: "Nothing electrical is intentionally switched on and the battery polarity is confirmed." },
    { order: 2, title: "Disconnect negative first", instruction: "Loosen the negative terminal clamp and move the cable where it cannot spring back onto the post.", checkpoint: "Negative cable is fully isolated from the battery post." },
    { order: 3, title: "Disconnect positive", instruction: "Loosen the positive post clamp fastener, lift the terminal assembly from the post, and keep it from contacting grounded metal.", checkpoint: "Positive assembly is off the post and controlled." },
    { order: 4, title: "Remove the hold-down", instruction: "Remove the hold-down fastener/bar and note its orientation.", checkpoint: "Battery can lift vertically without the hold-down catching it." },
    { order: 5, title: "Swap the battery", instruction: "Lift the battery out upright, clean the tray/terminals as needed, and install the correct replacement in the same polarity orientation.", checkpoint: "Replacement battery sits flat, correct way around, with no trapped wiring." },
    { order: 6, title: "Secure the battery", instruction: "Reinstall the hold-down before reconnecting power.", checkpoint: "Battery cannot shift by hand." },
    { order: 7, title: "Reconnect positive first", instruction: "Seat and tighten the positive clamp. Refit the red protective cover.", checkpoint: "Positive terminal is fully seated, snug, and protected." },
    { order: 8, title: "Reconnect negative last", instruction: "Seat and tighten the negative clamp. A tiny one-time spark can occur as modules wake; stop for sustained/heavy arcing, heat, or smoke.", checkpoint: "Negative terminal is secure and there is no abnormal arcing or heating." },
    { order: 9, title: "Verify and reset", instruction: "Start the vehicle, verify normal charging/operation, and perform the Ford battery-monitoring-system reset with an appropriate scan tool or verified vehicle-specific procedure.", checkpoint: "Vehicle starts normally, warning lamps are reviewed, and battery replacement is documented." }
  ],
  warnings: [
    "Never place a metal tool across the positive terminal and chassis ground.",
    "Do not reverse polarity.",
    "Stop if the battery is swollen, leaking, unusually hot, smoking, or if arcing is sustained/heavy.",
    "Do not remove unrelated positive-distribution studs just to get the battery terminal off."
  ],
  annotations: [
    { id: "positive", kind: "remove", x: 285, y: 335, label: "Positive (+) under red cover", detail: "Disconnect second during removal; reconnect first during installation.", confidence: 99 },
    { id: "negative", kind: "remove", x: 265, y: 760, label: "Negative (-) terminal", detail: "Disconnect first during removal; reconnect last during installation.", confidence: 98 },
    { id: "hold-down", kind: "remove", x: 590, y: 585, label: "Battery hold-down", detail: "Remove after both battery cables are isolated; reinstall before final reconnection.", confidence: 96 },
    { id: "sensor", kind: "avoid", x: 365, y: 825, label: "Battery monitor sensor / wiring", detail: "Do not pry on or pull the sensor wiring while moving the negative cable.", confidence: 90 },
    { id: "positive-distribution", kind: "avoid", x: 475, y: 260, label: "Leave distribution studs alone", detail: "Routine battery replacement should use the post clamp fastener, not the surrounding distribution studs.", confidence: 88 }
  ],
  customer_note: "Replaced the 12V battery, secured the hold-down, reconnected positive first and negative last, and checked for abnormal arcing or heating. Battery-monitoring-system reset/verification should be completed with the appropriate vehicle-specific procedure or scan tool.",
  missing_information: []
};


const BATTERY_DEMO_VERIFICATION = {
  status: "likely_complete",
  headline: "Visible battery installation appears complete",
  summary: "The after view is consistent with a battery seated in the tray, the transverse hold-down installed, and both terminal assemblies positioned on their posts. This photo cannot confirm terminal torque, charging-system performance, battery specification, or the Ford battery-monitoring-system reset.",
  confidence: 88,
  safety: {
    level: "yellow",
    release_recommendation: "Complete a physical terminal/hold-down check, verify normal starting and charging behavior, and confirm the battery-monitor reset before customer handoff.",
    reasons: [
      "The visible installation is consistent with completion, but clamp tightness cannot be measured from an image.",
      "Programming/reset status and charging voltage are not visually verifiable."
    ]
  },
  visible_changes: [
    "The battery is seated in the tray in the expected orientation.",
    "The transverse battery hold-down is visible across the battery.",
    "The positive and negative terminal assemblies appear positioned on their respective posts."
  ],
  checks: [
    { label: "Battery seated", status: "pass", detail: "The battery appears flat and contained within the tray." },
    { label: "Hold-down installed", status: "pass", detail: "The transverse hold-down is visible across the battery." },
    { label: "Terminal placement", status: "pass", detail: "Both terminal assemblies appear seated; physical tightness still requires a hands-on check." },
    { label: "BMS reset / charging test", status: "not_visible", detail: "A photo cannot establish whether the reset or electrical verification was completed." }
  ],
  unresolved_items: [
    "Physically confirm both terminals cannot rotate by hand.",
    "Verify hold-down tightness and that the battery cannot shift.",
    "Confirm normal starting/charging and complete the vehicle-specific BMS reset or scan-tool verification."
  ],
  annotations: [
    { id: "after-positive", kind: "confirmed", x: 290, y: 335, label: "Positive terminal positioned", detail: "Positive assembly appears seated under the red cover; verify clamp tightness physically.", confidence: 93 },
    { id: "after-negative", kind: "confirmed", x: 265, y: 760, label: "Negative terminal positioned", detail: "Negative terminal and monitor assembly appear connected; verify no abnormal heat or movement.", confidence: 92 },
    { id: "after-hold-down", kind: "confirmed", x: 590, y: 585, label: "Hold-down installed", detail: "The battery restraint is visible across the case.", confidence: 95 },
    { id: "after-bms", kind: "inspect", x: 365, y: 825, label: "BMS reset not visible", detail: "Use the verified vehicle-specific procedure or compatible scan tool to confirm reset status.", confidence: 99 }
  ],
  customer_note: "The 12V battery installation is visually consistent with completion: the battery is seated, the hold-down is installed, and both terminal assemblies appear connected. A physical tightness check, normal start/charging verification, and the vehicle-specific battery-monitoring-system reset remain required because those items cannot be confirmed from a photo."
};

const EXHAUST_DEMO_VERIFICATION = {
  status: "unsafe",
  headline: "The exhaust still appears separated and too close to the ground",
  summary: "The supplied after view does not show a completed temporary support. The resonator/exhaust section still appears separated and at road-contact height, so the vehicle should not be released on the basis of this photo.",
  confidence: 96,
  safety: {
    level: "red",
    release_recommendation: "Do not drive. Reposition the vehicle safely, install or verify proper support without entering beneath a jack-only vehicle, and submit a clear after photo showing both supports and ground clearance.",
    reasons: [
      "The separated exhaust remains visibly low.",
      "No verified temporary supports are visible in the after view."
    ]
  },
  visible_changes: ["No reliable improvement can be established from the supplied comparison."],
  checks: [
    { label: "Ground clearance", status: "attention", detail: "The exhaust remains at or near the road surface." },
    { label: "Primary support", status: "not_visible", detail: "A verified support is not visible." },
    { label: "Second independent support", status: "not_visible", detail: "A backup support is not visible." },
    { label: "Clearance from lines and suspension", status: "not_visible", detail: "The required clearance cannot be confirmed from this angle." }
  ],
  unresolved_items: [
    "Show a side view with measurable ground clearance.",
    "Show close-ups of both temporary supports and their upper attachment points.",
    "Confirm the exhaust does not contact the tire, suspension, driveshaft, fuel system, wiring, or road."
  ],
  annotations: [
    { id: "after-low-exhaust", kind: "attention", x: 495, y: 505, label: "Still too low", detail: "The resonator/exhaust section appears at road-contact height.", confidence: 98 },
    { id: "after-support-missing", kind: "inspect", x: 490, y: 230, label: "Support not shown", detail: "Provide a close-up of the verified factory hanger or structural support point.", confidence: 82 }
  ],
  customer_note: "The completion photo does not verify a supported exhaust assembly. The separated section still appears too close to the ground and no verified temporary supports are visible. The vehicle should not be driven until the assembly is safely raised, both supports are physically checked, and clear after photos document ground and component clearance."
};

const server = http.createServer(async (req, res) => {
  try {
    setSecurityHeaders(res);
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (requestUrl.pathname === "/health" && (req.method === "GET" || req.method === "HEAD")) {
      return sendJson(res, 200, {
        ok: true,
        service: "fixsight",
        version: APP_VERSION
      });
    }

    if (requestUrl.pathname === "/api/status" && req.method === "GET") {
      return sendJson(res, 200, {
        apiConfigured: Boolean(OPENAI_API_KEY),
        model: OPENAI_MODEL,
        mode: OPENAI_API_KEY ? "live" : "demo"
      });
    }

    if (requestUrl.pathname === "/api/analyze" && req.method === "POST") {
      const raw = await readBody(req, MAX_BODY_BYTES);
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        return sendJson(res, 400, { error: "Request body must be valid JSON." });
      }
      const result = await handleAnalyze(payload);
      return sendJson(res, result.status, result.body);
    }

    if (requestUrl.pathname === "/api/verify" && req.method === "POST") {
      const raw = await readBody(req, MAX_BODY_BYTES);
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        return sendJson(res, 400, { error: "Request body must be valid JSON." });
      }
      const result = await handleVerify(payload);
      return sendJson(res, result.status, result.body);
    }

    if (requestUrl.pathname.startsWith("/api/")) {
      return sendJson(res, 404, { error: "API route not found." });
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return sendJson(res, 405, { error: "Method not allowed." });
    }

    return serveStatic(requestUrl.pathname, req.method === "HEAD", res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: "Unexpected server error." });
    } else {
      res.end();
    }
  }
});

// Only start the HTTP listener when run directly (node server.mjs). When this
// module is imported (e.g. by the Vercel serverless functions in /api that
// reuse handleAnalyze / handleVerify), importing must have no side effects.
const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  server.listen(PORT, HOST, () => {
    console.log(`FixSight ${APP_VERSION} listening on ${HOST}:${PORT}`);
    console.log(OPENAI_API_KEY ? `Live AI mode: ${OPENAI_MODEL}` : "Demo mode: add OPENAI_API_KEY to .env for live analysis");
  });
}

// --- Shared request handlers (used by the HTTP server above and the Vercel
// serverless functions in /api). Each returns { status, body } instead of
// touching the response directly, so the same logic serves both hosts. ---

export function getStatus({ apiKey = OPENAI_API_KEY, model = OPENAI_MODEL } = {}) {
  return {
    apiConfigured: Boolean(apiKey),
    model,
    mode: apiKey ? "live" : "demo"
  };
}

export async function handleAnalyze(payload, { apiKey = OPENAI_API_KEY, model = OPENAI_MODEL } = {}) {
  const validationError = validateAnalyzePayload(payload);
  if (validationError) return { status: 400, body: { error: validationError } };

  if (!apiKey) {
    return {
      status: 200,
      body: { analysis: selectDemoAnalysis(payload), demo_mode: true, model: "built-in demo", response_id: null }
    };
  }

  const requestBody = {
    model,
    input: [
      { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
      {
        role: "user",
        content: [
          { type: "input_text", text: buildUserPrompt(payload) },
          { type: "input_image", image_url: payload.imageDataUrl, detail: "high" }
        ]
      }
    ],
    text: {
      format: { type: "json_schema", name: "fixsight_repair_visual_guide", strict: true, schema: REPAIR_SCHEMA }
    },
    max_output_tokens: 5000
  };

  let openaiResponse, openaiPayload;
  try {
    ({ response: openaiResponse, payload: openaiPayload } = await callOpenAI(apiKey, requestBody));
  } catch (error) {
    console.error("OpenAI analyze request failed:", error?.message || error);
    return { status: 502, body: { error: "The AI analysis service is unavailable. Please try again." } };
  }

  if (!openaiResponse.ok) {
    return { status: 502, body: { error: openaiPayload?.error?.message || "The AI analysis request failed." } };
  }
  const refusal = extractRefusal(openaiPayload);
  if (refusal) return { status: 422, body: { error: refusal } };
  const outputText = extractOutputText(openaiPayload);
  if (!outputText) return { status: 502, body: { error: "The model returned no structured analysis." } };

  let analysis;
  try {
    analysis = JSON.parse(outputText);
  } catch {
    return { status: 502, body: { error: "The model response could not be parsed as JSON." } };
  }

  return {
    status: 200,
    body: { analysis, demo_mode: false, model, response_id: openaiPayload.id || null }
  };
}

export async function handleVerify(payload, { apiKey = OPENAI_API_KEY, model = OPENAI_MODEL } = {}) {
  const validationError = validateVerificationPayload(payload);
  if (validationError) return { status: 400, body: { error: validationError } };

  if (!apiKey) {
    return {
      status: 200,
      body: { verification: selectDemoVerification(payload), demo_mode: true, model: "built-in demo", response_id: null }
    };
  }

  const requestBody = {
    model,
    input: [
      { role: "system", content: [{ type: "input_text", text: VERIFICATION_SYSTEM_PROMPT }] },
      {
        role: "user",
        content: [
          { type: "input_text", text: buildVerificationPrompt(payload) },
          { type: "input_image", image_url: payload.beforeImageDataUrl, detail: "high" },
          { type: "input_image", image_url: payload.afterImageDataUrl, detail: "high" }
        ]
      }
    ],
    text: {
      format: { type: "json_schema", name: "fixsight_completion_verification", strict: true, schema: VERIFICATION_SCHEMA }
    },
    max_output_tokens: 4200
  };

  let openaiResponse, openaiPayload;
  try {
    ({ response: openaiResponse, payload: openaiPayload } = await callOpenAI(apiKey, requestBody));
  } catch (error) {
    console.error("OpenAI verify request failed:", error?.message || error);
    return { status: 502, body: { error: "The completion verification service is unavailable. Please try again." } };
  }

  if (!openaiResponse.ok) {
    return { status: 502, body: { error: openaiPayload?.error?.message || "The completion verification request failed." } };
  }
  const refusal = extractRefusal(openaiPayload);
  if (refusal) return { status: 422, body: { error: refusal } };
  const outputText = extractOutputText(openaiPayload);
  if (!outputText) return { status: 502, body: { error: "The model returned no structured verification." } };

  let verification;
  try {
    verification = JSON.parse(outputText);
  } catch {
    return { status: 502, body: { error: "The model verification could not be parsed as JSON." } };
  }

  return {
    status: 200,
    body: { verification, demo_mode: false, model, response_id: openaiPayload.id || null }
  };
}

// Call the OpenAI Responses API with a short retry on transient failures
// (429 / 5xx / network errors). The API occasionally returns a 502 with a
// request id that succeeds immediately on retry.
async function callOpenAI(apiKey, requestBody, { retries = 2 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(requestBody)
      });
      const payload = await response.json().catch(() => ({}));
      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        await sleep(700 * (attempt + 1));
        continue;
      }
      return { response, payload };
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(700 * (attempt + 1));
        continue;
      }
    }
  }
  throw lastError || new Error("OpenAI request failed after retries.");
}

function selectDemoAnalysis(payload) {
  const text = `${payload.year || ""} ${payload.make || ""} ${payload.model || ""} ${payload.concern || ""} ${payload.quickQuestion || ""}`.toLowerCase();
  if (text.includes("ford") && text.includes("flex") && text.includes("battery")) return BATTERY_DEMO_ANALYSIS;
  if (text.includes("battery") || text.includes("positive") || text.includes("negative")) return BATTERY_DEMO_ANALYSIS;
  return DEMO_ANALYSIS;
}


function selectDemoVerification(payload) {
  const text = `${payload?.vehicle?.display || ""} ${payload?.initialAnalysis?.title || ""} ${payload?.servicePerformed || ""}`.toLowerCase();
  if (text.includes("battery") || (text.includes("ford") && text.includes("flex"))) return BATTERY_DEMO_VERIFICATION;
  return EXHAUST_DEMO_VERIFICATION;
}

function buildVerificationPrompt(payload) {
  const initial = JSON.stringify(payload.initialAnalysis || {}).slice(0, 18000);
  const markerReviews = JSON.stringify(payload.markerReviews || {}).slice(0, 10000);
  const stepChecks = JSON.stringify(payload.stepChecks || {}).slice(0, 6000);
  const manualChecks = JSON.stringify(payload.manualChecks || {}).slice(0, 3000);
  return `Compare image 1 (before) with image 2 (after) and create the completion-verification object required by the schema.

Vehicle: ${payload?.vehicle?.display || "Not provided"}
Work reportedly performed: ${payload.servicePerformed || "Not provided"}
Original visual guide: ${initial}
Technician marker reviews: ${markerReviews}
Procedure step checks: ${stepChecks}
Manual completion checks: ${manualChecks}

Treat technician checks as reported workflow data, not visual proof. State exactly what the after photo supports, what remains unverified, and whether another photo or physical check is required.`;
}

function validateVerificationPayload(payload) {
  if (!payload || typeof payload !== "object") return "Missing verification payload.";
  if (typeof payload.servicePerformed !== "string" || payload.servicePerformed.trim().length < 5) {
    return "Describe the work performed in at least 5 characters.";
  }
  for (const [label, value] of [["Before image", payload.beforeImageDataUrl], ["After image", payload.afterImageDataUrl]]) {
    if (typeof value !== "string" || !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value)) {
      return `${label} must be a JPEG, PNG, or WebP data URL.`;
    }
    if (value.length > 17_500_000) return `${label} is too large. Use a smaller or compressed image.`;
  }
  if (!payload.initialAnalysis || typeof payload.initialAnalysis !== "object") return "The original analysis is required.";
  return null;
}

function buildUserPrompt(payload) {
  const vehicle = [payload.year, payload.make, payload.model, payload.engine]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

  return `Create a visual triage guide for this job.

Vehicle supplied by user: ${vehicle || "Not provided"}
Market / service area: ${payload.market || "Not provided"}
Service context: ${payload.serviceContext || "Not provided"}
Task mode: ${payload.taskMode || "Not provided"}
Requested task: ${payload.concern}
Technician note: ${payload.technicianNote || "None"}
Quick field question: ${payload.quickQuestion || "None"}

Return the structured result required by the schema. Keep annotation points directly on visible objects. If a safe attachment point is not unquestionably visible, mark the area as inspect rather than attach and request a closer photo.`;
}

function validateAnalyzePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Missing analysis payload.";
  }
  if (typeof payload.concern !== "string" || payload.concern.trim().length < 8) {
    return "Describe the problem or requested task in at least 8 characters.";
  }
  if (typeof payload.imageDataUrl !== "string") {
    return "An image is required.";
  }
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(payload.imageDataUrl)) {
    return "Image must be a JPEG, PNG, or WebP data URL.";
  }
  if (payload.imageDataUrl.length > 17_500_000) {
    return "Image is too large. Use a smaller or compressed photo.";
  }
  return null;
}

function extractOutputText(payload) {
  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }
  for (const item of payload.output || []) {
    for (const part of item.content || []) {
      if (part.type === "output_text" && typeof part.text === "string") {
        return part.text;
      }
    }
  }
  return "";
}

function extractRefusal(payload) {
  for (const item of payload.output || []) {
    for (const part of item.content || []) {
      if (part.type === "refusal" && typeof part.refusal === "string") {
        return part.refusal;
      }
    }
  }
  return "";
}

async function serveStatic(pathname, isHead, res) {
  const decoded = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const relativePath = decoded.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(PUBLIC_DIR, relativePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendJson(res, 403, { error: "Forbidden." });
  }

  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) {
      return sendJson(res, 404, { error: "Not found." });
    }
    const ext = path.extname(filePath).toLowerCase();
    res.statusCode = 200;
    res.setHeader("Content-Type", CONTENT_TYPES[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", ext === ".html" ? "no-cache" : "public, max-age=3600");
    res.setHeader("Content-Length", stat.size);
    if (isHead) {
      return res.end();
    }
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return sendJson(res, 404, { error: "Not found." });
    }
    throw error;
  }
}

function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  );
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.end(body);
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function loadEnvFile(envPath) {
  try {
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    console.warn("Could not load .env file:", error.message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
