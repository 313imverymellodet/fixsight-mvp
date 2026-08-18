"use strict";

const HISTORY_KEY = "fixsight_jobs_v1";
const MAX_HISTORY = 12;
const KIND_COLORS = {
  attach: "#37d99a",
  support: "#37d99a",
  lift: "#59a8ff",
  avoid: "#ff6d6d",
  damaged: "#ff6d6d",
  inspect: "#f6c94c",
  remove: "#ae86ff"
};

const state = {
  imageDataUrl: "",
  thumbnailDataUrl: "",
  imageName: "",
  analysis: null,
  demoMode: false,
  markersVisible: true,
  serverMode: "unknown",
  activeAnnotation: -1,
  activeSample: "exhaust",
  toastTimer: null,
  currentJobId: "",
  lastPayload: null,
  responseMeta: null
};

const el = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  collectElements();
  bindEvents();
  checkServerMode();
  renderHistory();
  loadSample({ scroll: false, consent: false });
}

function collectElements() {
  const ids = [
    "modeBadge",
    "newJobButton",
    "loadSampleButton",
    "loadBatterySampleButton",
    "jobForm",
    "yearInput",
    "makeInput",
    "modelInput",
    "engineInput",
    "marketInput",
    "contextInput",
    "taskModeInput",
    "concernInput",
    "noteInput",
    "quickQuestionInput",
    "photoInput",
    "dropZone",
    "imageMeta",
    "safetyCheck",
    "formError",
    "analyzeButton",
    "clearButton",
    "toggleMarkersButton",
    "compareButton",
    "imageStage",
    "emptyStage",
    "previewImage",
    "annotationLayer",
    "scanOverlay",
    "annotationLegend",
    "demoBanner",
    "resultsSection",
    "resultSubtitle",
    "downloadButton",
    "copyNoteButton",
    "printButton",
    "summaryCards",
    "resultTitle",
    "statusPill",
    "likelyIssue",
    "findingsList",
    "safetyHeadline",
    "safetyBadge",
    "safetyReasons",
    "requiredAction",
    "stepCount",
    "stepsList",
    "toolsList",
    "fastenersPanel",
    "fastenersList",
    "warningsList",
    "customerNote",
    "missingInfoPanel",
    "missingInfoList",
    "clearHistoryButton",
    "historyList",
    "referenceDialog",
    "referenceImage",
    "referenceCaption",
    "closeReferenceButton",
    "toast"
  ];

  for (const id of ids) {
    el[id] = document.getElementById(id);
  }
}

