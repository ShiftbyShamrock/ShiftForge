import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    app: 'SHIFT Forge',
    heliusKeyConfigured: true,
    version: '2.0.1',
    timestamp: new Date().toISOString(),
  });
}
