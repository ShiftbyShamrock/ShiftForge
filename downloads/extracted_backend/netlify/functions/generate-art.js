// netlify/functions/generate-art.js
// Proxies art generation to OpenAI (DALL·E 3) or Stability AI.
// Keys live in OPENAI_API_KEY / STABILITY_API_KEY env vars — never in the browser.

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "POST only" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const provider = payload.provider === "stability" ? "stability" : "dalle";
  const prompt = String(payload.prompt || "").slice(0, 3000);
  if (!prompt) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "prompt is required" }) };
  }

  try {
    if (provider === "dalle") {
      if (!process.env.OPENAI_API_KEY) {
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "OPENAI_API_KEY not configured" }) };
      }
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt,
          n: 1,
          size: "1024x1024",
          quality: "standard",
          response_format: "b64_json",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          statusCode: res.status,
          headers: CORS,
          body: JSON.stringify({ error: data?.error?.message || `DALL·E HTTP ${res.status}` }),
        };
      }
      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: "DALL·E returned no image" }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ image: b64, mime: "image/png" }) };
    }

    // Stability AI
    if (!process.env.STABILITY_API_KEY) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "STABILITY_API_KEY not configured" }) };
    }
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("output_format", "png");
    form.append("aspect_ratio", "1:1");
    const res = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
        Accept: "application/json",
      },
      body: form,
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        statusCode: res.status,
        headers: CORS,
        body: JSON.stringify({ error: (data.errors && data.errors.join("; ")) || data.message || `Stability HTTP ${res.status}` }),
      };
    }
    if (!data.image) return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: "Stability returned no image" }) };
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ image: data.image, mime: "image/png" }) };
  } catch (err) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: "Upstream error: " + err.message }) };
  }
};
