'use client';

import { useState, useEffect, useRef } from 'react';

interface ForgeClientProps {
  styleContent: string;
  cleanBodyContent: string;
  inlineScript: string;
}

/**
 * Dynamically loads an external script and returns a Promise.
 */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Deduplicate: if a script with this src already exists, resolve immediately
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(el);
  });
}

export default function ForgeClient({ styleContent, cleanBodyContent, inlineScript }: ForgeClientProps) {
  const [mounted, setMounted] = useState(false);
  const scriptRan = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Once mounted (DOM is committed), load external libs then run the forge script
  useEffect(() => {
    if (!mounted || scriptRan.current || !inlineScript) return;
    scriptRan.current = true;

    (async () => {
      // Step 1: Load Buffer polyfill (self-hosted UMD bundle)
      try {
        await loadScript('/buffer-standalone.js');
        const g = window as any;
        if (g.buffer && g.buffer.Buffer) {
          g.Buffer = g.buffer.Buffer;
        }
        console.log('Buffer polyfill loaded, window.Buffer:', !!(g as any).Buffer);
      } catch {
        console.warn('Self-hosted buffer failed, trying bundle.run CDN...');
        try {
          await loadScript('https://bundle.run/buffer@6.0.3');
          const g = window as any;
          if (g.buffer && g.buffer.Buffer) {
            g.Buffer = g.buffer.Buffer;
            console.log('Buffer loaded from bundle.run CDN fallback.');
          }
        } catch {
          console.error('All Buffer polyfill sources failed.');
        }
      }

      // Step 2: Load Solana Web3.js
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/@solana/web3.js@1.98.0/lib/index.iife.min.js');
        console.log('Solana Web3 loaded.');
      } catch {
        console.warn('jsDelivr Solana Web3 failed, trying unpkg...');
        try {
          await loadScript('https://unpkg.com/@solana/web3.js@1.98.0/lib/index.iife.min.js');
          console.log('Solana Web3 loaded from unpkg fallback.');
        } catch {
          console.error('All Solana Web3 sources failed.');
        }
      }

      // Step 3: Wait one animation frame to ensure DOM paint is complete
      await new Promise<void>(r => requestAnimationFrame(() => r()));

      // Step 4: Execute the inline forge app script
      try {
        const fn = new Function(inlineScript);
        fn();
        console.log('Forge app script initialized.');
      } catch (e) {
        console.error('Forge script initialization error:', e);
      }
    })();
  }, [mounted, inlineScript]);

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
      <div dangerouslySetInnerHTML={{ __html: cleanBodyContent }} />
    </>
  );
}
