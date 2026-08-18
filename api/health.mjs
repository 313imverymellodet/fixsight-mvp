// Vercel serverless function: GET /api/health
export default function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).json({ error: "Method not allowed." });
  }
  return res.status(200).json({ ok: true, service: "fixsight", version: "0.3.0" });
}
