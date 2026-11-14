import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/security';

/**
 * POST /api/generate-art
 *
 * Proxy endpoint for AI art generation (DALL-E or Stability AI).
 * When neither OPENAI_API_KEY nor STABILITY_API_KEY is configured,
 * returns a 503 with a fallback flag so the frontend can use the
 * original NFT artwork instead.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`generate-art:${ip}`, 10, 60_000);
    if (rl.limited) {
      return NextResponse.json(
        { error: 'Too many art generation requests. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(rl.resetSeconds) } }
      );
    }

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

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { provider, prompt } = body as {
      provider?: string;
      prompt?: string;
    };

    if (!provider || !prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Missing required fields: provider, prompt' },
        { status: 400 }
      );
    }

    if (prompt.length > 1000) {
      return NextResponse.json(
        { error: 'Prompt exceeds 1,000 character security limit' },
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
          signal: AbortSignal.timeout(30000),
        }
      );

      if (!openaiResponse.ok) {
        console.error('[generate-art] OpenAI API error status:', openaiResponse.status);
        return NextResponse.json(
          { error: 'OpenAI art generation failed. Please try again or use original NFT art.' },
          { status: 502 }
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
          signal: AbortSignal.timeout(30000),
        }
      );

      if (!stabilityResponse.ok) {
        console.error('[generate-art] Stability API error status:', stabilityResponse.status);
        return NextResponse.json(
          { error: 'Stability AI art generation failed. Please try again or use original NFT art.' },
          { status: 502 }
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
    console.error('[generate-art] Unexpected error:', err);
    return NextResponse.json({ error: 'Art generation service temporarily unavailable' }, { status: 500 });
  }
}
