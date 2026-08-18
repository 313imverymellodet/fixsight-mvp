// Normalize a Vercel serverless request body into a parsed object.
// Vercel usually parses JSON into req.body, but this stays robust if it
// arrives as a string, a Buffer, or an unparsed stream.
export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === "string") {
    return safeParse(req.body);
  }
  if (Buffer.isBuffer(req.body)) {
    return safeParse(req.body.toString("utf8"));
  }
  // Fall back to reading the raw stream.
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return null;
  return safeParse(Buffer.concat(chunks).toString("utf8"));
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
