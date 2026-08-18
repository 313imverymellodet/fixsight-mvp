"use strict";

(() => {
  const CURRENT_JOB_KEY = "fixsight_current_job_v3";
  const REVIEW_STATUSES = ["verified", "incorrect", "needs_photo"];
  const AFTER_KIND_COLORS = {
    confirmed: "#37d99a",
    attention: "#ff6d6d",
    inspect: "#f6c94c"
  };

  const core = window.FixSightCore;
  if (!core) return;

  let jm = createDefaultState();
  let persistTimer = null;
  let initialized = false;
  let signatureDrawing = false;
  let signatureLastPoint = null;
  const el = {};

  const ids = [
    "jobProgress",
    "shopNameInput",
    "technicianNameInput",
    "customerNameInput",
    "customerPhoneInput",
    "customerEmailInput",
    "serviceAddressInput",
    "vinInput",
    "odometerInput",
    "markerReviewPanel",
    "markerReviewCount",
    "markerReviewMeter",
    "markerReviewMessage",
    "exportEvaluationButton",
    "reviewAllButton",
    "jobModeSection",
    "jobStatusBadge",
    "completionSection",
    "completionStatusBadge",
    "comparisonBeforeImage",
    "loadDemoAfterButton",
    "afterPhotoInput",
    "afterDropZone",
    "afterImageMeta",
    "afterImageStage",
    "afterPreviewImage",
    "afterAnnotationLayer",
    "afterScanOverlay",
    "afterAnnotationLegend",
    "servicePerformedInput",
    "checkWorkArea",
    "checkHardware",
    "checkHazards",
    "checkHandoff",
    "completionError",
    "verifyCompletionButton",
    "clearAfterButton",
    "verificationResults",
    "verificationHeadline",
    "verificationSummary",
    "verificationStatusPill",
    "verificationConfidence",
    "releaseGuidance",
    "manualCheckCount",
    "visibleChangesList",
    "verificationChecksList",
    "unresolvedItemsList",
    "closeoutSection",
    "invoiceTotalBadge",
    "invoiceNumberInput",
    "serviceDateInput",
    "serviceDescriptionInput",
    "serviceCallInput",
    "laborHoursInput",
    "laborRateInput",
    "partsAmountInput",
    "materialsAmountInput",
    "discountInput",
    "taxRateInput",
    "amountPaidInput",
    "paymentStatusInput",
    "paymentMethodInput",
    "limitationsInput",
    "serviceCallTotal",
    "laborTotal",
    "partsMaterialsTotal",
    "discountTotal",
    "taxTotal",
    "grandTotal",
    "paidTotal",
    "balanceTotal",
    "signatureCanvas",
    "clearSignatureButton",
    "signerNameInput",
    "customerAcknowledgmentInput",
    "technicianSignoffInput",
    "serviceReportPreview",
    "closeoutError",
    "completeJobButton",
    "printServiceReportButton",
    "downloadServiceReportButton",
    "copyServiceSummaryButton"
  ];

  window.FixSightJobMode = {
    getSnapshot,
    exportEvaluation: downloadEvaluation,
    getState: () => jm
  };

  document.addEventListener("DOMContentLoaded", init);
  document.addEventListener("fixsight:analysis", (event) => onAnalysis(event.detail || {}));
  document.addEventListener("fixsight:restore", (event) => restoreSnapshot(event.detail?.job?.jobMode || null));
  document.addEventListener("fixsight:reset", resetJobMode);
  document.addEventListener("fixsight:beforeimage", (event) => {
    updateBeforeComparison(event.detail?.dataUrl || "");
    updateProgress();
  });
  window.addEventListener("resize", () => requestAnimationFrame(updateAfterAnnotationBounds));

  function init() {
    for (const id of ids) el[id] = document.getElementById(id);
    initialized = true;
    bindEvents();
    setDefaultInputs();
    setupSignaturePad();
    updateProgress();
    updateInvoice();
  }

  function createDefaultState() {
    return {
      version: 3,
      jobId: "",
      jobStatus: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      party: {
        shopName: "",
        technicianName: "",
        customerName: "",
        customerPhone: "",
        customerEmail: "",
        serviceAddress: "",
        vin: "",
        odometer: ""
      },
      analysisFingerprint: "",
      markerReviews: {},
      stepChecks: {},
      evaluationEvents: [],
      repositioningId: "",
      afterImageDataUrl: "",
      afterThumbnailDataUrl: "",
      afterImageName: "",
      servicePerformed: "",
      manualChecks: {
        workArea: false,
        hardware: false,
        hazards: false,
        handoff: false
      },
      completion: null,
      completionMeta: null,
      invoice: {
        number: makeInvoiceNumber(),
        serviceDate: localDateString(),
        description: "",
        serviceCall: 0,
        laborHours: 0,
        laborRate: 0,
        partsAmount: 0,
        materialsAmount: 0,
        discount: 0,
        taxRate: 0,
        amountPaid: 0,
        paymentStatus: "unpaid",
        paymentMethod: "not_recorded",
        limitations: ""
      },
      signatureDataUrl: "",
      signerName: "",
      customerAcknowledgment: false,
      technicianSignoff: false
    };
  }

  function bindEvents() {
    el.jobProgress?.querySelectorAll(".job-progress-step").forEach((button) => {
      button.addEventListener("click", () => {
        const target = document.getElementById(button.dataset.target || "");
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    const partyIds = [
      "shopNameInput", "technicianNameInput", "customerNameInput", "customerPhoneInput",
      "customerEmailInput", "serviceAddressInput", "vinInput", "odometerInput"
    ];
    partyIds.forEach((id) => el[id]?.addEventListener("input", () => {
      capturePartyInputs();
      updateServiceReportPreview();
      schedulePersist();
    }));

    el.reviewAllButton?.addEventListener("click", focusFirstUnreviewedMarker);
    el.exportEvaluationButton?.addEventListener("click", downloadEvaluation);

    el.afterPhotoInput?.addEventListener("change", (event) => {
      const [file] = event.target.files || [];
      if (file) handleAfterPhoto(file);
    });
    for (const eventName of ["dragenter", "dragover"]) {
      el.afterDropZone?.addEventListener(eventName, (event) => {
        event.preventDefault();
        el.afterDropZone.classList.add("is-dragging");
      });
    }
    for (const eventName of ["dragleave", "drop"]) {
      el.afterDropZone?.addEventListener(eventName, (event) => {
        event.preventDefault();
        el.afterDropZone.classList.remove("is-dragging");
      });
    }
    el.afterDropZone?.addEventListener("drop", (event) => {
      const [file] = event.dataTransfer?.files || [];
      if (file) handleAfterPhoto(file);
    });
    el.loadDemoAfterButton?.addEventListener("click", loadDemoAfterPhoto);
    el.clearAfterButton?.addEventListener("click", clearAfterPhoto);
    el.verifyCompletionButton?.addEventListener("click", verifyCompletion);
    el.afterPreviewImage?.addEventListener("load", () => {
      updateAfterAnnotationBounds();
      renderAfterAnnotations(jm.completion?.annotations || []);
    });

    el.servicePerformedInput?.addEventListener("input", () => {
      jm.servicePerformed = el.servicePerformedInput.value.trim();
      if (!el.serviceDescriptionInput.value.trim()) {
        el.serviceDescriptionInput.value = jm.servicePerformed;
      }
      captureInvoiceInputs();
      updateServiceReportPreview();
      schedulePersist();
    });

    const manualMap = {
      checkWorkArea: "workArea",
      checkHardware: "hardware",
      checkHazards: "hazards",
      checkHandoff: "handoff"
    };
    for (const [id, key] of Object.entries(manualMap)) {
      el[id]?.addEventListener("change", () => {
        jm.manualChecks[key] = Boolean(el[id].checked);
        recordEvent("manual_check", { key, checked: jm.manualChecks[key] });
        renderCompletionSummary();
        updateProgress();
        updateServiceReportPreview();
        schedulePersist();
      });
    }

    const invoiceInputs = [
      "invoiceNumberInput", "serviceDateInput", "serviceDescriptionInput", "serviceCallInput",
      "laborHoursInput", "laborRateInput", "partsAmountInput", "materialsAmountInput",
      "discountInput", "taxRateInput", "amountPaidInput", "paymentStatusInput",
      "paymentMethodInput", "limitationsInput", "signerNameInput"
    ];
    invoiceInputs.forEach((id) => {
      const eventName = id.includes("Status") || id.includes("Method") || id.includes("Date") ? "change" : "input";
      el[id]?.addEventListener(eventName, () => {
        captureInvoiceInputs();
        if (id === "paymentStatusInput" && el.paymentStatusInput.value === "paid") {
          const totals = calculateInvoiceTotals();
          if (numberValue(el.amountPaidInput.value) === 0) {
            el.amountPaidInput.value = totals.total.toFixed(2);
            captureInvoiceInputs();
          }
        }
        updateInvoice();
        schedulePersist();
      });
    });

    el.customerAcknowledgmentInput?.addEventListener("change", () => {
      jm.customerAcknowledgment = el.customerAcknowledgmentInput.checked;
      schedulePersist();
    });
    el.technicianSignoffInput?.addEventListener("change", () => {
      jm.technicianSignoff = el.technicianSignoffInput.checked;
      schedulePersist();
    });

    el.clearSignatureButton?.addEventListener("click", clearSignature);
    el.completeJobButton?.addEventListener("click", completeJob);
    el.printServiceReportButton?.addEventListener("click", printServiceReport);
    el.downloadServiceReportButton?.addEventListener("click", downloadServiceReport);
    el.copyServiceSummaryButton?.addEventListener("click", copyServiceSummary);

    core.el.imageStage?.addEventListener("click", handleRepositionClick, true);
    core.el.concernInput?.addEventListener("input", updateProgress);
    core.el.safetyCheck?.addEventListener("change", updateProgress);
  }

  function setDefaultInputs() {
    if (el.serviceDateInput && !el.serviceDateInput.value) el.serviceDateInput.value = localDateString();
    if (el.invoiceNumberInput && !el.invoiceNumberInput.value) el.invoiceNumberInput.value = jm.invoice.number;
  }

  function onAnalysis({ analysis, jobId }) {
    if (!analysis) return;
    const fingerprint = createAnalysisFingerprint(analysis);
    const incomingJobId = core.state.currentJobId || jobId || "";
    const jobChanged = Boolean(incomingJobId && jm.jobId && incomingJobId !== jm.jobId);
    const isNewAnalysis = fingerprint !== jm.analysisFingerprint || jobChanged;

    if (isNewAnalysis) {
      const preservedParty = capturePartyInputs();
      const preservedInvoiceNumber = jobChanged ? makeInvoiceNumber() : (jm.invoice.number || makeInvoiceNumber());
      jm = createDefaultState();
      jm.party = preservedParty;
      jm.invoice.number = preservedInvoiceNumber;
      jm.jobId = incomingJobId;
      jm.analysisFingerprint = fingerprint;
      initializeMarkerReviews(analysis.annotations || []);
      initializeStepChecks(analysis.steps || []);
      seedInvoiceFromAnalysis(analysis);
      jm.servicePerformed = analysis.customer_note || analysis.task_summary || "";
      jm.invoice.description = jm.servicePerformed;
      jm.invoice.limitations = defaultLimitations(analysis);
      applyStateToInputs();
    } else {
      jm.jobId = core.state.currentJobId || jobId || jm.jobId;
      ensureReviewCoverage(analysis.annotations || []);
      ensureStepCoverage(analysis.steps || []);
    }

    jm.jobStatus = jm.jobStatus === "completed" ? "completed" : "guide_ready";
    el.jobModeSection?.classList.remove("is-hidden");
    el.markerReviewPanel?.classList.remove("is-hidden");
    updateBeforeComparison(core.state.imageDataUrl);
    decorateAnnotationReviews();
    decorateStepChecks();
    renderCompletion();
    updateInvoice();
    updateProgress();
    schedulePersist();
  }

  function initializeMarkerReviews(annotations) {
    jm.markerReviews = {};
    for (const annotation of annotations) {
      jm.markerReviews[annotation.id] = {
        annotationId: annotation.id,
        label: annotation.label || annotation.id,
        kind: annotation.kind || "inspect",
        status: "unreviewed",
        note: "",
        originalX: Number(annotation.x),
        originalY: Number(annotation.y),
        correctedX: null,
        correctedY: null,
        updatedAt: null
      };
    }
  }

  function ensureReviewCoverage(annotations) {
    for (const annotation of annotations) {
      if (!jm.markerReviews[annotation.id]) {
        jm.markerReviews[annotation.id] = {
          annotationId: annotation.id,
          label: annotation.label || annotation.id,
          kind: annotation.kind || "inspect",
          status: "unreviewed",
          note: "",
          originalX: Number(annotation.x),
          originalY: Number(annotation.y),
          correctedX: null,
          correctedY: null,
          updatedAt: null
        };
      }
    }
  }

  function initializeStepChecks(steps) {
    jm.stepChecks = {};
    steps.forEach((step, index) => {
      const key = stepKey(step, index);
      jm.stepChecks[key] = { checked: false, updatedAt: null };
    });
  }

  function ensureStepCoverage(steps) {
    steps.forEach((step, index) => {
      const key = stepKey(step, index);
      if (!jm.stepChecks[key]) jm.stepChecks[key] = { checked: false, updatedAt: null };
    });
  }

  function decorateAnnotationReviews() {
    const annotations = core.state.analysis?.annotations || [];
    ensureReviewCoverage(annotations);
    const legendButtons = [...core.el.annotationLegend.querySelectorAll("button.legend-item")];

    legendButtons.forEach((legendButton, index) => {
      const annotation = annotations[index];
      if (!annotation || legendButton.closest(".annotation-review-card")) return;
      const review = jm.markerReviews[annotation.id];
      const wrapper = document.createElement("article");
      wrapper.className = `annotation-review-card review-${review.status}`;
      wrapper.dataset.annotationId = annotation.id;
      legendButton.parentNode.insertBefore(wrapper, legendButton);
      wrapper.append(legendButton);

      const controls = document.createElement("div");
      controls.className = "annotation-review-controls";
      const label = document.createElement("span");
      label.textContent = "Technician verification";
      controls.append(label);

      const buttonRow = document.createElement("div");
      buttonRow.className = "review-button-row";
      const choices = [
        ["verified", "✓ Verified"],
        ["incorrect", "✕ Incorrect"],
        ["needs_photo", "? Need photo"]
      ];
      for (const [status, text] of choices) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `review-choice choice-${status}${review.status === status ? " is-selected" : ""}`;
        button.textContent = text;
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          setMarkerReview(annotation, status);
        });
        buttonRow.append(button);
      }
      controls.append(buttonRow);

      const detail = document.createElement("div");
      detail.className = `review-detail${review.status === "incorrect" || review.status === "needs_photo" ? "" : " is-hidden"}`;
      const note = document.createElement("textarea");
      note.rows = 2;
      note.placeholder = review.status === "incorrect"
        ? "What is wrong, and what should the marker point to?"
        : "Which angle or close-up is needed?";
      note.value = review.note || "";
      note.addEventListener("input", () => {
        review.note = note.value.trim();
        review.updatedAt = new Date().toISOString();
        schedulePersist();
      });
      detail.append(note);

      if (review.status === "incorrect") {
        const reposition = document.createElement("button");
        reposition.type = "button";
        reposition.className = "button button-ghost button-small reposition-button";
        reposition.textContent = review.correctedX == null ? "Reposition on photo" : "Reposition again";
        reposition.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          beginReposition(annotation.id);
        });
        detail.append(reposition);
      }
      controls.append(detail);
      wrapper.append(controls);
    });

    applyMarkerReviewClasses();
    updateMarkerReviewSummary();
  }

  function setMarkerReview(annotation, status) {
    if (!REVIEW_STATUSES.includes(status)) return;
    const review = jm.markerReviews[annotation.id];
    if (!review) return;
    const previous = review.status;
    review.status = status;
    review.updatedAt = new Date().toISOString();
    if (status === "verified") {
      review.note = "";
      review.correctedX = null;
      review.correctedY = null;
      const live = core.state.analysis?.annotations?.find((item) => item.id === annotation.id);
      if (live) {
        live.x = review.originalX;
        live.y = review.originalY;
      }
    }
    recordEvent("marker_review", {
      annotationId: annotation.id,
      label: annotation.label,
      previousStatus: previous,
      status,
      original: { x: review.originalX, y: review.originalY },
      corrected: review.correctedX == null ? null : { x: review.correctedX, y: review.correctedY }
    });
    core.renderAnnotations(core.state.analysis?.annotations || []);
    decorateAnnotationReviews();
    updateProgress();
    schedulePersist();
  }

  function applyMarkerReviewClasses() {
    const annotations = core.state.analysis?.annotations || [];
    const markers = [...core.el.annotationLayer.querySelectorAll(".marker")];
    annotations.forEach((annotation, index) => {
      const status = jm.markerReviews[annotation.id]?.status || "unreviewed";
      markers[index]?.classList.add(`review-${status}`);
      markers[index]?.setAttribute("data-review-status", status);
    });
  }

  function beginReposition(annotationId) {
    jm.repositioningId = annotationId;
    core.el.imageStage.classList.add("is-repositioning");
    const annotation = core.state.analysis?.annotations?.find((item) => item.id === annotationId);
    core.showToast(`Tap the correct location for “${annotation?.label || "this marker"}” on the photo.`);
  }

  function handleRepositionClick(event) {
    if (!jm.repositioningId) return;
    const image = core.el.previewImage;
    const rect = image.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
    event.preventDefault();
    event.stopPropagation();

    const normalizedX = Math.round(((x - rect.left) / rect.width) * 1000);
    const normalizedY = Math.round(((y - rect.top) / rect.height) * 1000);
    const annotation = core.state.analysis?.annotations?.find((item) => item.id === jm.repositioningId);
    const review = jm.markerReviews[jm.repositioningId];
    if (annotation && review) {
      annotation.x = core.clamp(normalizedX, 0, 1000);
      annotation.y = core.clamp(normalizedY, 0, 1000);
      review.correctedX = annotation.x;
      review.correctedY = annotation.y;
      review.status = "incorrect";
      review.updatedAt = new Date().toISOString();
      recordEvent("marker_reposition", {
        annotationId: annotation.id,
        original: { x: review.originalX, y: review.originalY },
        corrected: { x: review.correctedX, y: review.correctedY }
      });
    }
    jm.repositioningId = "";
    core.el.imageStage.classList.remove("is-repositioning");
    core.renderAnnotations(core.state.analysis?.annotations || []);
    decorateAnnotationReviews();
    schedulePersist();
    core.showToast("Corrected marker position saved to the evaluation record.");
  }

  function updateMarkerReviewSummary() {
    const reviews = Object.values(jm.markerReviews);
    const reviewed = reviews.filter((item) => item.status !== "unreviewed").length;
    const verified = reviews.filter((item) => item.status === "verified").length;
    const incorrect = reviews.filter((item) => item.status === "incorrect").length;
    const needPhoto = reviews.filter((item) => item.status === "needs_photo").length;
    const total = reviews.length;
    const percent = total ? Math.round((reviewed / total) * 100) : 100;
    if (el.markerReviewCount) el.markerReviewCount.textContent = `${reviewed} / ${total} reviewed`;
    if (el.markerReviewMeter) el.markerReviewMeter.style.width = `${percent}%`;
    if (el.markerReviewMessage) {
      if (!total) el.markerReviewMessage.textContent = "No AI markers were returned for this guide.";
      else if (reviewed < total) el.markerReviewMessage.textContent = `${total - reviewed} marker${total - reviewed === 1 ? "" : "s"} still require technician review.`;
      else if (incorrect || needPhoto) el.markerReviewMessage.textContent = `${verified} verified · ${incorrect} incorrect/corrected · ${needPhoto} need another photo. Unresolved items remain visible in closeout.`;
      else el.markerReviewMessage.textContent = `All ${total} markers were verified on the vehicle.`;
    }
  }

  function focusFirstUnreviewedMarker() {
    const first = Object.values(jm.markerReviews).find((review) => review.status === "unreviewed");
    const target = first
      ? core.el.annotationLegend.querySelector(`[data-annotation-id="${cssEscape(first.annotationId)}"]`)
      : core.el.annotationLegend.querySelector(".annotation-review-card");
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.querySelector(".review-choice")?.focus();
  }

  function decorateStepChecks() {
    const steps = core.state.analysis?.steps || [];
    const nodes = [...core.el.stepsList.querySelectorAll(".step-item")];
    nodes.forEach((node, index) => {
      if (node.querySelector(".step-completion-control")) return;
      const step = steps[index] || {};
      const key = stepKey(step, index);
      const saved = jm.stepChecks[key] || { checked: false };
      const label = document.createElement("label");
      label.className = "step-completion-control";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(saved.checked);
      const text = document.createElement("span");
      text.textContent = "Step completed and checkpoint verified";
      input.addEventListener("change", () => {
        jm.stepChecks[key] = { checked: input.checked, updatedAt: new Date().toISOString() };
        node.classList.toggle("is-complete", input.checked);
        recordEvent("step_check", { stepKey: key, checked: input.checked, title: step.title || `Step ${index + 1}` });
        updateProgress();
        schedulePersist();
      });
      node.classList.toggle("is-complete", input.checked);
      label.append(input, text);
      node.querySelector(".step-copy")?.append(label);
    });
  }

  async function handleAfterPhoto(file) {
    hideError(el.completionError);
    if (!file.type.match(/^image\/(jpeg|png|webp)$/i)) return showError(el.completionError, "Choose a JPEG, PNG, or WebP after photo.");
    if (file.size > 16 * 1024 * 1024) return showError(el.completionError, "The after photo is larger than 16 MB.");
    try {
      const dataUrl = await core.compressImage(file, 1800, 0.86);
      const thumb = await core.createThumbnail(dataUrl, 700, 0.76).catch(() => dataUrl);
      setAfterImage(dataUrl, thumb, file.name || "after-photo.jpg");
      jm.completion = null;
      jm.completionMeta = null;
      recordEvent("after_photo_added", { name: jm.afterImageName });
      renderCompletion();
      updateProgress();
      schedulePersist();
    } catch (error) {
      showError(el.completionError, error.message || "The after photo could not be prepared.");
    }
  }

  async function loadDemoAfterPhoto() {
    hideError(el.completionError);
    try {
      const isBattery = /battery|ford flex/i.test(`${core.state.analysis?.title || ""} ${core.state.analysis?.vehicle_summary || ""}`);
      const source = isBattery ? "/sample-flex-after.jpg" : "/sample-exhaust.jpg";
      const response = await fetch(source);
      if (!response.ok) throw new Error("Could not load the demo after photo.");
      const blob = await response.blob();
      const file = new File([blob], isBattery ? "ford-flex-after.jpg" : "exhaust-after-demo.jpg", { type: blob.type || "image/jpeg" });
      await handleAfterPhoto(file);
      core.showToast(isBattery ? "Demo after photo loaded." : "Demo comparison loaded; the same exhaust view should remain unverified.");
    } catch (error) {
      showError(el.completionError, error.message || "Could not load a demo after photo.");
    }
  }

  function setAfterImage(dataUrl, thumbnail, name) {
    jm.afterImageDataUrl = dataUrl;
    jm.afterThumbnailDataUrl = thumbnail || dataUrl;
    jm.afterImageName = name;
    el.afterPreviewImage.src = dataUrl;
    el.afterImageStage.classList.remove("is-hidden");
    el.afterDropZone.classList.add("is-hidden");
    el.afterImageMeta.textContent = name;
    el.afterAnnotationLayer.replaceChildren();
    el.afterAnnotationLegend.replaceChildren();
  }

  function clearAfterPhoto(options = {}) {
    const shouldPersist = options?.persist !== false;
    jm.afterImageDataUrl = "";
    jm.afterThumbnailDataUrl = "";
    jm.afterImageName = "";
    jm.completion = null;
    jm.completionMeta = null;
    if (el.afterPhotoInput) el.afterPhotoInput.value = "";
    el.afterPreviewImage.removeAttribute("src");
    el.afterImageStage.classList.add("is-hidden");
    el.afterDropZone.classList.remove("is-hidden");
    el.afterImageMeta.textContent = "Add completion photo";
    el.afterAnnotationLayer.replaceChildren();
    el.afterAnnotationLegend.replaceChildren();
    el.verificationResults.classList.add("is-hidden");
    updateProgress();
    if (shouldPersist) schedulePersist();
  }

  async function verifyCompletion() {
    hideError(el.completionError);
    const reviews = Object.values(jm.markerReviews);
    const unreviewed = reviews.filter((item) => item.status === "unreviewed");
    if (unreviewed.length) return showError(el.completionError, `Review all AI markers first. ${unreviewed.length} remain unreviewed.`);
    if (!jm.afterImageDataUrl) return showError(el.completionError, "Add an after photo before running completion verification.");
    jm.servicePerformed = el.servicePerformedInput.value.trim();
    if (jm.servicePerformed.length < 5) return showError(el.completionError, "Briefly describe the work performed before verification.");

    setVerificationLoading(true);
    el.afterScanOverlay.classList.add("is-active");
    try {
      const payload = {
        vehicle: getVehicleContext(),
        task: core.state.lastPayload || {},
        initialAnalysis: core.state.analysis,
        markerReviews: jm.markerReviews,
        stepChecks: jm.stepChecks,
        manualChecks: jm.manualChecks,
        servicePerformed: jm.servicePerformed,
        beforeImageDataUrl: core.state.imageDataUrl,
        afterImageDataUrl: jm.afterImageDataUrl
      };
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Completion verification failed.");
      jm.completion = data.verification;
      jm.completionMeta = { demoMode: Boolean(data.demo_mode), model: data.model || "unknown", responseId: data.response_id || null };
      jm.jobStatus = jm.completion?.status === "unsafe" ? "attention_required" : "completion_checked";
      recordEvent("completion_verification", {
        status: jm.completion?.status,
        confidence: jm.completion?.confidence,
        responseId: jm.completionMeta.responseId,
        model: jm.completionMeta.model
      });
      renderCompletion();
      seedCloseoutFromCompletion();
      updateInvoice();
      updateProgress();
      schedulePersist();
      el.verificationResults.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      showError(el.completionError, error.message || "Completion verification failed.");
    } finally {
      setVerificationLoading(false);
      el.afterScanOverlay.classList.remove("is-active");
    }
  }

  function setVerificationLoading(loading) {
    el.verifyCompletionButton.disabled = loading;
    el.verifyCompletionButton.classList.toggle("is-loading", loading);
    el.verifyCompletionButton.querySelector(".button-label").textContent = loading ? "Comparing photos" : "Verify completion";
  }

  function renderCompletion() {
    if (core.state.imageDataUrl) updateBeforeComparison(core.state.imageDataUrl);
    if (jm.afterImageDataUrl) {
      if (el.afterPreviewImage.src !== jm.afterImageDataUrl) el.afterPreviewImage.src = jm.afterImageDataUrl;
      el.afterImageStage.classList.remove("is-hidden");
      el.afterDropZone.classList.add("is-hidden");
      el.afterImageMeta.textContent = jm.afterImageName || "After photo";
    }
    renderCompletionSummary();
    renderAfterAnnotations(jm.completion?.annotations || []);
  }

  function renderCompletionSummary() {
    const completion = jm.completion;
    const checksDone = Object.values(jm.manualChecks).filter(Boolean).length;
    el.manualCheckCount.textContent = `${checksDone} / 4`;
    if (!completion) {
      el.verificationResults.classList.add("is-hidden");
      el.completionStatusBadge.textContent = "Not verified";
      return;
    }

    el.verificationResults.classList.remove("is-hidden");
    el.verificationHeadline.textContent = completion.headline || "Visual completion check";
    el.verificationSummary.textContent = completion.summary || "No completion summary returned.";
    el.verificationConfidence.textContent = `${Number(completion.confidence || 0)}%`;
    el.releaseGuidance.textContent = completion.safety?.release_recommendation || "Physical verification required";
    el.completionStatusBadge.textContent = completionStatusLabel(completion.status);
    el.verificationStatusPill.className = `status-pill verification-${completion.status || "cannot_verify"}`;
    el.verificationStatusPill.textContent = completionStatusLabel(completion.status);
    renderSimpleList(el.visibleChangesList, completion.visible_changes || [], "change-row", "✓");
    renderVerificationChecks(completion.checks || []);
    renderSimpleList(el.unresolvedItemsList, completion.unresolved_items || [], "unresolved-row", "!");
  }

  function renderVerificationChecks(checks) {
    el.verificationChecksList.replaceChildren();
    for (const check of checks) {
      const row = document.createElement("article");
      row.className = `verification-check check-${check.status || "not_visible"}`;
      const icon = document.createElement("span");
      icon.textContent = check.status === "pass" ? "✓" : check.status === "attention" ? "!" : "?";
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = check.label || "Verification check";
      const detail = document.createElement("p");
      detail.textContent = check.detail || "";
      copy.append(title, detail);
      row.append(icon, copy);
      el.verificationChecksList.append(row);
    }
  }

  function renderAfterAnnotations(annotations) {
    el.afterAnnotationLayer.replaceChildren();
    el.afterAnnotationLegend.replaceChildren();
    if (!jm.afterImageDataUrl || !annotations.length) return;
    updateAfterAnnotationBounds();
    annotations.forEach((annotation, index) => {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = `after-marker after-kind-${annotation.kind || "inspect"}`;
      marker.style.left = `${core.clamp(Number(annotation.x), 0, 1000) / 10}%`;
      marker.style.top = `${core.clamp(Number(annotation.y), 0, 1000) / 10}%`;
      marker.textContent = String(index + 1);
      marker.title = `${annotation.label}: ${annotation.detail}`;
      el.afterAnnotationLayer.append(marker);

      const card = document.createElement("article");
      card.className = "after-legend-item";
      card.style.setProperty("--after-color", AFTER_KIND_COLORS[annotation.kind] || AFTER_KIND_COLORS.inspect);
      const number = document.createElement("span");
      number.textContent = String(index + 1);
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = annotation.label || `After marker ${index + 1}`;
      const detail = document.createElement("p");
      detail.textContent = `${annotation.detail || ""} · ${Number(annotation.confidence || 0)}% visual confidence`;
      copy.append(title, detail);
      const kind = document.createElement("small");
      kind.textContent = annotation.kind || "inspect";
      card.append(number, copy, kind);
      el.afterAnnotationLegend.append(card);
    });
  }

  function updateAfterAnnotationBounds() {
    if (!el.afterPreviewImage?.complete || el.afterImageStage.classList.contains("is-hidden")) return;
    const stageRect = el.afterImageStage.getBoundingClientRect();
    const imageRect = el.afterPreviewImage.getBoundingClientRect();
    Object.assign(el.afterAnnotationLayer.style, {
      left: `${imageRect.left - stageRect.left}px`,
      top: `${imageRect.top - stageRect.top}px`,
      width: `${imageRect.width}px`,
      height: `${imageRect.height}px`,
      right: "auto",
      bottom: "auto"
    });
  }

  function seedInvoiceFromAnalysis(analysis) {
    const recommended = numberValue(analysis.price_estimate?.recommended);
    jm.invoice.serviceCall = recommended;
    jm.invoice.description = analysis.customer_note || analysis.task_summary || analysis.title || "";
    jm.invoice.limitations = defaultLimitations(analysis);
  }

  function seedCloseoutFromCompletion() {
    if (!jm.completion) return;
    if (jm.completion.customer_note) {
      jm.invoice.description = jm.completion.customer_note;
      el.serviceDescriptionInput.value = jm.invoice.description;
    }
    const unresolved = jm.completion.unresolved_items || [];
    if (unresolved.length) {
      const unresolvedText = `Unresolved / follow-up: ${unresolved.join(" ")}`;
      if (!jm.invoice.limitations.includes(unresolvedText)) {
        jm.invoice.limitations = [jm.invoice.limitations, unresolvedText].filter(Boolean).join("\n");
        el.limitationsInput.value = jm.invoice.limitations;
      }
    }
  }

  function updateInvoice() {
    capturePartyInputs();
    captureInvoiceInputs();
    const totals = calculateInvoiceTotals();
    el.serviceCallTotal.textContent = money(totals.serviceCall);
    el.laborTotal.textContent = money(totals.labor);
    el.partsMaterialsTotal.textContent = money(totals.partsMaterials);
    el.discountTotal.textContent = `-${money(totals.discount)}`;
    el.taxTotal.textContent = money(totals.tax);
    el.grandTotal.textContent = money(totals.total);
    el.paidTotal.textContent = money(totals.paid);
    el.balanceTotal.textContent = money(totals.balance);
    el.invoiceTotalBadge.textContent = `${money(totals.total)} total`;
    updateServiceReportPreview();
  }

  function capturePartyInputs() {
    const valueOf = (input, fallback = "") => input ? input.value.trim() : fallback;
    jm.party = {
      shopName: valueOf(el.shopNameInput, jm.party.shopName || ""),
      technicianName: valueOf(el.technicianNameInput, jm.party.technicianName || ""),
      customerName: valueOf(el.customerNameInput, jm.party.customerName || ""),
      customerPhone: valueOf(el.customerPhoneInput, jm.party.customerPhone || ""),
      customerEmail: valueOf(el.customerEmailInput, jm.party.customerEmail || ""),
      serviceAddress: valueOf(el.serviceAddressInput, jm.party.serviceAddress || ""),
      vin: valueOf(el.vinInput, jm.party.vin || ""),
      odometer: valueOf(el.odometerInput, jm.party.odometer || "")
    };
    return { ...jm.party };
  }

  function captureInvoiceInputs() {
    if (!el.invoiceNumberInput) return jm.invoice;
    jm.invoice = {
      number: el.invoiceNumberInput.value.trim() || jm.invoice.number || makeInvoiceNumber(),
      serviceDate: el.serviceDateInput.value || localDateString(),
      description: el.serviceDescriptionInput.value.trim(),
      serviceCall: numberValue(el.serviceCallInput.value),
      laborHours: numberValue(el.laborHoursInput.value),
      laborRate: numberValue(el.laborRateInput.value),
      partsAmount: numberValue(el.partsAmountInput.value),
      materialsAmount: numberValue(el.materialsAmountInput.value),
      discount: numberValue(el.discountInput.value),
      taxRate: numberValue(el.taxRateInput.value),
      amountPaid: numberValue(el.amountPaidInput.value),
      paymentStatus: el.paymentStatusInput.value,
      paymentMethod: el.paymentMethodInput.value,
      limitations: el.limitationsInput.value.trim()
    };
    jm.signerName = el.signerNameInput.value.trim();
    jm.customerAcknowledgment = el.customerAcknowledgmentInput.checked;
    jm.technicianSignoff = el.technicianSignoffInput.checked;
    return jm.invoice;
  }

  function calculateInvoiceTotals() {
    const invoice = jm.invoice;
    const serviceCall = Math.max(0, numberValue(invoice.serviceCall));
    const labor = Math.max(0, numberValue(invoice.laborHours)) * Math.max(0, numberValue(invoice.laborRate));
    const partsMaterials = Math.max(0, numberValue(invoice.partsAmount)) + Math.max(0, numberValue(invoice.materialsAmount));
    const subtotal = serviceCall + labor + partsMaterials;
    const discount = Math.min(subtotal, Math.max(0, numberValue(invoice.discount)));
    const taxable = Math.max(0, subtotal - discount);
    const tax = taxable * Math.max(0, numberValue(invoice.taxRate)) / 100;
    const total = taxable + tax;
    const paid = Math.max(0, numberValue(invoice.amountPaid));
    const balance = Math.max(0, total - paid);
    return { serviceCall, labor, partsMaterials, subtotal, discount, taxable, tax, total, paid, balance };
  }

  function updateServiceReportPreview() {
    if (!el.serviceReportPreview) return;
    const vehicle = getVehicleContext();
    const totals = calculateInvoiceTotals();
    const completion = jm.completion;
    const reviews = Object.values(jm.markerReviews);
    const verified = reviews.filter((item) => item.status === "verified").length;
    const incorrect = reviews.filter((item) => item.status === "incorrect").length;
    const needsPhoto = reviews.filter((item) => item.status === "needs_photo").length;
    const business = jm.party.shopName || "FixSight Service Provider";
    const customer = jm.party.customerName || "Customer not entered";
    const description = jm.invoice.description || jm.servicePerformed || core.state.analysis?.customer_note || "Service description pending.";
    const limits = jm.invoice.limitations || defaultLimitations(core.state.analysis || {});
    const beforeImage = core.state.thumbnailDataUrl || core.state.imageDataUrl || "";
    const afterImage = jm.afterThumbnailDataUrl || jm.afterImageDataUrl || "";

    el.serviceReportPreview.innerHTML = `
      <div class="report-document">
        <header class="report-header">
          <div><span class="report-brand">${escapeHtml(business)}</span><h3>Service Report & Invoice</h3></div>
          <div class="report-id"><strong>${escapeHtml(jm.invoice.number || "Draft")}</strong><span>${escapeHtml(jm.invoice.serviceDate || localDateString())}</span></div>
        </header>
        <div class="report-meta-grid">
          <div><span>Customer</span><strong>${escapeHtml(customer)}</strong><small>${escapeHtml(jm.party.customerPhone || jm.party.customerEmail || "No contact entered")}</small></div>
          <div><span>Vehicle</span><strong>${escapeHtml(vehicle.display)}</strong><small>${escapeHtml([jm.party.vin, jm.party.odometer ? `${jm.party.odometer} mi` : ""].filter(Boolean).join(" · ") || "Identifier not entered")}</small></div>
          <div><span>Technician</span><strong>${escapeHtml(jm.party.technicianName || "Not entered")}</strong><small>${escapeHtml(jm.party.serviceAddress || core.el.marketInput?.value || "Service location not entered")}</small></div>
        </div>
        <section class="report-section"><h4>Work performed</h4><p>${escapeHtml(description)}</p></section>
        <div class="report-photo-grid">
          ${beforeImage ? `<figure><img src="${beforeImage}" alt="Before"><figcaption>Before / diagnostic photo</figcaption></figure>` : ""}
          ${afterImage ? `<figure><img src="${afterImage}" alt="After"><figcaption>After / completion photo</figcaption></figure>` : ""}
        </div>
        <div class="report-status-grid">
          <div><span>AI guide</span><strong>${escapeHtml(core.state.analysis?.safety?.headline || "Not generated")}</strong></div>
          <div><span>Marker review</span><strong>${verified} verified · ${incorrect} corrected · ${needsPhoto} need photo</strong></div>
          <div><span>Completion check</span><strong>${escapeHtml(completion ? completionStatusLabel(completion.status) : "Not run")}</strong></div>
        </div>
        <section class="report-section report-limitations"><h4>Limitations / next steps</h4><p>${escapeHtml(limits)}</p></section>
        <div class="report-money-grid">
          <span>Service call <strong>${money(totals.serviceCall)}</strong></span>
          <span>Labor <strong>${money(totals.labor)}</strong></span>
          <span>Parts + materials <strong>${money(totals.partsMaterials)}</strong></span>
          <span>Tax <strong>${money(totals.tax)}</strong></span>
          <span class="report-total">Total <strong>${money(totals.total)}</strong></span>
          <span>Balance <strong>${money(totals.balance)}</strong></span>
        </div>
        <footer class="report-footer">
          <div><span>Payment</span><strong>${escapeHtml(titleCase(jm.invoice.paymentStatus))} · ${escapeHtml(titleCase(jm.invoice.paymentMethod.replaceAll("_", " ")))}</strong></div>
          <div><span>Customer acknowledgment</span><strong>${jm.customerAcknowledgment ? "Recorded" : "Pending"}</strong></div>
          <div><span>Technician sign-off</span><strong>${jm.technicianSignoff ? "Recorded" : "Pending"}</strong></div>
        </footer>
        ${jm.signatureDataUrl ? `<div class="report-signature"><img src="${jm.signatureDataUrl}" alt="Customer signature"><span>${escapeHtml(jm.signerName || customer)}</span></div>` : ""}
        <p class="report-disclaimer">FixSight provides visual documentation and triage support. Vehicle-specific service information, physical inspection, safe lifting practices, and qualified technician judgment remain required.</p>
      </div>`;
  }

  function setupSignaturePad() {
    const canvas = el.signatureCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111820";

    const pointFromEvent = (event) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * (canvas.width / rect.width),
        y: (event.clientY - rect.top) * (canvas.height / rect.height)
      };
    };

    canvas.addEventListener("pointerdown", (event) => {
      signatureDrawing = true;
      signatureLastPoint = pointFromEvent(event);
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!signatureDrawing || !signatureLastPoint) return;
      const point = pointFromEvent(event);
      ctx.beginPath();
      ctx.moveTo(signatureLastPoint.x, signatureLastPoint.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      signatureLastPoint = point;
      event.preventDefault();
    });
    const finish = (event) => {
      if (!signatureDrawing) return;
      signatureDrawing = false;
      signatureLastPoint = null;
      jm.signatureDataUrl = canvas.toDataURL("image/png");
      recordEvent("customer_signature", { recorded: true });
      updateServiceReportPreview();
      schedulePersist();
      try { canvas.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
    };
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", finish);
  }

  function clearSignature() {
    const canvas = el.signatureCanvas;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    jm.signatureDataUrl = "";
    recordEvent("customer_signature", { recorded: false });
    updateServiceReportPreview();
    schedulePersist();
  }

  function restoreSignature() {
    clearSignatureCanvasOnly();
    if (!jm.signatureDataUrl) return;
    const image = new Image();
    image.onload = () => el.signatureCanvas.getContext("2d").drawImage(image, 0, 0, el.signatureCanvas.width, el.signatureCanvas.height);
    image.src = jm.signatureDataUrl;
  }

  function clearSignatureCanvasOnly() {
    if (!el.signatureCanvas) return;
    el.signatureCanvas.getContext("2d").clearRect(0, 0, el.signatureCanvas.width, el.signatureCanvas.height);
  }

  function completeJob() {
    hideError(el.closeoutError);
    capturePartyInputs();
    captureInvoiceInputs();
    const markerCounts = reviewCounts();
    const manualDone = Object.values(jm.manualChecks).every(Boolean);
    const blockers = [];
    if (markerCounts.unreviewed) blockers.push(`${markerCounts.unreviewed} AI marker${markerCounts.unreviewed === 1 ? " is" : "s are"} unreviewed`);
    if (!jm.completion) blockers.push("completion verification has not been run");
    if (jm.completion?.status === "unsafe") blockers.push("the visual completion result is unsafe");
    if (!manualDone) blockers.push("all four technician completion checks are required");
    if (!jm.invoice.description.trim()) blockers.push("a service description is required");
    if (!jm.signerName.trim()) blockers.push("the customer or authorized signer name is required");
    if (!jm.signatureDataUrl) blockers.push("a customer signature is required");
    if (!jm.customerAcknowledgment) blockers.push("customer acknowledgment is not checked");
    if (!jm.technicianSignoff) blockers.push("technician sign-off is not checked");
    const totals = calculateInvoiceTotals();
    if (jm.invoice.paymentStatus === "paid" && totals.balance > 0.009) blockers.push("payment status is Paid but a balance remains");
    if (blockers.length) return showError(el.closeoutError, `Cannot close the job yet: ${blockers.join("; ")}.`);

    jm.jobStatus = jm.completion.status === "likely_complete" ? "completed" : "completed_with_attention";
    jm.completedAt = new Date().toISOString();
    recordEvent("job_completed", { status: jm.jobStatus, invoiceTotal: calculateInvoiceTotals().total });
    updateProgress();
    updateServiceReportPreview();
    persistNow();
    core.showToast("Job marked complete and saved to recent jobs.");
  }

  function printServiceReport() {
    updateServiceReportPreview();
    document.body.classList.add("print-service-report");
    window.print();
    setTimeout(() => document.body.classList.remove("print-service-report"), 600);
  }

  function downloadServiceReport() {
    updateServiceReportPreview();
    const reportHtml = el.serviceReportPreview.innerHTML;
    const title = `${jm.invoice.number || "fixsight-report"} - ${getVehicleContext().display}`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${standaloneReportCss()}</style></head><body>${reportHtml}</body></html>`;
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `${safeFilename(jm.invoice.number || "fixsight-service-report")}.html`);
  }

  async function copyServiceSummary() {
    const text = buildServiceSummary();
    try {
      await navigator.clipboard.writeText(text);
      core.showToast("Service summary copied.");
    } catch {
      fallbackCopy(text);
      core.showToast("Service summary copied.");
    }
  }

  function buildServiceSummary() {
    const totals = calculateInvoiceTotals();
    const vehicle = getVehicleContext().display;
    const verification = jm.completion ? completionStatusLabel(jm.completion.status) : "Not run";
    return `${jm.party.shopName || "FixSight service"}\nInvoice: ${jm.invoice.number}\nCustomer: ${jm.party.customerName || "Not entered"}\nVehicle: ${vehicle}\nWork performed: ${jm.invoice.description || jm.servicePerformed || "Not entered"}\nCompletion check: ${verification}\nLimitations / next steps: ${jm.invoice.limitations || "None entered"}\nTotal: ${money(totals.total)}\nPaid: ${money(totals.paid)}\nBalance: ${money(totals.balance)}`;
  }

  function downloadEvaluation() {
    const analysis = core.state.analysis || null;
    const payload = {
      export_version: "fixsight-evaluation-v1",
      exported_at: new Date().toISOString(),
      job_id: jm.jobId || core.state.currentJobId || null,
      vehicle: getVehicleContext(),
      task: core.state.lastPayload || null,
      model_response: core.state.responseMeta || null,
      analysis,
      marker_reviews: jm.markerReviews,
      step_checks: jm.stepChecks,
      completion_verification: jm.completion,
      completion_model_response: jm.completionMeta,
      events: jm.evaluationEvents,
      privacy_note: "Direct customer fields, images, signature, and payment details are excluded. Free-text task fields and model outputs may still contain user-entered identifiers; review before sharing."
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${safeFilename(jm.invoice.number || "fixsight")}-evaluation.json`);
  }

  function recordEvent(type, details = {}) {
    jm.evaluationEvents.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      eventType: type,
      jobId: jm.jobId || core.state.currentJobId || null,
      analysisResponseId: core.state.responseMeta?.responseId || null,
      details
    });
    if (jm.evaluationEvents.length > 300) jm.evaluationEvents = jm.evaluationEvents.slice(-300);
  }

  function updateProgress() {
    const intakeReady = Boolean(core.state.imageDataUrl && (core.el.concernInput?.value.trim().length || 0) >= 8);
    const hasAnalysis = Boolean(core.state.analysis);
    const counts = reviewCounts();
    const reviewComplete = hasAnalysis && counts.total === counts.reviewed;
    const hasCompletion = Boolean(jm.completion);
    const isComplete = jm.jobStatus === "completed" || jm.jobStatus === "completed_with_attention";
    const statuses = [intakeReady, hasAnalysis, reviewComplete, hasCompletion, isComplete];
    el.jobProgress?.querySelectorAll(".job-progress-step").forEach((button, index) => {
      button.classList.toggle("is-complete", statuses[index]);
      button.classList.toggle("is-active", !statuses[index] && statuses.slice(0, index).every(Boolean));
    });

    if (el.jobStatusBadge) {
      const status = isComplete ? jm.jobStatus : hasCompletion ? "completion_checked" : hasAnalysis ? "in_progress" : "draft";
      el.jobStatusBadge.textContent = titleCase(status.replaceAll("_", " "));
      el.jobStatusBadge.className = `status-pill job-status-${status}`;
    }
    updateMarkerReviewSummary();
  }

  function reviewCounts() {
    const reviews = Object.values(jm.markerReviews);
    return {
      total: reviews.length,
      reviewed: reviews.filter((item) => item.status !== "unreviewed").length,
      unreviewed: reviews.filter((item) => item.status === "unreviewed").length,
      verified: reviews.filter((item) => item.status === "verified").length,
      incorrect: reviews.filter((item) => item.status === "incorrect").length,
      needsPhoto: reviews.filter((item) => item.status === "needs_photo").length
    };
  }

  function updateBeforeComparison(dataUrl) {
    if (!el.comparisonBeforeImage || !dataUrl) return;
    el.comparisonBeforeImage.src = dataUrl;
  }

  function schedulePersist() {
    jm.updatedAt = new Date().toISOString();
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, 220);
  }

  function persistNow() {
    clearTimeout(persistTimer);
    jm.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(CURRENT_JOB_KEY, JSON.stringify(getSnapshot()));
    } catch {
      // The active workflow still works if storage is unavailable.
    }
    syncHistoryJob();
  }

  function syncHistoryJob() {
    const jobId = jm.jobId || core.state.currentJobId;
    if (!jobId) return;
    const history = core.readHistory();
    const index = history.findIndex((job) => job.id === jobId);
    if (index < 0) return;
    history[index].jobMode = getSnapshot();
    history[index].updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(core.HISTORY_KEY, JSON.stringify(history.slice(0, core.MAX_HISTORY)));
      core.renderHistory();
    } catch {
      // Ignore storage quota failures; the current screen remains usable.
    }
  }

  function getSnapshot() {
    capturePartyInputs();
    captureInvoiceInputs();
    return {
      ...jm,
      jobId: jm.jobId || core.state.currentJobId || "",
      repositioningId: "",
      afterImageDataUrl: jm.afterThumbnailDataUrl || jm.afterImageDataUrl || "",
      afterThumbnailDataUrl: jm.afterThumbnailDataUrl || jm.afterImageDataUrl || ""
    };
  }

  function restoreSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
      onAnalysis({ analysis: core.state.analysis, jobId: core.state.currentJobId });
      return;
    }
    jm = mergeSnapshot(snapshot);
    jm.jobId = core.state.currentJobId || snapshot.jobId || "";
    applyStateToInputs();
    el.jobModeSection.classList.remove("is-hidden");
    el.markerReviewPanel.classList.remove("is-hidden");
    decorateAnnotationReviews();
    decorateStepChecks();
    renderCompletion();
    restoreSignature();
    updateInvoice();
    updateProgress();
  }

  function mergeSnapshot(snapshot) {
    const base = createDefaultState();
    return {
      ...base,
      ...snapshot,
      party: { ...base.party, ...(snapshot.party || {}) },
      markerReviews: snapshot.markerReviews || {},
      stepChecks: snapshot.stepChecks || {},
      evaluationEvents: Array.isArray(snapshot.evaluationEvents) ? snapshot.evaluationEvents : [],
      manualChecks: { ...base.manualChecks, ...(snapshot.manualChecks || {}) },
      invoice: { ...base.invoice, ...(snapshot.invoice || {}) }
    };
  }

  function applyStateToInputs() {
    const partyMap = {
      shopNameInput: "shopName",
      technicianNameInput: "technicianName",
      customerNameInput: "customerName",
      customerPhoneInput: "customerPhone",
      customerEmailInput: "customerEmail",
      serviceAddressInput: "serviceAddress",
      vinInput: "vin",
      odometerInput: "odometer"
    };
    for (const [id, key] of Object.entries(partyMap)) if (el[id]) el[id].value = jm.party[key] || "";

    const invoiceMap = {
      invoiceNumberInput: "number",
      serviceDateInput: "serviceDate",
      serviceDescriptionInput: "description",
      serviceCallInput: "serviceCall",
      laborHoursInput: "laborHours",
      laborRateInput: "laborRate",
      partsAmountInput: "partsAmount",
      materialsAmountInput: "materialsAmount",
      discountInput: "discount",
      taxRateInput: "taxRate",
      amountPaidInput: "amountPaid",
      paymentStatusInput: "paymentStatus",
      paymentMethodInput: "paymentMethod",
      limitationsInput: "limitations"
    };
    for (const [id, key] of Object.entries(invoiceMap)) if (el[id]) el[id].value = jm.invoice[key] ?? "";

    if (el.servicePerformedInput) el.servicePerformedInput.value = jm.servicePerformed || "";
    if (el.signerNameInput) el.signerNameInput.value = jm.signerName || "";
    if (el.customerAcknowledgmentInput) el.customerAcknowledgmentInput.checked = Boolean(jm.customerAcknowledgment);
    if (el.technicianSignoffInput) el.technicianSignoffInput.checked = Boolean(jm.technicianSignoff);
    if (el.checkWorkArea) el.checkWorkArea.checked = Boolean(jm.manualChecks.workArea);
    if (el.checkHardware) el.checkHardware.checked = Boolean(jm.manualChecks.hardware);
    if (el.checkHazards) el.checkHazards.checked = Boolean(jm.manualChecks.hazards);
    if (el.checkHandoff) el.checkHandoff.checked = Boolean(jm.manualChecks.handoff);

    if (jm.afterImageDataUrl) setAfterImage(jm.afterImageDataUrl, jm.afterThumbnailDataUrl, jm.afterImageName || "saved-after-photo.jpg");
  }

  function resetJobMode() {
    clearTimeout(persistTimer);
    jm = createDefaultState();
    try { localStorage.removeItem(CURRENT_JOB_KEY); } catch { /* no-op */ }
    if (!initialized) return;
    el.jobModeSection?.classList.add("is-hidden");
    el.markerReviewPanel?.classList.add("is-hidden");
    el.verificationResults?.classList.add("is-hidden");
    clearAfterPhoto({ persist: false });
    clearSignatureCanvasOnly();
    applyStateToInputs();
    updateInvoice();
    updateProgress();
  }

  function getVehicleContext() {
    const year = core.el.yearInput?.value.trim() || "";
    const make = core.el.makeInput?.value.trim() || "";
    const model = core.el.modelInput?.value.trim() || "";
    const engine = core.el.engineInput?.value.trim() || "";
    return {
      year,
      make,
      model,
      engine,
      vinOrPlate: jm.party.vin,
      odometer: jm.party.odometer,
      display: [year, make, model, engine].filter(Boolean).join(" ") || "Vehicle not specified"
    };
  }

  function createAnalysisFingerprint(analysis) {
    const ids = (analysis.annotations || []).map((annotation) => annotation.id).join("|");
    return `${analysis.title || ""}::${analysis.vehicle_summary || ""}::${ids}`;
  }

  function stepKey(step, index) {
    return `${step.order || index + 1}:${step.title || "step"}`;
  }

  function defaultLimitations(analysis) {
    if (analysis?.repair_class === "temporary_support" || analysis?.repair_class === "temporary_repair") {
      return "Temporary stabilization only. This does not restore the original component, seal, mounting system, or manufacturer-specified repair. Limit driving and obtain permanent repair promptly.";
    }
    return "Visual guidance and completion comparison do not replace physical inspection, torque verification, diagnostic testing, or vehicle-specific service information.";
  }

  function completionStatusLabel(status) {
    return ({
      likely_complete: "Likely complete",
      needs_attention: "Needs attention",
      cannot_verify: "Cannot verify",
      unsafe: "Unsafe / stop"
    })[status] || "Not verified";
  }

  function renderSimpleList(container, items, className, iconText) {
    container.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "empty-detail";
      empty.textContent = "No items returned.";
      container.append(empty);
      return;
    }
    for (const item of items) {
      const row = document.createElement("div");
      row.className = className;
      const icon = document.createElement("span");
      icon.textContent = iconText;
      const text = document.createElement("p");
      text.textContent = item;
      row.append(icon, text);
      container.append(row);
    }
  }

  function showError(node, message) {
    if (!node) return;
    node.textContent = message;
    node.classList.remove("is-hidden");
  }

  function hideError(node) {
    if (!node) return;
    node.textContent = "";
    node.classList.add("is-hidden");
  }

  function makeInvoiceNumber() {
    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `FS-${stamp}-${suffix}`;
  }

  function localDateString() {
    const date = new Date();
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }

  function numberValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function money(value) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(numberValue(value));
  }

  function titleCase(value) {
    return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function safeFilename(value) {
    return String(value || "fixsight").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[character]);
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function standaloneReportCss() {
    return `*{box-sizing:border-box}body{margin:0;padding:28px;background:#eef1f4;color:#111;font-family:Arial,sans-serif}.report-document{max-width:960px;margin:auto;padding:34px;background:#fff;border:1px solid #ccd2d8;border-radius:18px}.report-header,.report-footer{display:flex;justify-content:space-between;gap:20px}.report-brand{font-weight:800}.report-header h3{margin:5px 0 0;font-size:30px}.report-id{text-align:right;display:grid}.report-meta-grid,.report-status-grid,.report-photo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:22px}.report-photo-grid{grid-template-columns:repeat(2,1fr)}.report-meta-grid>div,.report-status-grid>div,.report-section,.report-money-grid{padding:15px;border:1px solid #d9dee4;border-radius:12px}.report-meta-grid span,.report-status-grid span{display:block;color:#66707a;font-size:12px;text-transform:uppercase}.report-meta-grid strong,.report-status-grid strong{display:block;margin-top:5px}.report-meta-grid small{display:block;margin-top:4px;color:#66707a}.report-section{margin-top:14px}.report-section h4{margin:0 0 7px}.report-section p{margin:0;line-height:1.55;white-space:pre-line}.report-photo-grid figure{margin:0}.report-photo-grid img{width:100%;max-height:380px;object-fit:contain;background:#111;border-radius:10px}.report-photo-grid figcaption{margin-top:7px;color:#66707a;font-size:12px}.report-money-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.report-money-grid span{display:flex;justify-content:space-between}.report-total{font-size:18px;font-weight:800}.report-footer{margin-top:18px;padding-top:16px;border-top:1px solid #d9dee4}.report-footer div{display:grid;gap:4px}.report-footer span{color:#66707a;font-size:12px}.report-signature{margin-top:22px}.report-signature img{width:280px;height:90px;object-fit:contain;border-bottom:1px solid #111}.report-signature span{display:block;margin-top:4px}.report-disclaimer{margin-top:22px;color:#66707a;font-size:11px;line-height:1.5}@media print{body{padding:0;background:#fff}.report-document{border:0;border-radius:0;max-width:none}.report-photo-grid img{max-height:260px}}@media(max-width:700px){.report-meta-grid,.report-status-grid,.report-money-grid{grid-template-columns:1fr}.report-photo-grid{grid-template-columns:1fr}.report-header,.report-footer{display:grid}.report-id{text-align:left}}`;
  }
})();