function bindEvents() {
  el.jobForm.addEventListener("submit", handleAnalyze);
  el.photoInput.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    if (file) handlePhoto(file);
  });

  for (const eventName of ["dragenter", "dragover"]) {
    el.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      el.dropZone.classList.add("is-dragging");
    });
  }

  for (const eventName of ["dragleave", "drop"]) {
    el.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      el.dropZone.classList.remove("is-dragging");
    });
  }

  el.dropZone.addEventListener("drop", (event) => {
    const [file] = event.dataTransfer?.files || [];
    if (file) handlePhoto(file);
  });

  el.loadSampleButton.addEventListener("click", () => loadSample({ scroll: true, consent: true }));
  el.loadBatterySampleButton.addEventListener("click", () => loadBatterySample({ scroll: true, consent: true }));
  el.clearButton.addEventListener("click", resetJob);
  el.newJobButton.addEventListener("click", () => {
    resetJob();
    document.querySelector(".builder-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  el.toggleMarkersButton.addEventListener("click", toggleMarkers);
  el.compareButton.addEventListener("click", openReferenceDialog);
  el.closeReferenceButton.addEventListener("click", () => el.referenceDialog.close());
  el.referenceDialog.addEventListener("click", (event) => {
    if (event.target === el.referenceDialog) el.referenceDialog.close();
  });

  el.downloadButton.addEventListener("click", downloadMarkedImage);
  el.copyNoteButton.addEventListener("click", copyCustomerNote);
  el.printButton.addEventListener("click", () => window.print());
  el.clearHistoryButton.addEventListener("click", clearHistory);

  window.addEventListener("resize", () => requestAnimationFrame(updateAnnotationBounds));
  el.previewImage.addEventListener("load", () => {
    updateAnnotationBounds();
    if (state.analysis) renderAnnotations(state.analysis.annotations || []);
  });
}

async function checkServerMode() {
  try {
    const response = await fetch("/api/status", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Status check failed");
    const data = await response.json();
    state.serverMode = data.mode;
    el.modeBadge.className = `mode-badge ${data.apiConfigured ? "is-live" : "is-demo"}`;
    el.modeBadge.innerHTML = `<span class="status-dot"></span>${data.apiConfigured ? `Live AI · ${escapeText(data.model)}` : "Demo mode"}`;
  } catch {
    state.serverMode = "offline";
    el.modeBadge.className = "mode-badge is-demo";
    el.modeBadge.innerHTML = '<span class="status-dot"></span>Server unavailable';
  }
}

async function loadSample({ scroll = true, consent = true } = {}) {
  clearInlineError();
  state.currentJobId = "";
  document.dispatchEvent(new CustomEvent("fixsight:reset"));
  try {
    const response = await fetch("/sample-exhaust.jpg");
    if (!response.ok) throw new Error("Could not load sample image");
    const blob = await response.blob();
    const file = new File([blob], "2015-equinox-exhaust.jpg", { type: blob.type || "image/jpeg" });
    const dataUrl = await compressImage(file, 1800, 0.88);
    await setImage(dataUrl, file.name, file.size);

    state.activeSample = "exhaust";
    el.yearInput.value = "2015";
    el.makeInput.value = "Chevrolet";
    el.modelInput.value = "Equinox";
    el.engineInput.value = "";
    el.marketInput.value = "Detroit, MI";
    el.contextInput.value = "Mobile roadside service";
    el.taskModeInput.value = "Temporary roadside stabilization";
    el.concernInput.value = "The rear exhaust/resonator section is separated and dragging. I need to support it temporarily so the customer can reach an exhaust shop.";
    el.noteInput.value = "The resonator touching the ground is toward the rear of the vehicle.";
    el.quickQuestionInput.value = "Where can I safely support it and what should I avoid?";
    el.safetyCheck.checked = consent;
    updateReferenceDialog();
    el.compareButton.disabled = false;

    if (scroll) {
      document.querySelector(".builder-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
      showToast("Sample job loaded. Generate the guide when ready.");
    }
  } catch (error) {
    showInlineError(error.message || "Could not load the sample job.");
  }
}

async function loadBatterySample({ scroll = true, consent = true } = {}) {
  clearInlineError();
  state.currentJobId = "";
  document.dispatchEvent(new CustomEvent("fixsight:reset"));
  try {
    const response = await fetch("/sample-flex-battery.jpg");
    if (!response.ok) throw new Error("Could not load battery sample image");
    const blob = await response.blob();
    const file = new File([blob], "2016-ford-flex-battery.jpg", { type: blob.type || "image/jpeg" });
    const dataUrl = await compressImage(file, 1800, 0.88);
    await setImage(dataUrl, file.name, file.size);

    state.activeSample = "battery";
    el.yearInput.value = "2016";
    el.makeInput.value = "Ford";
    el.modelInput.value = "Flex SEL";
    el.engineInput.value = "";
    el.marketInput.value = "Detroit, MI";
    el.contextInput.value = "Mobile roadside service";
    el.taskModeInput.value = "Replace component";
    el.concernInput.value = "Replace the 12V battery and show the correct terminal, hold-down, fastener, tool, and reconnect order.";
    el.noteInput.value = "Positive terminal is under the red cover. Need field-safe visual guidance.";
    el.quickQuestionInput.value = "Which fasteners do I loosen, what socket sizes should I try, and which terminal connects first during install?";
    el.safetyCheck.checked = consent;
    el.compareButton.disabled = false;
    updateReferenceDialog();

    if (scroll) {
      document.querySelector(".builder-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
      showToast("Ford Flex battery sample loaded.");
    }
  } catch (error) {
    showInlineError(error.message || "Could not load the battery sample job.");
  }
}

async function handlePhoto(file) {
  clearInlineError();
  if (state.analysis || state.currentJobId) {
    state.currentJobId = "";
    document.dispatchEvent(new CustomEvent("fixsight:reset"));
  }
  if (!file.type.match(/^image\/(jpeg|png|webp)$/i)) {
    showInlineError("Choose a JPEG, PNG, or WebP image.");
    return;
  }
  if (file.size > 16 * 1024 * 1024) {
    showInlineError("That image is larger than 16 MB. Choose a smaller photo.");
    return;
  }

  try {
    const dataUrl = await compressImage(file, 1800, 0.86);
    await setImage(dataUrl, file.name, file.size);
    state.analysis = null;
    state.demoMode = false;
    state.activeSample = "custom";
    el.resultsSection.classList.add("is-hidden");
    el.demoBanner.classList.add("is-hidden");
    el.annotationLegend.innerHTML = legendPlaceholder();
    el.annotationLayer.replaceChildren();
    el.toggleMarkersButton.disabled = true;
    el.compareButton.disabled = false;
  } catch (error) {
    showInlineError(error.message || "The image could not be prepared.");
  }
}

async function setImage(dataUrl, name, originalSize = 0) {
  state.imageDataUrl = dataUrl;
  state.imageName = name || "repair-photo.jpg";
  state.thumbnailDataUrl = await createThumbnail(dataUrl, 520, 0.7).catch(() => dataUrl);

  el.previewImage.src = dataUrl;
  el.previewImage.alt = `Repair photo: ${state.imageName}`;
  el.imageStage.classList.remove("is-empty");
  el.emptyStage.classList.add("is-hidden");
  el.previewImage.classList.remove("is-hidden");

  const formattedSize = originalSize ? ` · ${formatBytes(originalSize)}` : "";
  el.imageMeta.textContent = `${state.imageName}${formattedSize}`;
  await waitForImage(el.previewImage);
  updateAnnotationBounds();
  document.dispatchEvent(new CustomEvent("fixsight:beforeimage", { detail: { dataUrl, name: state.imageName } }));
}

async function handleAnalyze(event) {
  event.preventDefault();
  clearInlineError();

  if (!el.jobForm.reportValidity()) return;
  if (!state.imageDataUrl) {
    showInlineError("Add a clear repair photo before generating the guide.");
    return;
  }
  if (!el.safetyCheck.checked) {
    showInlineError("Confirm the visual-triage safety statement before continuing.");
    return;
  }

  setLoading(true);
  el.scanOverlay.classList.add("is-active");
  el.annotationLayer.replaceChildren();
  el.annotationLegend.innerHTML = legendPlaceholder("Analyzing the image", "FixSight is separating visible evidence from likely interpretation and checking for safety blockers.");

  const payload = {
    year: el.yearInput.value.trim(),
    make: el.makeInput.value.trim(),
    model: el.modelInput.value.trim(),
    engine: el.engineInput.value.trim(),
    market: el.marketInput.value.trim(),
    serviceContext: el.contextInput.value,
    taskMode: el.taskModeInput.value,
    concern: el.concernInput.value.trim(),
    technicianNote: el.noteInput.value.trim(),
    quickQuestion: el.quickQuestionInput.value.trim(),
    imageDataUrl: state.imageDataUrl
  };

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "FixSight could not analyze this image.");
    }

    state.analysis = data.analysis;
    state.demoMode = Boolean(data.demo_mode);
    state.lastPayload = { ...payload, imageDataUrl: undefined };
    state.responseMeta = { model: data.model || "unknown", responseId: data.response_id || null };
    if (!state.currentJobId) {
      state.currentJobId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    }
    renderAnalysis(state.analysis);
    saveCurrentJob(payload, state.analysis, state.demoMode);
    el.demoBanner.classList.toggle("is-hidden", !state.demoMode);
    el.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showInlineError(error.message || "The analysis failed. Try again with a clearer photo.");
    el.annotationLegend.innerHTML = legendPlaceholder("No guide generated", "Check the photo and job description, then try again.");
  } finally {
    setLoading(false);
    el.scanOverlay.classList.remove("is-active");
  }
}

function renderAnalysis(analysis) {
  if (!analysis) return;

  state.markersVisible = true;
  state.activeAnnotation = -1;
  el.resultsSection.classList.remove("is-hidden");
  el.toggleMarkersButton.disabled = !(analysis.annotations || []).length;
  el.toggleMarkersButton.classList.add("is-active");
  el.toggleMarkersButton.setAttribute("aria-pressed", "true");

  renderAnnotations(analysis.annotations || []);
  renderSummaryCards(analysis);

  el.resultTitle.textContent = analysis.title || "Visual repair guide";
  el.resultSubtitle.textContent = [analysis.vehicle_summary, analysis.task_summary].filter(Boolean).join(" · ");
  el.likelyIssue.textContent = analysis.likely_issue || "No likely issue was returned.";

  const status = analysis.status || "needs_more_photos";
  el.statusPill.className = `status-pill status-${status}`;
  el.statusPill.textContent = statusLabel(status);

  renderTextList(el.findingsList, analysis.visible_findings || [], "finding-item", "finding-icon", "•");

  const safety = analysis.safety || {};
  el.safetyHeadline.textContent = safety.headline || "Verify before work";
  el.safetyBadge.className = `safety-badge safety-${safety.level || "yellow"}`;
  el.safetyBadge.textContent = `${safety.level || "yellow"} risk`;
  renderTextList(el.safetyReasons, safety.reasons || [], "safety-reason", "safety-icon", "!");
  el.requiredAction.textContent = safety.required_action || "Verify the repair area physically before proceeding.";

  const steps = [...(analysis.steps || [])].sort((a, b) => Number(a.order) - Number(b.order));
  el.stepCount.textContent = `${steps.length} steps`;
  el.stepsList.replaceChildren(...steps.map(createStepElement));

  el.toolsList.replaceChildren(...(analysis.tools || []).map(createToolElement));
  renderFasteners(analysis.fasteners || []);
  renderTextList(el.warningsList, analysis.warnings || [], "warning-item", "warning-icon", "×");
  el.customerNote.textContent = analysis.customer_note || "No customer note was returned.";

  const missing = analysis.missing_information || [];
  el.missingInfoPanel.classList.toggle("is-hidden", missing.length === 0);
  renderTextList(el.missingInfoList, missing, "missing-item", "missing-icon", "?");

  document.dispatchEvent(new CustomEvent("fixsight:analysis", {
    detail: {
      analysis,
      payload: state.lastPayload,
      responseMeta: state.responseMeta,
      jobId: state.currentJobId
    }
  }));
}

function renderSummaryCards(analysis) {
  const price = analysis.price_estimate || {};
  const time = analysis.estimated_time_minutes || {};
  const safety = analysis.safety || {};

  const cards = [
    {
      label: "Safety gate",
      value: titleCase(safety.level || "yellow"),
      detail: safety.headline || "Human verification required"
    },
    {
      label: "Visual confidence",
      value: `${Number(analysis.confidence || 0)}%`,
      detail: "Confidence in the visible assessment, not a guaranteed diagnosis"
    },
    {
      label: "Estimated time",
      value: formatRange(time.low, time.high, " min"),
      detail: titleCase(String(analysis.repair_class || "inspection").replaceAll("_", " "))
    },
    {
      label: "Suggested charge",
      value: formatCurrency(price.recommended, price.currency || "USD"),
      detail: `${formatCurrency(price.low, price.currency || "USD")}–${formatCurrency(price.high, price.currency || "USD")} ballpark range`
    }
  ];

  el.summaryCards.replaceChildren(...cards.map((card) => {
    const node = document.createElement("article");
    node.className = "summary-card";
    const label = document.createElement("span");
    label.textContent = card.label;
    const value = document.createElement("strong");
    value.textContent = card.value;
    const detail = document.createElement("small");
    detail.textContent = card.detail;
    node.append(label, value, detail);
    return node;
  }));
}

function renderFasteners(fasteners) {
  el.fastenersPanel.classList.toggle("is-hidden", !fasteners.length);
  el.fastenersList.replaceChildren();
  for (const item of fasteners) {
    const card = document.createElement("article");
    card.className = `fastener-card action-${item.action || "inspect"}`;
    const top = document.createElement("div");
    top.className = "fastener-card-top";
    const title = document.createElement("strong");
    title.textContent = item.label || "Fastener";
    const action = document.createElement("span");
    action.className = "fastener-action";
    action.textContent = titleCase(item.action || "inspect");
    top.append(title, action);

    const spec = document.createElement("p");
    spec.className = "fastener-spec";
    spec.textContent = [item.tool_size, item.tool_type].filter(Boolean).join(" · ") || "Verify tool size on vehicle";
    const detail = document.createElement("p");
    detail.textContent = item.detail || "Physically verify before turning the fastener.";
    const caution = document.createElement("small");
    caution.textContent = item.caution || "Do not force a fastener if the tool fit is uncertain.";
    card.append(top, spec, detail, caution);
    el.fastenersList.append(card);
  }
}

function renderAnnotations(annotations) {
  el.annotationLayer.replaceChildren();
  el.annotationLegend.replaceChildren();
  updateAnnotationBounds();

  if (!annotations.length) {
    el.annotationLegend.innerHTML = legendPlaceholder("No markers available", "The image may need another angle or a closer photo before FixSight can place useful markers.");
    return;
  }

  annotations.forEach((annotation, index) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = `marker kind-${annotation.kind || "inspect"}`;
    marker.style.left = `${clamp(Number(annotation.x), 0, 1000) / 10}%`;
    marker.style.top = `${clamp(Number(annotation.y), 0, 1000) / 10}%`;
    marker.style.animationDelay = `${index * 70}ms`;
    marker.textContent = String(index + 1);
    marker.title = `${annotation.label}: ${annotation.detail}`;
    marker.setAttribute("aria-label", `Marker ${index + 1}: ${annotation.label}`);
    marker.addEventListener("click", () => activateAnnotation(index));
    el.annotationLayer.append(marker);

    const legend = document.createElement("button");
    legend.type = "button";
    legend.className = "legend-item";
    legend.style.setProperty("--legend-color", kindColor(annotation.kind));
    legend.dataset.annotationIndex = String(index);
    legend.addEventListener("click", () => activateAnnotation(index));

    const number = document.createElement("span");
    number.className = "legend-number";
    number.textContent = String(index + 1);

    const copy = document.createElement("span");
    copy.className = "legend-copy";
    const strong = document.createElement("strong");
    strong.textContent = annotation.label || `Marker ${index + 1}`;
    const detail = document.createElement("p");
    detail.textContent = `${annotation.detail || ""}${Number.isFinite(Number(annotation.confidence)) ? ` · ${annotation.confidence}% marker confidence` : ""}`;
    copy.append(strong, detail);

    const kind = document.createElement("span");
    kind.className = "legend-kind";
    kind.textContent = annotation.kind || "inspect";

    legend.append(number, copy, kind);
    el.annotationLegend.append(legend);
  });
}

function activateAnnotation(index) {
  state.activeAnnotation = index;
  const markers = [...el.annotationLayer.querySelectorAll(".marker")];
  const legends = [...el.annotationLegend.querySelectorAll(".legend-item")];
  markers.forEach((node, nodeIndex) => node.classList.toggle("is-active", nodeIndex === index));
  legends.forEach((node, nodeIndex) => node.classList.toggle("is-active", nodeIndex === index));
  legends[index]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function toggleMarkers() {
  state.markersVisible = !state.markersVisible;
  el.annotationLayer.classList.toggle("is-hidden", !state.markersVisible);
  el.toggleMarkersButton.classList.toggle("is-active", state.markersVisible);
  el.toggleMarkersButton.setAttribute("aria-pressed", String(state.markersVisible));
}

function updateAnnotationBounds() {
  if (el.imageStage.classList.contains("is-empty") || !el.previewImage.complete) return;
  const stageRect = el.imageStage.getBoundingClientRect();
  const imageRect = el.previewImage.getBoundingClientRect();
  el.annotationLayer.style.left = `${imageRect.left - stageRect.left}px`;
  el.annotationLayer.style.top = `${imageRect.top - stageRect.top}px`;
  el.annotationLayer.style.width = `${imageRect.width}px`;
  el.annotationLayer.style.height = `${imageRect.height}px`;
  el.annotationLayer.style.right = "auto";
  el.annotationLayer.style.bottom = "auto";
}

function createStepElement(step, index) {
  const node = document.createElement("article");
  node.className = "step-item";

  const number = document.createElement("span");
  number.className = "step-number";
  number.textContent = String(step.order || index + 1);

  const copy = document.createElement("div");
  copy.className = "step-copy";
  const title = document.createElement("strong");
  title.textContent = step.title || `Step ${index + 1}`;
  const instruction = document.createElement("p");
  instruction.textContent = step.instruction || "";
  const checkpoint = document.createElement("div");
  checkpoint.className = "checkpoint";
  checkpoint.textContent = step.checkpoint || "Verify the work before continuing.";
  copy.append(title, instruction, checkpoint);

  node.append(number, copy);
  return node;
}

function createToolElement(tool) {
  const node = document.createElement("article");
  node.className = "tool-item";

  const top = document.createElement("div");
  top.className = "tool-topline";
  const name = document.createElement("strong");
  name.textContent = tool.name || "Tool";
  const tag = document.createElement("span");
  tag.className = `tool-tag${tool.required ? "" : " optional"}`;
  tag.textContent = tool.required ? "Required" : "Optional";
  top.append(name, tag);

  const notes = document.createElement("p");
  notes.textContent = tool.notes || "";
  node.append(top, notes);
  return node;
}

function renderTextList(container, items, itemClass, iconClass, iconText) {
  const nodes = (items || []).map((text) => {
    const row = document.createElement("div");
    row.className = itemClass;
    const icon = document.createElement("span");
    icon.className = iconClass;
    icon.textContent = iconText;
    const copy = document.createElement("span");
    copy.textContent = text;
    row.append(icon, copy);
    return row;
  });
  container.replaceChildren(...nodes);
}

function setLoading(loading) {
  el.analyzeButton.disabled = loading;
  el.analyzeButton.classList.toggle("is-loading", loading);
  el.analyzeButton.querySelector(".button-label").textContent = loading ? "Building guide" : "Generate visual guide";
}

function resetJob() {
  state.imageDataUrl = "";
  state.thumbnailDataUrl = "";
  state.imageName = "";
  state.analysis = null;
  state.demoMode = false;
  state.activeAnnotation = -1;
  state.markersVisible = true;
  state.activeSample = "custom";
  state.currentJobId = "";
  state.lastPayload = null;
  state.responseMeta = null;

  el.jobForm.reset();
  el.marketInput.value = "Detroit, MI";
  el.imageMeta.textContent = "JPEG, PNG, or WebP";
  el.photoInput.value = "";
  el.previewImage.removeAttribute("src");
  el.imageStage.classList.add("is-empty");
  el.emptyStage.classList.remove("is-hidden");
  el.annotationLayer.replaceChildren();
  el.annotationLayer.removeAttribute("style");
  el.annotationLegend.innerHTML = legendPlaceholder();
  el.resultsSection.classList.add("is-hidden");
  el.fastenersPanel.classList.add("is-hidden");
  el.fastenersList.replaceChildren();
  el.demoBanner.classList.add("is-hidden");
  el.toggleMarkersButton.disabled = true;
  el.toggleMarkersButton.classList.remove("is-active");
  el.compareButton.disabled = true;
  clearInlineError();
  document.dispatchEvent(new CustomEvent("fixsight:reset"));
}

function updateReferenceDialog() {
  if (!el.referenceImage || !el.referenceCaption) return;
  if (state.activeSample === "battery") {
    el.referenceImage.src = "/reference-battery.png";
    el.referenceImage.alt = "Reference annotated Ford Flex battery replacement image";
    el.referenceCaption.textContent = "Battery field test: terminal order, hold-down identification, fastener guidance, and BMS reminder.";
  } else {
    el.referenceImage.src = "/reference-markup.png";
    el.referenceImage.alt = "Reference annotated exhaust support image";
    el.referenceCaption.textContent = "Exhaust field test: temporary support points, lift location, hazards, and roadside handoff.";
  }
}

function openReferenceDialog() {
  if (typeof el.referenceDialog.showModal === "function") {
    el.referenceDialog.showModal();
  } else {
    const fallback = state.activeSample === "battery" ? "/reference-battery.png" : "/reference-markup.png";
    window.open(fallback, "_blank", "noopener");
  }
}

async function copyCustomerNote() {
  const note = state.analysis?.customer_note;
  if (!note) return;
  try {
    await navigator.clipboard.writeText(note);
    showToast("Customer service note copied.");
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = note;
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    showToast("Customer service note copied.");
  }
}

async function downloadMarkedImage() {
  if (!state.analysis || !state.imageDataUrl) return;
  el.downloadButton.disabled = true;
  el.downloadButton.textContent = "Preparing image";

  try {
    const sourceImage = await loadImage(state.imageDataUrl);
    const maxWidth = 1600;
    const scale = Math.min(1, maxWidth / sourceImage.naturalWidth);
    const imageWidth = Math.round(sourceImage.naturalWidth * scale);
    const imageHeight = Math.round(sourceImage.naturalHeight * scale);
    const headerHeight = Math.max(104, Math.round(imageWidth * 0.07));
    const annotations = state.analysis.annotations || [];
    const columns = imageWidth >= 1050 ? 2 : 1;
    const gap = 20;
    const sidePadding = 28;
    const itemWidth = (imageWidth - sidePadding * 2 - gap * (columns - 1)) / columns;
    const itemHeight = 112;
    const rows = Math.ceil(annotations.length / columns);
    const legendHeight = rows ? rows * itemHeight + Math.max(0, rows - 1) * 14 + 70 : 90;
    const footerHeight = 74;
    const canvas = document.createElement("canvas");
    canvas.width = imageWidth;
    canvas.height = headerHeight + imageHeight + legendHeight + footerHeight;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#0b1016";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawExportHeader(ctx, imageWidth, headerHeight, state.analysis);
    ctx.drawImage(sourceImage, 0, headerHeight, imageWidth, imageHeight);

    annotations.forEach((annotation, index) => {
      const x = clamp(Number(annotation.x), 0, 1000) / 1000 * imageWidth;
      const y = headerHeight + clamp(Number(annotation.y), 0, 1000) / 1000 * imageHeight;
      const color = kindColor(annotation.kind);
      drawMarker(ctx, x, y, index + 1, color, Math.max(18, imageWidth * 0.014));
    });

    const legendTop = headerHeight + imageHeight;
    ctx.fillStyle = "#101821";
    ctx.fillRect(0, legendTop, imageWidth, legendHeight);
    ctx.fillStyle = "#f6c94c";
    ctx.font = `800 ${Math.max(17, imageWidth * 0.014)}px system-ui, sans-serif`;
    ctx.fillText("VISUAL MARKERS", sidePadding, legendTop + 38);

    annotations.forEach((annotation, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = sidePadding + column * (itemWidth + gap);
      const y = legendTop + 58 + row * (itemHeight + 14);
      drawLegendCard(ctx, x, y, itemWidth, itemHeight, annotation, index + 1);
    });

    const footerY = legendTop + legendHeight;
    ctx.fillStyle = "#080c11";
    ctx.fillRect(0, footerY, imageWidth, footerHeight);
    ctx.fillStyle = "#9ba8b8";
    ctx.font = `500 ${Math.max(13, imageWidth * 0.0095)}px system-ui, sans-serif`;
    const disclaimer = "Visual triage only. Verify every marked component and attachment point physically and use vehicle-specific service information.";
    wrapCanvasText(ctx, disclaimer, sidePadding, footerY + 28, imageWidth - sidePadding * 2, Math.max(18, imageWidth * 0.013), 2);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not create image.")), "image/png");
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const vehicle = [el.yearInput.value, el.makeInput.value, el.modelInput.value].filter(Boolean).join("-").replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
    link.href = url;
    link.download = `fixsight-${vehicle || "repair"}-guide.png`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Marked repair image downloaded.");
  } catch (error) {
    showToast(error.message || "Could not prepare the marked image.");
  } finally {
    el.downloadButton.disabled = false;
    el.downloadButton.textContent = "Download marked photo";
  }
}

function drawExportHeader(ctx, width, height, analysis) {
  const padding = 28;
  const accentWidth = Math.max(7, Math.round(width * 0.006));
  ctx.fillStyle = "#0d141c";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#f6c94c";
  ctx.fillRect(0, 0, accentWidth, height);

  ctx.fillStyle = "#f6c94c";
  ctx.font = `900 ${Math.max(20, width * 0.018)}px system-ui, sans-serif`;
  ctx.fillText("FixSight", padding, 36);

  ctx.fillStyle = "#f4f7fb";
  ctx.font = `800 ${Math.max(18, width * 0.016)}px system-ui, sans-serif`;
  wrapCanvasText(ctx, analysis.title || "Visual repair guide", padding, 68, width - padding * 2, Math.max(23, width * 0.019), 1);

  ctx.fillStyle = "#9ba8b8";
  ctx.font = `500 ${Math.max(12, width * 0.009)}px system-ui, sans-serif`;
  const meta = [analysis.vehicle_summary, statusLabel(analysis.status), `${analysis.confidence || 0}% visual confidence`].filter(Boolean).join("  ·  ");
  ctx.fillText(meta, padding, height - 18);
}

function drawMarker(ctx, x, y, number, color, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius + 8, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(color, 0.25);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = Math.max(3, radius * 0.18);
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#081018";
  ctx.font = `900 ${Math.round(radius * 0.95)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), x, y + 1);
  ctx.restore();
}

function drawLegendCard(ctx, x, y, width, height, annotation, number) {
  const color = kindColor(annotation.kind);
  roundRectPath(ctx, x, y, width, height, 16);
  ctx.fillStyle = "#151f29";
  ctx.fill();
  ctx.strokeStyle = hexToRgba(color, 0.34);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  drawMarker(ctx, x + 31, y + 32, number, color, 15);
  ctx.fillStyle = color;
  ctx.font = "800 13px system-ui, sans-serif";
  ctx.fillText(String(annotation.kind || "inspect").toUpperCase(), x + 57, y + 25);

  ctx.fillStyle = "#f4f7fb";
  ctx.font = "800 16px system-ui, sans-serif";
  wrapCanvasText(ctx, annotation.label || `Marker ${number}`, x + 57, y + 48, width - 72, 20, 1);

  ctx.fillStyle = "#9ba8b8";
  ctx.font = "500 13px system-ui, sans-serif";
  wrapCanvasText(ctx, annotation.detail || "", x + 18, y + 79, width - 36, 17, 2);
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  const consumed = lines.join(" ").split(/\s+/).length;
  if (consumed < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 2) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = `${last.trim()}…`;
  }
  lines.forEach((value, index) => ctx.fillText(value, x, y + index * lineHeight));
  return lines.length;
}

function saveCurrentJob(payload, analysis, demoMode) {
  const history = readHistory();
  const vehicle = [payload.year, payload.make, payload.model].filter(Boolean).join(" ") || "Vehicle not specified";
  const id = state.currentJobId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  state.currentJobId = id;
  const existingIndex = history.findIndex((job) => job.id === id);
  const existing = existingIndex >= 0 ? history.splice(existingIndex, 1)[0] : null;
  const jobMode = window.FixSightJobMode?.getSnapshot?.() || existing?.jobMode || null;

  history.unshift({
    ...(existing || {}),
    id,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    vehicle,
    form: {
      year: payload.year,
      make: payload.make,
      model: payload.model,
      engine: payload.engine,
      market: payload.market,
      serviceContext: payload.serviceContext,
      taskMode: payload.taskMode,
      concern: payload.concern,
      technicianNote: payload.technicianNote,
      quickQuestion: payload.quickQuestion
    },
    imageName: state.imageName,
    imageDataUrl: state.thumbnailDataUrl,
    analysis,
    demoMode,
    responseMeta: state.responseMeta,
    jobMode
  });

  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {
    try {
      const lightweight = history.slice(0, 4).map((job) => ({
        ...job,
        imageDataUrl: "",
        jobMode: job.jobMode ? { ...job.jobMode, afterImageDataUrl: "", signatureDataUrl: "" } : null
      }));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(lightweight));
    } catch {
      // Storage can be disabled in private or embedded contexts. The live guide still works.
    }
  }
  renderHistory();
  document.dispatchEvent(new CustomEvent("fixsight:jobsaved", { detail: { id, job: history[0] } }));
}

function readHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderHistory() {
  const history = readHistory();
  el.historyList.replaceChildren();

  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "Generate a guide and the job summary will appear here on this device.";
    el.historyList.append(empty);
    return;
  }

  history.forEach((job) => {
    const card = document.createElement("article");
    card.className = "history-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Open saved job for ${job.vehicle}`);
    card.addEventListener("click", () => restoreJob(job));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        restoreJob(job);
      }
    });

    const top = document.createElement("div");
    top.className = "history-card-top";
    const vehicle = document.createElement("strong");
    vehicle.textContent = job.vehicle || "Saved job";
    const time = document.createElement("time");
    time.dateTime = job.createdAt;
    time.textContent = formatDate(job.createdAt);
    top.append(vehicle, time);

    const issue = document.createElement("p");
    issue.textContent = job.analysis?.likely_issue || job.form?.concern || "Visual repair guide";

    const meta = document.createElement("div");
    meta.className = "history-meta";
    const status = document.createElement("span");
    status.textContent = statusLabel(job.analysis?.status || "ready");
    const safety = document.createElement("span");
    safety.textContent = `${titleCase(job.analysis?.safety?.level || "yellow")} safety`;
    const price = document.createElement("span");
    price.textContent = `${formatCurrency(job.analysis?.price_estimate?.recommended, job.analysis?.price_estimate?.currency || "USD")} suggested`;
    meta.append(status, safety, price);
    if (job.jobMode?.jobStatus) {
      const closeout = document.createElement("span");
      closeout.textContent = titleCase(job.jobMode.jobStatus);
      meta.append(closeout);
    }

    card.append(top, issue, meta);
    el.historyList.append(card);
  });
  document.dispatchEvent(new CustomEvent("fixsight:historyrendered", { detail: { history } }));
}

