import { NextResponse } from 'next/server';

/**
 * POST /api/generate-art
 *
 * Proxy endpoint for AI art generation (DALL-E or Stability AI).
 * When neither OPENAI_API_KEY nor STABILITY_API_KEY is configured,
 * returns a 503 with a fallback flag so the frontend can use the
 * original NFT artwork instead.
 *
 * Request body:
 *   { provider: 'dalle' | 'stability', prompt: string }
 *
 * Success response:
 *   Proxied JSON from the upstream provider
 *
 * Fallback response (when keys are missing):
 *   { error: string, fallback: true }  — status 503
 */
export async function POST(request: Request) {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    const stabilityKey = process.env.STABILITY_API_KEY;

    if (!openaiKey && !stabilityKey) {
      return NextResponse.json(
        {
          error: 'Art generation not configured. Using original NFT art.',
          fallback: true,
        },
        { status: 503 }
      );
    }

    const { provider, prompt } = (await request.json()) as {
      provider: 'dalle' | 'stability';
      prompt: string;
    };

    if (!provider || !prompt) {
      return NextResponse.json(
        { error: 'Missing required fields: provider, prompt' },
        { status: 400 }
      );
    }

    // ── DALL-E (OpenAI) ──────────────────────────────────────────────
    if (provider === 'dalle') {
      if (!openaiKey) {
        return NextResponse.json(
          { error: 'OPENAI_API_KEY is not configured.' },
          { status: 503 }
        );
      }

      const openaiResponse = await fetch(
        'https://api.openai.com/v1/images/generations',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: 'dall-e-3',
            prompt,
            n: 1,
            size: '1024x1024',
            response_format: 'b64_json',
          }),
        }
      );

      if (!openaiResponse.ok) {
        const errorBody = await openaiResponse.text();
        console.error('[generate-art] OpenAI API error:', errorBody);
        return NextResponse.json(
          { error: 'OpenAI API request failed', details: errorBody },
          { status: openaiResponse.status }
        );
      }

      const data = await openaiResponse.json();
      return NextResponse.json(data);
    }

    // ── Stability AI ─────────────────────────────────────────────────
    if (provider === 'stability') {
      if (!stabilityKey) {
        return NextResponse.json(
          { error: 'STABILITY_API_KEY is not configured.' },
          { status: 503 }
        );
      }

      const stabilityResponse = await fetch(
        'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${stabilityKey}`,
            Accept: 'application/json',
          },
          body: JSON.stringify({
            text_prompts: [{ text: prompt, weight: 1 }],
            cfg_scale: 7,
            steps: 30,
            width: 1024,
            height: 1024,
            samples: 1,
          }),
        }
      );

      if (!stabilityResponse.ok) {
        const errorBody = await stabilityResponse.text();
        console.error('[generate-art] Stability API error:', errorBody);
        return NextResponse.json(
          { error: 'Stability API request failed', details: errorBody },
          { status: stabilityResponse.status }
        );
      }

      const data = await stabilityResponse.json();
      return NextResponse.json(data);
    }

    return NextResponse.json(
      { error: `Unknown provider: ${provider}. Use "dalle" or "stability".` },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[generate-art] Unexpected error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
