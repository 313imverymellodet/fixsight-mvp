import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import net from "node:net";

const projectDir = process.cwd();
const previewDir = path.join(projectDir, "preview");
await fs.mkdir(previewDir, { recursive: true });

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitFor(url, timeout = 12_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // Still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

class CDPClient {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result || {});
        return;
      }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(listener);
  }

  close() {
    this.ws?.close();
  }
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Browser evaluation failed");
  }
  return result.result?.value;
}

async function waitForExpression(client, expression, timeout = 12_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(client, `Boolean(${expression})`)) return;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`Timed out waiting for browser expression: ${expression}`);
}

async function screenshotViewport(client, filename) {
  const capture = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false
  });
  await fs.writeFile(path.join(previewDir, filename), Buffer.from(capture.data, "base64"));
}

async function screenshotElement(client, selector, filename, maxHeight = 2600) {
  const rect = await evaluate(client, `(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { x: Math.max(0, r.left + scrollX), y: Math.max(0, r.top + scrollY), width: Math.max(1, r.width), height: Math.max(1, Math.min(r.height, ${maxHeight})) };
  })()`);
  if (!rect) throw new Error(`Could not find ${selector}`);
  const capture = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { ...rect, scale: 1 }
  });
  await fs.writeFile(path.join(previewDir, filename), Buffer.from(capture.data, "base64"));
}

