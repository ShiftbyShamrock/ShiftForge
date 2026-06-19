import { NextResponse } from 'next/server';

/**
 * POST /api/forge-analyze
 *
 * Proxy endpoint for Claude AI forge analysis.
 * When ANTHROPIC_API_KEY is not configured, returns a 503 with a fallback
 * flag so the frontend can use its local Forge analyzer instead.
 *
 * Request body:
 *   { prompt: string, imageBase64: string, imageMime: string }
 *
 * Success response (when key is present):
 *   { text: string }
 *
 * Fallback response (when key is missing):
 *   { error: string, fallback: true }  — status 503
 */
export async function POST(request: Request) {
  try {
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

    const { prompt, imageBase64, imageMime } = (await request.json()) as {
      prompt: string;
      imageBase64: string;
      imageMime: string;
    };

    if (!prompt || !imageBase64 || !imageMime) {
      return NextResponse.json(
        { error: 'Missing required fields: prompt, imageBase64, imageMime' },
        { status: 400 }
      );
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
      }
    );

    if (!anthropicResponse.ok) {
      const errorBody = await anthropicResponse.text();
      console.error('[forge-analyze] Anthropic API error:', errorBody);
      return NextResponse.json(
        { error: 'Claude API request failed', details: errorBody },
        { status: anthropicResponse.status }
      );
    }

    const data = (await anthropicResponse.json()) as {
      content: { type: string; text: string }[];
    };
    const responseText =
      data.content?.find((block) => block.type === 'text')?.text ?? '';

    return NextResponse.json({ text: responseText });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[forge-analyze] Unexpected error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
