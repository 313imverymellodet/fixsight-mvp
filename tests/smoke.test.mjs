import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import test from "node:test";

const ONE_PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nXcAAAAASUVORK5CYII=";

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

async function waitForServer(baseUrl, child, logs) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early with code ${child.exitCode}.\n${logs.join("")}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/status`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out waiting for FixSight.\n${logs.join("")}`);
}

test("demo server supports analysis, completion verification, and Job Mode assets", async (t) => {
  const port = await reservePort();
  const logs = [];
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), OPENAI_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
  t.after(() => {
    if (child.exitCode === null) child.kill("SIGTERM");
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl, child, logs);

  const statusResponse = await fetch(`${baseUrl}/api/status`);
  assert.equal(statusResponse.status, 200);
  const status = await statusResponse.json();
  assert.equal(status.mode, "demo");
  assert.equal(status.apiConfigured, false);

  const appResponse = await fetch(`${baseUrl}/`);
  assert.equal(appResponse.status, 200);
  const appHtml = await appResponse.text();
  assert.match(appHtml, /From first photo to verified repair report/);
  assert.match(appHtml, /id="completionSection"/);
  assert.match(appHtml, /id="closeoutSection"/);

  const jobModeResponse = await fetch(`${baseUrl}/job-mode.js`);
  assert.equal(jobModeResponse.status, 200);
  assert.match(await jobModeResponse.text(), /FixSightJobMode/);

  const analyzeResponse = await fetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      year: "2016",
      make: "Ford",
      model: "Flex SEL",
      taskMode: "Replace component",
      concern: "Replace the battery and verify the terminal order.",
      quickQuestion: "Which terminal goes on first?",
      imageDataUrl: ONE_PIXEL_PNG
    })
  });
  assert.equal(analyzeResponse.status, 200);
  const analyzePayload = await analyzeResponse.json();
  assert.equal(analyzePayload.demo_mode, true);
  assert.ok(Array.isArray(analyzePayload.analysis.annotations));
  assert.ok(analyzePayload.analysis.annotations.length > 0);
  assert.ok(Array.isArray(analyzePayload.analysis.fasteners));

  const verifyResponse = await fetch(`${baseUrl}/api/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vehicle: { display: "2016 Ford Flex SEL" },
      initialAnalysis: analyzePayload.analysis,
      servicePerformed: "Replaced the 12-volt battery and secured both terminals.",
      beforeImageDataUrl: ONE_PIXEL_PNG,
      afterImageDataUrl: ONE_PIXEL_PNG,
      markerReviews: {},
      stepChecks: {},
      manualChecks: {}
    })
  });
  assert.equal(verifyResponse.status, 200);
  const verifyPayload = await verifyResponse.json();
  assert.equal(verifyPayload.demo_mode, true);
  assert.ok(["likely_complete", "needs_attention", "cannot_verify", "unsafe"].includes(verifyPayload.verification.status));
  assert.ok(Array.isArray(verifyPayload.verification.checks));
  assert.ok(Array.isArray(verifyPayload.verification.annotations));
});
