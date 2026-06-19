import { readFileSync } from 'fs';
import { join } from 'path';
import Script from 'next/script';

/**
 * The Forge page — serves the complete SHIFT Forge HTML app.
 * This preserves the existing v20 HTML (styles, JS, canvas rendering)
 * as a Next.js page while enabling API routes at /api/*.
 *
 * External CDN scripts (Solana Web3.js) are loaded via Next.js <Script>
 * to ensure they execute in the browser — dangerouslySetInnerHTML does
 * not run <script> tags.
 */
export default function ForgePage() {
  // Read the Forge HTML at build time
  const forgeHtml = readFileSync(
    join(process.cwd(), 'shift-forge-v20.html'),
    'utf-8'
  );

  // Extract the content between <body> and </body>
  const bodyMatch = forgeHtml.match(/<body>([\s\S]*?)<\/body>/);
  const bodyContent = bodyMatch ? bodyMatch[1] : '';

  // Extract the <style> block
  const styleMatch = forgeHtml.match(/<style>([\s\S]*?)<\/style>/);
  const styleContent = styleMatch ? styleMatch[1] : '';

  // Extract inline <script> content (the main SHIFT Forge app logic)
  // but strip out any <script src="..."> CDN tags — those are loaded via Next.js <Script>
  const inlineScriptMatch = bodyContent.match(/<script>([\s\S]*?)<\/script>/);
  const inlineScript = inlineScriptMatch ? inlineScriptMatch[1] : '';

  // Remove ALL <script> tags from the body content to avoid broken dangerouslySetInnerHTML scripts
  const cleanBodyContent = bodyContent
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, function(match) {
      // Keep non-script-related comments
      if (match.toLowerCase().includes('solana') || match.toLowerCase().includes('script')) return '';
      return match;
    });

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styleContent }} />
      {/* Solana Web3.js must load BEFORE the inline script runs */}
      <Script
        src="https://unpkg.com/@solana/web3.js@1.98.0/lib/index.iife.min.js"
        strategy="beforeInteractive"
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
