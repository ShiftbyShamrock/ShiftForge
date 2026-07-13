// netlify/functions/forge-analyze.js
// Proxies SHIFT Forge analysis requests to the Anthropic API.
// The API key lives in the ANTHROPIC_API_KEY environment variable — never in the browser.

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "POST only" }) };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { prompt, imageBase64, imageMime } = payload;
  if (!prompt || !imageBase64) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "prompt and imageBase64 are required" }) };
  }
  // basic size guard (~7MB of base64)
  if (imageBase64.length > 10_000_000) {
    return { statusCode: 413, headers: CORS, body: JSON.stringify({ error: "Image too large" }) };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
        max_tokens: 1300,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: imageMime || "image/jpeg", data: imageBase64 },
              },
              { type: "text", text: String(prompt).slice(0, 20000) },
            ],
          },
        ],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        statusCode: res.status,
        headers: CORS,
        body: JSON.stringify({ error: data?.error?.message || `Anthropic HTTP ${res.status}` }),
      };
    }

    const text = (data.content || []).map((c) => c.text || "").join("");
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ text }) };
  } catch (err) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: "Upstream error: " + err.message }) };
  }
};
