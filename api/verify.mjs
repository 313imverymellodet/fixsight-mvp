// Vercel serverless function: POST /api/verify
import { handleVerify } from "../server.mjs";
import { readJsonBody } from "./_body.mjs";

// Two-image before/after comparison can take 15-30s; allow headroom.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }
  const payload = await readJsonBody(req);
  if (!payload) {
    return res.status(400).json({ error: "Request body must be valid JSON." });
  }
  const result = await handleVerify(payload);
  return res.status(result.status).json(result.body);
}
