'use client';

import { useState, useEffect } from 'react';
import Script from 'next/script';

interface ForgeClientProps {
  styleContent: string;
  cleanBodyContent: string;
  inlineScript: string;
}

export default function ForgeClient({ styleContent, cleanBodyContent, inlineScript }: ForgeClientProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div style={{
        background: '#0a0d14',
        color: '#ffffff',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          fontSize: '28px',
          fontWeight: 800,
          letterSpacing: '2px',
          marginBottom: '8px',
          background: 'linear-gradient(45deg, #EF9F27, #FAC775)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          SHIFT FORGE
        </div>
        <div style={{ fontSize: '13px', color: '#85b7eb', opacity: 0.8, letterSpacing: '1px' }}>
          LOADING ecosystem assets…
        </div>
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styleContent }} />
      {/* Solana Web3.js loaded with jsDelivr CDN and unpkg fallback */}
      <Script
        src="https://cdn.jsdelivr.net/npm/@solana/web3.js@1.98.0/lib/index.iife.min.js"
        strategy="afterInteractive"
        onError={(e) => {
          console.error('Failed to load Solana Web3 from jsDelivr, falling back to unpkg...', e);
          const fallbackScript = document.createElement('script');
          fallbackScript.src = 'https://unpkg.com/@solana/web3.js@1.98.0/lib/index.iife.min.js';
          document.head.appendChild(fallbackScript);
        }}
      />
      <div dangerouslySetInnerHTML={{ __html: cleanBodyContent }} />
      {/* Inline app script — runs after DOM is ready and Web3 is loaded */}
      <Script
        id="shift-forge-app"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: inlineScript }}
      />
    </>
  );
}