async function restoreJob(job) {
  const form = job.form || {};
  el.yearInput.value = form.year || "";
  el.makeInput.value = form.make || "";
  el.modelInput.value = form.model || "";
  el.engineInput.value = form.engine || "";
  el.marketInput.value = form.market || "Detroit, MI";
  el.contextInput.value = form.serviceContext || "Mobile roadside service";
  el.taskModeInput.value = form.taskMode || "Diagnose / inspect";
  el.concernInput.value = form.concern || "";
  el.noteInput.value = form.technicianNote || "";
  el.quickQuestionInput.value = form.quickQuestion || "";
  el.safetyCheck.checked = true;

  if (job.imageDataUrl) {
    await setImage(job.imageDataUrl, job.imageName || "saved-job.jpg");
  } else {
    state.imageDataUrl = "";
    state.thumbnailDataUrl = "";
    state.imageName = job.imageName || "";
    el.imageStage.classList.add("is-empty");
    el.emptyStage.classList.remove("is-hidden");
  }

  state.currentJobId = job.id || "";
  state.analysis = job.analysis;
  state.demoMode = Boolean(job.demoMode);
  state.lastPayload = { ...(job.form || {}) };
  state.responseMeta = job.responseMeta || null;
  renderAnalysis(job.analysis);
  el.demoBanner.classList.toggle("is-hidden", !state.demoMode);
  document.querySelector(".builder-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  document.dispatchEvent(new CustomEvent("fixsight:restore", { detail: { job } }));
  showToast("Saved job restored from this browser.");
}

function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem("fixsight_current_job_v3");
  renderHistory();
  showToast("Recent job summaries cleared.");
}

