import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/security';

/**
 * POST /api/forge-analyze
 *
 * Proxy endpoint for Claude AI forge analysis.
 * When ANTHROPIC_API_KEY is not configured, returns a 503 with a fallback
 * flag so the frontend can use its local Forge analyzer instead.
 */
export async function GET() {
  return NextResponse.json({ configured: Boolean(process.env.ANTHROPIC_API_KEY) });
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`forge-analyze:${ip}`, 15, 60_000);
    if (rl.limited) {
      return NextResponse.json(
        { error: 'Too many analysis requests. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(rl.resetSeconds) } }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'AI analysis not configured. Using local Forge analyzer.',
          fallback: true,
        },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { prompt, imageBase64, imageMime } = body as {
      prompt?: string;
      imageBase64?: string;
      imageMime?: string;
    };

    if (!prompt || typeof prompt !== 'string' || !imageBase64 || typeof imageBase64 !== 'string' || !imageMime) {
      return NextResponse.json(
        { error: 'Missing required fields: prompt, imageBase64, imageMime' },
        { status: 400 }
      );
    }

    if (prompt.length > 4000) {
      return NextResponse.json({ error: 'Prompt exceeds maximum length' }, { status: 400 });
    }

    if (imageBase64.length > 8 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image exceeds maximum 8MB size limit' }, { status: 413 });
    }

    /** Proxy the request to the Anthropic Messages API */
    const anthropicResponse = await fetch(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1300,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: imageMime,
                    data: imageBase64,
                  },
                },
                {
                  type: 'text',
                  text: prompt,
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(20000),
      }
    );

    if (!anthropicResponse.ok) {
      console.error('[forge-analyze] Anthropic API error status:', anthropicResponse.status);
      return NextResponse.json(
        { error: 'AI analysis service temporarily unavailable', fallback: true },
        { status: 503 }
      );
    }

    const data = (await anthropicResponse.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const text = data.content?.find((c) => c.type === 'text')?.text || '';

    return NextResponse.json({ text });
  } catch (err: unknown) {
    console.error('[forge-analyze] Unexpected error:', err);
    return NextResponse.json(
      { error: 'AI analysis temporarily unavailable', fallback: true },
      { status: 503 }
    );
  }
}