const appPort = await reservePort();
const debugPort = await reservePort();
const appLogs = [];
const browserLogs = [];
const tempProfile = `/tmp/fixsight-chromium-${process.pid}-${Date.now()}`;
const app = spawn(process.execPath, ["server.mjs"], {
  cwd: projectDir,
  env: { ...process.env, PORT: String(appPort), OPENAI_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
app.stdout.on("data", (chunk) => appLogs.push(chunk.toString()));
app.stderr.on("data", (chunk) => appLogs.push(chunk.toString()));

let browser;
let client;
try {
  const baseUrl = `http://127.0.0.1:${appPort}`;
  await waitFor(`${baseUrl}/api/status`);

  browser = spawn("chromium", [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-proxy-server",
    "--proxy-bypass-list=*",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${tempProfile}`,
    "--window-size=1440,1200",
    "--hide-scrollbars",
    "about:blank"
  ], { stdio: ["ignore", "pipe", "pipe"] });
  browser.stdout.on("data", (chunk) => browserLogs.push(chunk.toString()));
  browser.stderr.on("data", (chunk) => browserLogs.push(chunk.toString()));
  await waitFor(`http://127.0.0.1:${debugPort}/json/version`);

  const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(baseUrl)}`, { method: "PUT" });
  if (!targetResponse.ok) throw new Error(`Could not create Chromium target: ${targetResponse.status}`);
  const target = await targetResponse.json();
  client = new CDPClient(target.webSocketDebuggerUrl);
  await client.connect();

  const errors = [];
  client.on("Runtime.exceptionThrown", (params) => errors.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || "Runtime exception"));
  client.on("Log.entryAdded", (params) => {
    if (["error", "warning"].includes(params.entry?.level)) errors.push(`${params.entry.level}: ${params.entry.text}`);
  });
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Log.enable");
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
  const navigation = await client.send("Page.navigate", { url: baseUrl });
  if (navigation.errorText) throw new Error(`Chromium navigation failed: ${navigation.errorText}`);
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log("Browser URL:", await evaluate(client, "location.href"));
  console.log("Browser title:", await evaluate(client, "document.title"));
  await waitForExpression(client, `document.readyState === "complete" && document.getElementById("loadBatterySampleButton")`);
  await new Promise((resolve) => setTimeout(resolve, 350));

  await evaluate(client, `scrollTo(0, 0)`);
  await screenshotViewport(client, "v0.3-home.png");

  await evaluate(client, `document.getElementById("loadBatterySampleButton").click()`);
  await waitForExpression(client, `document.getElementById("yearInput").value === "2016" && document.getElementById("previewImage").src`);
  await evaluate(client, `document.getElementById("jobForm").requestSubmit()`);
  await waitForExpression(client, `!document.getElementById("resultsSection").classList.contains("is-hidden") && document.querySelectorAll(".annotation-review-card").length > 0`, 18_000);
  await new Promise((resolve) => setTimeout(resolve, 250));
  await evaluate(client, `(() => {
    document.querySelector(".topbar").dataset.previewDisplay = document.querySelector(".topbar").style.display || "";
    document.getElementById("jobProgress").dataset.previewDisplay = document.getElementById("jobProgress").style.display || "";
    document.querySelector(".topbar").style.display = "none";
    document.getElementById("jobProgress").style.display = "none";
  })()`);
  await screenshotElement(client, ".workspace-panel", "v0.3-marker-review.png", 3600);
  await evaluate(client, `(() => {
    const topbar = document.querySelector(".topbar");
    const progress = document.getElementById("jobProgress");
    topbar.style.display = topbar.dataset.previewDisplay || "";
    progress.style.display = progress.dataset.previewDisplay || "";
  })()`);
  await screenshotElement(client, "#resultsSection", "v0.3-visual-guide.png", 2400);

  await evaluate(client, `(() => {
    const firstIncorrect = document.querySelector(".annotation-review-card.review-unreviewed .choice-incorrect");
    if (firstIncorrect) {
      firstIncorrect.click();
      const note = document.querySelector(".annotation-review-card.review-incorrect textarea");
      if (note) {
        note.value = "Technician corrected this marker to the center of the visible clamp area.";
        note.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const reposition = document.querySelector(".annotation-review-card.review-incorrect .reposition-button");
      if (reposition) {
        reposition.click();
        const image = document.getElementById("previewImage");
        const rect = image.getBoundingClientRect();
        document.getElementById("imageStage").dispatchEvent(new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width * 0.33,
          clientY: rect.top + rect.height * 0.29
        }));
      }
    }
    let guard = 0;
    while (guard++ < 40) {
      const button = document.querySelector(".annotation-review-card.review-unreviewed .choice-verified");
      if (!button) break;
      button.click();
    }
    document.querySelectorAll(".step-completion-control input:not(:checked)").forEach((input) => input.click());
  })()`);
  await waitForExpression(client, `document.getElementById("markerReviewCount").textContent.split("/")[0].trim() === document.getElementById("markerReviewCount").textContent.split("/")[1].replace("reviewed", "").trim()`);
  await waitForExpression(client, `Object.values(window.FixSightJobMode.getState().markerReviews).some((review) => review.status === "incorrect" && review.correctedX != null && review.correctedY != null)`);
  await evaluate(client, `document.getElementById("loadDemoAfterButton").click()`);
  await waitForExpression(client, `document.getElementById("afterPreviewImage").src && !document.getElementById("afterImageStage").classList.contains("is-hidden")`);
  await evaluate(client, `document.getElementById("verifyCompletionButton").click()`);
  await waitForExpression(client, `!document.getElementById("verificationResults").classList.contains("is-hidden")`, 18_000);

  await evaluate(client, `(() => {
    const setInput = (id, value) => {
      const node = document.getElementById(id);
      node.value = value;
      node.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setInput("shopNameInput", "Mello 24/7 Car Service");
    setInput("technicianNameInput", "Romello Morris-Oneal");
    setInput("customerNameInput", "Demo Customer");
    setInput("customerPhoneInput", "(313) 555-0100");
    setInput("serviceAddressInput", "Detroit, MI");
    setInput("signerNameInput", "Demo Customer");
    document.querySelectorAll("#completionSection .manual-checks input:not(:checked)").forEach((input) => input.click());
    const canvas = document.getElementById("signatureCanvas");
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(140, 150);
    ctx.bezierCurveTo(250, 35, 330, 235, 445, 105);
    ctx.bezierCurveTo(520, 25, 640, 220, 770, 85);
    ctx.stroke();
    window.FixSightJobMode.getState().signatureDataUrl = canvas.toDataURL("image/png");
    if (!document.getElementById("customerAcknowledgmentInput").checked) document.getElementById("customerAcknowledgmentInput").click();
    if (!document.getElementById("technicianSignoffInput").checked) document.getElementById("technicianSignoffInput").click();
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 350));
  await screenshotElement(client, "#completionSection", "v0.3-completion-check.png", 2800);

  await evaluate(client, `document.getElementById("completeJobButton").click()`);
  await waitForExpression(client, `/Completed/.test(document.getElementById("jobStatusBadge").textContent)`);
  await new Promise((resolve) => setTimeout(resolve, 250));
  await screenshotElement(client, "#serviceReportPreview", "v0.3-service-report.png", 3200);

  await client.send("Emulation.setDeviceMetricsOverride", { width: 430, height: 932, deviceScaleFactor: 1, mobile: true });
  const mobileNavigation = await client.send("Page.navigate", { url: baseUrl });
  if (mobileNavigation.errorText) throw new Error(`Mobile preview navigation failed: ${mobileNavigation.errorText}`);
  await waitForExpression(client, `document.readyState === "complete" && document.getElementById("loadBatterySampleButton")`);
  await new Promise((resolve) => setTimeout(resolve, 350));
  await evaluate(client, `scrollTo(0, 0)`);
  await screenshotViewport(client, "v0.3-mobile-home.png");

  if (errors.length) {
    throw new Error(`Browser console issues:\n${errors.join("\n")}`);
  }

  console.log("Created FixSight v0.3 browser previews:");
  for (const name of ["v0.3-home.png", "v0.3-mobile-home.png", "v0.3-marker-review.png", "v0.3-visual-guide.png", "v0.3-completion-check.png", "v0.3-service-report.png"]) {
    console.log(`- ${path.join(previewDir, name)}`);
  }
} finally {
  client?.close();
  if (browser?.exitCode === null) browser.kill("SIGTERM");
  if (app.exitCode === null) app.kill("SIGTERM");
  await fs.rm(tempProfile, { recursive: true, force: true }).catch(() => {});
}