async function compressImage(file, maxDimension = 1800, quality = 0.86) {
  const dataUrl = await fileToDataUrl(file);
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

async function createThumbnail(dataUrl, maxDimension = 520, quality = 0.7) {
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the image."));
    image.src = src;
  });
}

function waitForImage(image) {
  if (image.complete && image.naturalWidth) return Promise.resolve();
  return new Promise((resolve, reject) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", () => reject(new Error("Could not display the image.")), { once: true });
  });
}

function legendPlaceholder(title = "Numbered, color-coded markers", copy = "Markers stay tied to the image. Each one explains what to inspect, lift, avoid, support, remove, or repair.") {
  return `<div class="legend-placeholder"><strong>${escapeText(title)}</strong><p>${escapeText(copy)}</p></div>`;
}

function statusLabel(status) {
  return {
    ready: "Ready to verify",
    needs_more_photos: "More photos needed",
    stop_work: "Stop work"
  }[status] || titleCase(String(status || "review").replaceAll("_", " "));
}

function kindColor(kind) {
  return KIND_COLORS[kind] || KIND_COLORS.inspect;
}

function formatCurrency(value, currency = "USD") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(number) ? 0 : 2
    }).format(number);
  } catch {
    return `$${number.toFixed(Number.isInteger(number) ? 0 : 2)}`;
  }
}

function formatRange(low, high, suffix = "") {
  const lowNumber = Number(low);
  const highNumber = Number(high);
  if (!Number.isFinite(lowNumber) && !Number.isFinite(highNumber)) return "—";
  if (lowNumber === highNumber || !Number.isFinite(highNumber)) return `${lowNumber}${suffix}`;
  return `${lowNumber}–${highNumber}${suffix}`;
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function titleCase(value) {
  return String(value || "")
    .split(/\s+/)
    .map((word) => word ? word[0].toUpperCase() + word.slice(1) : word)
    .join(" ");
}

function showInlineError(message) {
  el.formError.textContent = message;
  el.formError.classList.remove("is-hidden");
  el.formError.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function clearInlineError() {
  el.formError.textContent = "";
  el.formError.classList.add("is-hidden");
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  el.toast.textContent = message;
  el.toast.classList.add("is-visible");
  state.toastTimer = setTimeout(() => el.toast.classList.remove("is-visible"), 2600);
}

function escapeText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized.length === 3 ? normalized.split("").map((char) => char + char).join("") : normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


window.FixSightCore = {
  HISTORY_KEY,
  MAX_HISTORY,
  state,
  el,
  renderAnalysis,
  renderAnnotations,
  renderHistory,
  readHistory,
  saveCurrentJob,
  updateAnnotationBounds,
  compressImage,
  createThumbnail,
  loadImage,
  waitForImage,
  showToast,
  showInlineError,
  clearInlineError,
  formatCurrency,
  formatDate,
  titleCase,
  clamp,
  kindColor
};
